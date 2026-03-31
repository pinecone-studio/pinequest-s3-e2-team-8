-- =============================================
-- Migration 033: Atomic Finalize Exam Session RPC
-- 50+ сурагч нэгэн зэрэг submit хийх үед
-- 10-13 DB round-trip -> 1 болгож latency-г бууруулна.
-- Pattern: start_exam_session_atomic (migration 024/031)
-- =============================================

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
  v_questions JSONB;
  v_total_score NUMERIC(7,2) := 0;
  v_max_score NUMERIC(7,2) := 0;
  v_has_essay BOOLEAN := false;
  v_final_status TEXT;
  v_q RECORD;
  v_ans RECORD;
  v_correct_answer TEXT;
  v_question_type TEXT;
  v_question_points NUMERIC(5,2);
  v_is_correct BOOLEAN;
  v_score NUMERIC(5,2);
  v_submitted_sorted JSONB;
  v_correct_sorted JSONB;
  v_match_correct BOOLEAN;
  v_pair RECORD;
  v_submitted_value TEXT;
  v_variant RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- -----------------------------------------------
  -- 1. Session lock + validation
  -- -----------------------------------------------
  SELECT es.id, es.exam_id, es.status, es.total_score, es.max_score
  INTO v_session
  FROM public.exam_sessions es
  WHERE es.id = p_session_id
    AND es.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  -- Already finalized — return cached result
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

  -- -----------------------------------------------
  -- 2. Upsert answers from Redis flush (p_answers JSONB array)
  -- -----------------------------------------------
  IF jsonb_array_length(p_answers) > 0 THEN
    INSERT INTO public.answers (session_id, question_id, user_id, answer,
                                first_answered_at, last_changed_at, change_count)
    SELECT
      p_session_id,
      (elem->>'question_id')::uuid,
      p_user_id,
      elem->>'answer',
      CASE WHEN elem->>'first_answered_at' IS NOT NULL
           THEN (elem->>'first_answered_at')::timestamptz ELSE NULL END,
      CASE WHEN elem->>'last_changed_at' IS NOT NULL
           THEN (elem->>'last_changed_at')::timestamptz ELSE NULL END,
      COALESCE((elem->>'change_count')::integer, 0)
    FROM jsonb_array_elements(p_answers) AS elem
    ON CONFLICT (session_id, question_id) DO UPDATE SET
      answer = EXCLUDED.answer,
      first_answered_at = COALESCE(EXCLUDED.first_answered_at, answers.first_answered_at),
      last_changed_at = COALESCE(EXCLUDED.last_changed_at, answers.last_changed_at),
      change_count = GREATEST(EXCLUDED.change_count, answers.change_count);
  END IF;

  -- -----------------------------------------------
  -- 3. Load published snapshot for questions + correct answers
  -- -----------------------------------------------
  SELECT e.published_snapshot
  INTO v_snapshot
  FROM public.exams e
  WHERE e.id = v_exam_id;

  -- -----------------------------------------------
  -- 4. Calculate max_score and detect essay questions
  -- -----------------------------------------------
  IF v_snapshot IS NOT NULL AND v_snapshot->'questions' IS NOT NULL THEN
    -- Use snapshot stats if available
    v_max_score := COALESCE((v_snapshot->'stats'->>'total_points')::numeric, 0);
    v_has_essay := COALESCE((v_snapshot->'stats'->>'has_essay_questions')::boolean, false);

    -- If stats didn't have total_points, calculate from questions
    IF v_max_score = 0 THEN
      SELECT COALESCE(SUM((q->>'points')::numeric), 0)
      INTO v_max_score
      FROM jsonb_array_elements(v_snapshot->'questions') AS q;
    END IF;

    v_questions := v_snapshot->'questions';
  ELSE
    -- Fallback: load from questions table
    SELECT COALESCE(SUM(q.points), 0),
           bool_or(q.type = 'essay')
    INTO v_max_score, v_has_essay
    FROM public.questions q
    WHERE q.exam_id = v_exam_id;

    SELECT jsonb_agg(jsonb_build_object(
      'id', q.id,
      'type', q.type,
      'points', q.points,
      'correct_answer', q.correct_answer,
      'options', q.options
    ))
    INTO v_questions
    FROM public.questions q
    WHERE q.exam_id = v_exam_id;
  END IF;

  -- -----------------------------------------------
  -- 5. Grade each answer
  -- -----------------------------------------------
  FOR v_ans IN
    SELECT a.question_id, a.answer, a.score
    FROM public.answers a
    WHERE a.session_id = p_session_id
  LOOP
    -- Find question in snapshot
    SELECT
      COALESCE(var.type, (q_data->>'type')),
      COALESCE(var.correct_answer, (q_data->>'correct_answer')),
      (q_data->>'points')::numeric,
      COALESCE(var.options, q_data->'options')
    INTO v_question_type, v_correct_answer, v_question_points, v_submitted_sorted
    FROM (
      SELECT q_elem AS q_data
      FROM jsonb_array_elements(v_questions) AS q_elem
      WHERE (q_elem->>'id')::uuid = v_ans.question_id
      LIMIT 1
    ) sq
    LEFT JOIN public.exam_session_question_variants var
      ON var.session_id = p_session_id
      AND var.question_id = v_ans.question_id;

    -- Skip if question not found
    IF v_question_type IS NULL THEN
      CONTINUE;
    END IF;

    v_is_correct := false;
    v_score := 0;

    IF v_question_type IN ('multiple_choice', 'fill_blank') THEN
      -- Simple text comparison (normalized)
      v_is_correct := lower(trim(COALESCE(v_ans.answer, '')))
                    = lower(trim(COALESCE(v_correct_answer, '')));
      IF v_is_correct THEN
        v_score := COALESCE(v_question_points, 0);
      END IF;

    ELSIF v_question_type = 'multiple_response' THEN
      -- Compare sorted JSON arrays
      BEGIN
        -- Parse and sort submitted answer
        SELECT jsonb_agg(val ORDER BY val)
        INTO v_submitted_sorted
        FROM (
          SELECT lower(trim(elem::text, '"')) AS val
          FROM jsonb_array_elements(v_ans.answer::jsonb) AS elem
          WHERE trim(elem::text, '"') <> ''
        ) sub;

        -- Parse and sort correct answer
        SELECT jsonb_agg(val ORDER BY val)
        INTO v_correct_sorted
        FROM (
          SELECT lower(trim(elem::text, '"')) AS val
          FROM jsonb_array_elements(v_correct_answer::jsonb) AS elem
          WHERE trim(elem::text, '"') <> ''
        ) sub;

        v_is_correct := COALESCE(v_submitted_sorted = v_correct_sorted, false);
      EXCEPTION WHEN OTHERS THEN
        -- Fallback: comma-separated comparison
        BEGIN
          SELECT jsonb_agg(val ORDER BY val)
          INTO v_submitted_sorted
          FROM (
            SELECT lower(trim(s)) AS val
            FROM unnest(string_to_array(COALESCE(v_ans.answer, ''), ',')) AS s
            WHERE trim(s) <> ''
          ) sub;

          SELECT jsonb_agg(val ORDER BY val)
          INTO v_correct_sorted
          FROM (
            SELECT lower(trim(s)) AS val
            FROM unnest(string_to_array(COALESCE(v_correct_answer, ''), ',')) AS s
            WHERE trim(s) <> ''
          ) sub;

          v_is_correct := COALESCE(v_submitted_sorted = v_correct_sorted, false);
        EXCEPTION WHEN OTHERS THEN
          v_is_correct := false;
        END;
      END;

      IF v_is_correct THEN
        v_score := COALESCE(v_question_points, 0);
      END IF;

    ELSIF v_question_type = 'matching' THEN
      -- Parse submitted JSON object and compare with option pairs
      v_match_correct := true;

      -- v_submitted_sorted here temporarily holds the question options from snapshot
      -- We need the original options array for matching pairs
      BEGIN
        DECLARE
          v_submitted_obj JSONB;
          v_options_arr JSONB;
          v_opt TEXT;
          v_left_key TEXT;
          v_right_val TEXT;
        BEGIN
          v_submitted_obj := COALESCE(v_ans.answer::jsonb, '{}'::jsonb);

          -- Get original options from question (not variant override)
          SELECT COALESCE(var2.options, (q2->>'options')::jsonb)
          INTO v_options_arr
          FROM (
            SELECT q_elem2 AS q2
            FROM jsonb_array_elements(v_questions) AS q_elem2
            WHERE (q_elem2->>'id')::uuid = v_ans.question_id
            LIMIT 1
          ) sq2
          LEFT JOIN public.exam_session_question_variants var2
            ON var2.session_id = p_session_id
            AND var2.question_id = v_ans.question_id;

          IF v_options_arr IS NULL OR jsonb_array_length(v_options_arr) = 0 THEN
            v_match_correct := false;
          ELSE
            FOR v_opt IN SELECT jsonb_array_elements_text(v_options_arr) LOOP
              v_left_key := split_part(v_opt, '|||', 1);
              v_right_val := lower(trim(split_part(v_opt, '|||', 2)));

              IF v_left_key = '' OR v_right_val = '' THEN
                CONTINUE;
              END IF;

              v_submitted_value := lower(trim(COALESCE(v_submitted_obj->>v_left_key, '')));
              IF v_submitted_value <> v_right_val THEN
                v_match_correct := false;
                EXIT;
              END IF;
            END LOOP;
          END IF;

          v_is_correct := v_match_correct;
        END;
      EXCEPTION WHEN OTHERS THEN
        v_is_correct := false;
      END;

      IF v_is_correct THEN
        v_score := COALESCE(v_question_points, 0);
      END IF;

    ELSE
      -- essay or unknown type: keep existing score
      v_score := COALESCE(v_ans.score, 0);
      -- Don't set is_correct for essay
      v_is_correct := NULL;
    END IF;

    -- Update the answer with grading result
    UPDATE public.answers
    SET is_correct = v_is_correct,
        score = v_score
    WHERE session_id = p_session_id
      AND question_id = v_ans.question_id;

    v_total_score := v_total_score + v_score;
  END LOOP;

  -- -----------------------------------------------
  -- 6. Determine final status
  -- -----------------------------------------------
  IF v_has_essay THEN
    v_final_status := 'submitted';
  ELSIF p_reason = 'timed_out' THEN
    v_final_status := 'timed_out';
  ELSE
    v_final_status := 'graded';
  END IF;

  -- -----------------------------------------------
  -- 7. Update session
  -- -----------------------------------------------
  UPDATE public.exam_sessions
  SET status = v_final_status,
      submitted_at = v_now,
      total_score = v_total_score,
      max_score = v_max_score
  WHERE id = p_session_id
    AND status = 'in_progress';

  -- -----------------------------------------------
  -- 8. Return result
  -- -----------------------------------------------
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

-- Security: зөвхөн authenticated хэрэглэгчид дуудах эрхтэй
REVOKE ALL ON FUNCTION public.finalize_exam_session_atomic(UUID, UUID, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_exam_session_atomic(UUID, UUID, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_exam_session_atomic(UUID, UUID, JSONB, TEXT) TO authenticated;
