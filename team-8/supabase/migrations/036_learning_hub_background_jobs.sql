ALTER TABLE public.student_subject_study_plans
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS pending_mastery_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error text;

UPDATE public.student_subject_study_plans
SET
  status = COALESCE(status, 'ready'),
  pending_mastery_updated_at = COALESCE(pending_mastery_updated_at, mastery_updated_at),
  requested_at = COALESCE(requested_at, generated_at, now())
WHERE
  pending_mastery_updated_at IS NULL
  OR requested_at IS NULL
  OR status IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_subject_study_plans_status
  ON public.student_subject_study_plans(status, requested_at);

ALTER TABLE public.student_practice_exams
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('building', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS build_error text,
  ADD COLUMN IF NOT EXISTS build_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

UPDATE public.student_practice_exams
SET
  status = COALESCE(status, 'ready'),
  build_requested_at = COALESCE(build_requested_at, created_at, now()),
  ready_at = COALESCE(ready_at, updated_at, created_at, now())
WHERE
  build_requested_at IS NULL
  OR ready_at IS NULL
  OR status IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_practice_exams_status
  ON public.student_practice_exams(status, build_requested_at);

ALTER TABLE public.student_practice_attempts
  ADD COLUMN IF NOT EXISTS draft_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS draft_saved_at timestamptz;

UPDATE public.student_practice_attempts
SET draft_answers = COALESCE(draft_answers, '{}'::jsonb)
WHERE draft_answers IS NULL;

CREATE OR REPLACE FUNCTION public.finalize_student_practice_exam_build(
  p_practice_exam_id uuid,
  p_questions jsonb DEFAULT '[]'::jsonb,
  p_generated_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_practice_exam public.student_practice_exams%ROWTYPE;
  v_question_count integer;
  v_max_score numeric(8,2);
BEGIN
  IF p_practice_exam_id IS NULL THEN
    RAISE EXCEPTION 'practice_exam_id is required';
  END IF;

  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION 'p_questions must be a JSON array';
  END IF;

  v_question_count := jsonb_array_length(p_questions);
  IF v_question_count <= 0 THEN
    RAISE EXCEPTION 'practice exam requires at least one question';
  END IF;

  SELECT *
  INTO v_practice_exam
  FROM public.student_practice_exams
  WHERE id = p_practice_exam_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice exam not found';
  END IF;

  DELETE FROM public.student_practice_attempts
  WHERE practice_exam_id = p_practice_exam_id;

  DELETE FROM public.student_practice_questions
  WHERE practice_exam_id = p_practice_exam_id;

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
    p_practice_exam_id,
    v_practice_exam.subject_id,
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
    max_score,
    draft_answers,
    draft_saved_at
  )
  VALUES (
    p_practice_exam_id,
    v_practice_exam.student_id,
    'in_progress',
    1,
    v_max_score,
    '{}'::jsonb,
    NULL
  );

  UPDATE public.student_practice_exams
  SET
    question_count = v_question_count,
    generated_metadata = COALESCE(v_practice_exam.generated_metadata, '{}'::jsonb) || COALESCE(p_generated_metadata, '{}'::jsonb),
    status = 'ready',
    build_error = NULL,
    ready_at = now(),
    updated_at = now()
  WHERE id = p_practice_exam_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_student_practice_exam_build(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_student_practice_exam_build(uuid, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_student_practice_exam_build(uuid, jsonb, jsonb) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.finalize_student_practice_exam_build(uuid, jsonb, jsonb) TO service_role';
  END IF;
END;
$$;
