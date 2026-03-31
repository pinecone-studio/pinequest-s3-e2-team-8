-- =============================================
-- Migration 034: Optimize finalize_exam_session_atomic
-- Submit hot path: remove per-answer grading loop and
-- collapse grading into set-based statements.
-- =============================================

CREATE OR REPLACE FUNCTION public.try_parse_jsonb(p_value TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_result := p_value::jsonb;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_exam_text_answer(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(COALESCE(p_value, '')));
$$;

CREATE OR REPLACE FUNCTION public.normalize_exam_answer_array(p_value TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_parsed JSONB;
BEGIN
  v_parsed := public.try_parse_jsonb(p_value);

  IF jsonb_typeof(v_parsed) = 'array' THEN
    RETURN COALESCE(
      (
        SELECT jsonb_agg(val ORDER BY val)
        FROM (
          SELECT lower(trim(both '"' FROM elem::text)) AS val
          FROM jsonb_array_elements(v_parsed) AS elem
          WHERE trim(both '"' FROM elem::text) <> ''
        ) normalized
      ),
      '[]'::jsonb
    );
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(val ORDER BY val)
      FROM (
        SELECT lower(trim(part)) AS val
        FROM unnest(string_to_array(COALESCE(p_value, ''), ',')) AS part
        WHERE trim(part) <> ''
      ) normalized
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.grade_exam_matching_answer(
  p_submitted TEXT,
  p_options JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_submitted JSONB := COALESCE(public.try_parse_jsonb(p_submitted), '{}'::jsonb);
  v_option TEXT;
  v_left_key TEXT;
  v_expected TEXT;
BEGIN
  IF p_options IS NULL
     OR jsonb_typeof(p_options) <> 'array'
     OR jsonb_array_length(p_options) = 0
     OR jsonb_typeof(v_submitted) <> 'object' THEN
    RETURN FALSE;
  END IF;

  FOR v_option IN
    SELECT jsonb_array_elements_text(p_options)
  LOOP
    v_left_key := split_part(v_option, '|||', 1);
    v_expected := public.normalize_exam_text_answer(split_part(v_option, '|||', 2));

    IF v_left_key = '' OR v_expected = '' THEN
      CONTINUE;
    END IF;

    IF public.normalize_exam_text_answer(v_submitted ->> v_left_key) <> v_expected THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_exam_session_atomic(
  p_session_id UUID,
  p_user_id UUID,
  p_answers JSONB DEFAULT '[]'::jsonb,
  p_reason TEXT DEFAULT 'submitted'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_exam_id UUID;
  v_snapshot JSONB;
  v_questions JSONB := '[]'::jsonb;
  v_total_score NUMERIC(7,2) := 0;
  v_max_score NUMERIC(7,2) := 0;
  v_has_essay BOOLEAN := false;
  v_final_status TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT es.id, es.exam_id, es.status, es.total_score, es.max_score
  INTO v_session
  FROM public.exam_sessions es
  WHERE es.id = p_session_id
    AND es.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  IF v_session.status <> 'in_progress' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_finalized', true,
      'final_status', v_session.status,
      'total_score', COALESCE(v_session.total_score, 0),
      'max_score', COALESCE(v_session.max_score, 0)
    );
  END IF;

  v_exam_id := v_session.exam_id;

  IF COALESCE(jsonb_typeof(p_answers) = 'array', false)
     AND jsonb_array_length(p_answers) > 0 THEN
    INSERT INTO public.answers (
      session_id,
      question_id,
      user_id,
      answer,
      first_answered_at,
      last_changed_at,
      change_count
    )
    SELECT
      p_session_id,
      row.question_id,
      p_user_id,
      row.answer,
      row.first_answered_at,
      row.last_changed_at,
      COALESCE(row.change_count, 0)
    FROM jsonb_to_recordset(p_answers) AS row(
      question_id UUID,
      answer TEXT,
      first_answered_at TIMESTAMPTZ,
      last_changed_at TIMESTAMPTZ,
      change_count INTEGER
    )
    ON CONFLICT (session_id, question_id) DO UPDATE SET
      answer = EXCLUDED.answer,
      first_answered_at = COALESCE(EXCLUDED.first_answered_at, answers.first_answered_at),
      last_changed_at = COALESCE(EXCLUDED.last_changed_at, answers.last_changed_at),
      change_count = GREATEST(EXCLUDED.change_count, answers.change_count);
  END IF;

  SELECT e.published_snapshot
  INTO v_snapshot
  FROM public.exams e
  WHERE e.id = v_exam_id;

  IF v_snapshot IS NOT NULL AND v_snapshot->'questions' IS NOT NULL THEN
    v_questions := COALESCE(v_snapshot->'questions', '[]'::jsonb);
    v_max_score := COALESCE((v_snapshot->'stats'->>'total_points')::numeric, 0);
    v_has_essay := COALESCE((v_snapshot->'stats'->>'has_essay_questions')::boolean, false);

    IF v_max_score = 0 THEN
      SELECT COALESCE(SUM((row.points)::numeric), 0)
      INTO v_max_score
      FROM jsonb_to_recordset(v_questions) AS row(points numeric);
    END IF;
  ELSE
    SELECT
      COALESCE(SUM(q.points), 0),
      COALESCE(bool_or(q.type = 'essay'), false),
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'type', q.type,
            'points', q.points,
            'correct_answer', q.correct_answer,
            'options', q.options
          )
          ORDER BY q.order_index
        ),
        '[]'::jsonb
      )
    INTO v_max_score, v_has_essay, v_questions
    FROM public.questions q
    WHERE q.exam_id = v_exam_id;
  END IF;

  WITH snapshot_questions AS (
    SELECT
      row.id AS question_id,
      row.type AS question_type,
      COALESCE(row.points, 0)::numeric(7,2) AS question_points,
      row.correct_answer AS correct_answer,
      row.options AS options_json
    FROM jsonb_to_recordset(v_questions) AS row(
      id UUID,
      type TEXT,
      points NUMERIC,
      correct_answer TEXT,
      options JSONB
    )
  ),
  answer_source AS (
    SELECT
      a.id AS answer_id,
      COALESCE(var.type, sq.question_type) AS question_type,
      COALESCE(sq.question_points, 0)::numeric(7,2) AS question_points,
      a.answer AS submitted_answer,
      COALESCE(var.correct_answer, sq.correct_answer) AS correct_answer,
      COALESCE(var.options, sq.options_json) AS options_json,
      COALESCE(a.score, 0)::numeric(7,2) AS existing_score
    FROM public.answers a
    JOIN snapshot_questions sq
      ON sq.question_id = a.question_id
    LEFT JOIN public.exam_session_question_variants var
      ON var.session_id = p_session_id
     AND var.question_id = a.question_id
    WHERE a.session_id = p_session_id
  ),
  graded_rows AS (
    SELECT
      source.answer_id,
      source.question_type,
      CASE
        WHEN source.question_type IN ('multiple_choice', 'fill_blank')
          THEN public.normalize_exam_text_answer(source.submitted_answer)
             = public.normalize_exam_text_answer(source.correct_answer)
        WHEN source.question_type = 'multiple_response'
          THEN public.normalize_exam_answer_array(source.submitted_answer)
             = public.normalize_exam_answer_array(source.correct_answer)
        WHEN source.question_type = 'matching'
          THEN public.grade_exam_matching_answer(
            source.submitted_answer,
            source.options_json
          )
        ELSE NULL
      END AS graded_is_correct,
      CASE
        WHEN source.question_type = 'essay' THEN source.existing_score
        WHEN source.question_type IN ('multiple_choice', 'fill_blank')
          AND public.normalize_exam_text_answer(source.submitted_answer)
            = public.normalize_exam_text_answer(source.correct_answer)
          THEN source.question_points
        WHEN source.question_type = 'multiple_response'
          AND public.normalize_exam_answer_array(source.submitted_answer)
            = public.normalize_exam_answer_array(source.correct_answer)
          THEN source.question_points
        WHEN source.question_type = 'matching'
          AND public.grade_exam_matching_answer(
            source.submitted_answer,
            source.options_json
          )
          THEN source.question_points
        ELSE 0::numeric(7,2)
      END AS graded_score
    FROM answer_source source
  ),
  updated_answers AS (
    UPDATE public.answers answer_row
    SET is_correct = graded.graded_is_correct,
        score = graded.grading_score
    FROM (
      SELECT
        answer_id,
        graded_is_correct,
        graded_score AS grading_score,
        question_type
      FROM graded_rows
    ) graded
    WHERE answer_row.id = graded.answer_id
    RETURNING graded.question_type, graded.grading_score
  )
  SELECT
    COALESCE(SUM(updated_answers.grading_score), 0)::numeric(7,2)
  INTO v_total_score
  FROM updated_answers;

  IF v_has_essay THEN
    v_final_status := 'submitted';
  ELSIF p_reason = 'timed_out' THEN
    v_final_status := 'timed_out';
  ELSE
    v_final_status := 'graded';
  END IF;

  UPDATE public.exam_sessions
  SET status = v_final_status,
      submitted_at = v_now,
      total_score = v_total_score,
      max_score = v_max_score
  WHERE id = p_session_id
    AND status = 'in_progress';

  RETURN jsonb_build_object(
    'success', true,
    'final_status', v_final_status,
    'total_score', v_total_score,
    'max_score', v_max_score
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.try_parse_jsonb(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_parse_jsonb(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.try_parse_jsonb(TEXT) FROM authenticated;

REVOKE ALL ON FUNCTION public.normalize_exam_text_answer(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_exam_text_answer(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.normalize_exam_text_answer(TEXT) FROM authenticated;

REVOKE ALL ON FUNCTION public.normalize_exam_answer_array(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_exam_answer_array(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.normalize_exam_answer_array(TEXT) FROM authenticated;

REVOKE ALL ON FUNCTION public.grade_exam_matching_answer(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grade_exam_matching_answer(TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.grade_exam_matching_answer(TEXT, JSONB) FROM authenticated;

REVOKE ALL ON FUNCTION public.finalize_exam_session_atomic(UUID, UUID, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_exam_session_atomic(UUID, UUID, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_exam_session_atomic(UUID, UUID, JSONB, TEXT) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.finalize_exam_session_atomic(UUID, UUID, JSONB, TEXT) TO service_role';
  END IF;
END $$;
