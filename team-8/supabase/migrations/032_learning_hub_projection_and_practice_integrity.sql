-- =============================================
-- Migration 032: Learning Hub projection + practice integrity hardening
-- 1. Replace mastery projection atomically
-- 2. Enforce single attempt per practice exam
-- 3. Create transactional practice bundle RPC
-- =============================================

WITH ranked_attempts AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY practice_exam_id
      ORDER BY started_at DESC NULLS LAST, attempt_number DESC, id DESC
    ) AS row_num
  FROM public.student_practice_attempts
)
DELETE FROM public.student_practice_attempts AS student_practice_attempts
USING ranked_attempts
WHERE ranked_attempts.id = student_practice_attempts.id
  AND ranked_attempts.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_practice_attempts_one_attempt_per_exam
  ON public.student_practice_attempts(practice_exam_id);

CREATE OR REPLACE FUNCTION public.replace_student_topic_mastery_projection(
  p_student_id uuid,
  p_subject_id uuid DEFAULT NULL,
  p_rows jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upserted_count integer := 0;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'p_student_id is required';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  WITH incoming AS (
    SELECT
      row.student_id::uuid AS student_id,
      row.subject_id::uuid AS subject_id,
      row.topic_key::text AS topic_key,
      row.topic_label::text AS topic_label,
      COALESCE(row.official_correct_points, 0)::numeric(8,2) AS official_correct_points,
      COALESCE(row.official_total_points, 0)::numeric(8,2) AS official_total_points,
      COALESCE(row.practice_correct_points, 0)::numeric(8,2) AS practice_correct_points,
      COALESCE(row.practice_total_points, 0)::numeric(8,2) AS practice_total_points,
      COALESCE(row.official_question_count, 0)::integer AS official_question_count,
      COALESCE(row.practice_question_count, 0)::integer AS practice_question_count,
      COALESCE(row.mastery_score, 0)::numeric(5,2) AS mastery_score,
      COALESCE(row.updated_at, now())::timestamptz AS updated_at
    FROM jsonb_to_recordset(p_rows) AS row(
      student_id text,
      subject_id text,
      topic_key text,
      topic_label text,
      official_correct_points numeric,
      official_total_points numeric,
      practice_correct_points numeric,
      practice_total_points numeric,
      official_question_count integer,
      practice_question_count integer,
      mastery_score numeric,
      updated_at timestamptz
    )
    WHERE row.student_id::uuid = p_student_id
      AND (p_subject_id IS NULL OR row.subject_id::uuid = p_subject_id)
  ),
  upserted AS (
    INSERT INTO public.student_topic_mastery (
      student_id,
      subject_id,
      topic_key,
      topic_label,
      official_correct_points,
      official_total_points,
      practice_correct_points,
      practice_total_points,
      official_question_count,
      practice_question_count,
      mastery_score,
      updated_at
    )
    SELECT
      incoming.student_id,
      incoming.subject_id,
      incoming.topic_key,
      incoming.topic_label,
      incoming.official_correct_points,
      incoming.official_total_points,
      incoming.practice_correct_points,
      incoming.practice_total_points,
      incoming.official_question_count,
      incoming.practice_question_count,
      incoming.mastery_score,
      incoming.updated_at
    FROM incoming
    ON CONFLICT (student_id, subject_id, topic_key)
    DO UPDATE SET
      topic_label = EXCLUDED.topic_label,
      official_correct_points = EXCLUDED.official_correct_points,
      official_total_points = EXCLUDED.official_total_points,
      practice_correct_points = EXCLUDED.practice_correct_points,
      practice_total_points = EXCLUDED.practice_total_points,
      official_question_count = EXCLUDED.official_question_count,
      practice_question_count = EXCLUDED.practice_question_count,
      mastery_score = EXCLUDED.mastery_score,
      updated_at = EXCLUDED.updated_at
    RETURNING 1
  )
  SELECT count(*) INTO v_upserted_count FROM upserted;

  WITH incoming AS (
    SELECT
      row.subject_id::uuid AS subject_id,
      row.topic_key::text AS topic_key
    FROM jsonb_to_recordset(p_rows) AS row(
      student_id text,
      subject_id text,
      topic_key text
    )
    WHERE row.student_id::uuid = p_student_id
      AND (p_subject_id IS NULL OR row.subject_id::uuid = p_subject_id)
  )
  DELETE FROM public.student_topic_mastery AS student_topic_mastery
  WHERE student_topic_mastery.student_id = p_student_id
    AND (p_subject_id IS NULL OR student_topic_mastery.subject_id = p_subject_id)
    AND NOT EXISTS (
      SELECT 1
      FROM incoming
      WHERE incoming.subject_id = student_topic_mastery.subject_id
        AND incoming.topic_key = student_topic_mastery.topic_key
    );

  RETURN v_upserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_student_topic_mastery_projection(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_student_topic_mastery_projection(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.replace_student_topic_mastery_projection(uuid, uuid, jsonb) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.replace_student_topic_mastery_projection(uuid, uuid, jsonb) TO service_role';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_student_practice_exam_bundle(
  p_student_id uuid,
  p_subject_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_selected_topics jsonb DEFAULT '[]'::jsonb,
  p_generated_metadata jsonb DEFAULT '{}'::jsonb,
  p_questions jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_practice_exam_id uuid;
  v_question_count integer;
  v_max_score numeric(8,2);
BEGIN
  IF p_student_id IS NULL OR p_subject_id IS NULL THEN
    RAISE EXCEPTION 'student_id and subject_id are required';
  END IF;

  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION 'p_questions must be a JSON array';
  END IF;

  v_question_count := jsonb_array_length(p_questions);
  IF v_question_count <= 0 THEN
    RAISE EXCEPTION 'practice exam requires at least one question';
  END IF;

  INSERT INTO public.student_practice_exams (
    student_id,
    subject_id,
    title,
    description,
    selected_topics,
    question_count,
    generated_metadata
  )
  VALUES (
    p_student_id,
    p_subject_id,
    p_title,
    p_description,
    COALESCE(p_selected_topics, '[]'::jsonb),
    v_question_count,
    COALESCE(p_generated_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_practice_exam_id;

  INSERT INTO public.student_practice_questions (
    practice_exam_id,
    subject_id,
    source_type,
    source_question_bank_id,
    topic_key,
    subtopic,
    type,
    content,
    content_html,
    image_url,
    options,
    correct_answer,
    points,
    order_index,
    explanation
  )
  SELECT
    v_practice_exam_id,
    p_subject_id,
    row.source_type::text,
    NULLIF(row.source_question_bank_id, '')::uuid,
    row.topic_key::text,
    NULLIF(row.subtopic, '')::text,
    row.type::text,
    row.content::text,
    NULLIF(row.content_html, '')::text,
    NULLIF(row.image_url, '')::text,
    row.options,
    NULLIF(row.correct_answer, '')::text,
    COALESCE(row.points, 1)::numeric(5,2),
    COALESCE(row.order_index, 0)::integer,
    NULLIF(row.explanation, '')::text
  FROM jsonb_to_recordset(p_questions) AS row(
    source_type text,
    source_question_bank_id text,
    topic_key text,
    subtopic text,
    type text,
    content text,
    content_html text,
    image_url text,
    options jsonb,
    correct_answer text,
    points numeric,
    order_index integer,
    explanation text
  )
  ORDER BY row.order_index;

  SELECT
    COALESCE(SUM(COALESCE(row.points, 1)), 0)::numeric(8,2)
  INTO v_max_score
  FROM jsonb_to_recordset(p_questions) AS row(points numeric);

  INSERT INTO public.student_practice_attempts (
    practice_exam_id,
    student_id,
    status,
    attempt_number,
    max_score
  )
  VALUES (
    v_practice_exam_id,
    p_student_id,
    'in_progress',
    1,
    v_max_score
  );

  RETURN v_practice_exam_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_student_practice_exam_bundle(uuid, uuid, text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_student_practice_exam_bundle(uuid, uuid, text, text, jsonb, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_student_practice_exam_bundle(uuid, uuid, text, text, jsonb, jsonb, jsonb) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_student_practice_exam_bundle(uuid, uuid, text, text, jsonb, jsonb, jsonb) TO service_role';
  END IF;
END $$;
