-- =============================================
-- Migration 024: Atomic Start Exam Session RPC
-- 500 сурагч нэгэн зэрэг шалгалт эхлүүлэх үед
-- 6 DB round-trip -> 1 болгож latency-г бууруулна.
-- =============================================

CREATE OR REPLACE FUNCTION public.start_exam_session_atomic(
  p_exam_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_exam RECORD;
  v_recipient RECORD;
  v_existing RECORD;
  v_other_active RECORD;
  v_attempt_count INTEGER;
  v_max_attempts INTEGER;
  v_now TIMESTAMPTZ := NOW();
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_new_session RECORD;
BEGIN
  -- auth.uid() ашиглаж caller-ийн identity шалгах (privilege escalation-ээс сэргийлэх)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- 1. Шалгалт оноогдсон эсэх
  SELECT er.exam_id, er.access_start_time, er.access_end_time,
         er.max_attempts_override, er.excused_at
  INTO v_recipient
  FROM exam_recipients er
  WHERE er.exam_id = p_exam_id AND er.student_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_assigned');
  END IF;

  IF v_recipient.excused_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'excused');
  END IF;

  -- 2. Шалгалтын мэдээлэл авах
  SELECT e.id, e.start_time, e.end_time, e.duration_minutes, e.max_attempts,
         e.is_published
  INTO v_exam
  FROM exams e
  WHERE e.id = p_exam_id;

  IF NOT FOUND OR NOT v_exam.is_published THEN
    RETURN jsonb_build_object('error', 'exam_not_found');
  END IF;

  -- Access override шалгах
  v_start_time := COALESCE(v_recipient.access_start_time, v_exam.start_time);
  v_end_time := COALESCE(v_recipient.access_end_time, v_exam.end_time);
  v_max_attempts := COALESCE(v_recipient.max_attempts_override, v_exam.max_attempts, 1);

  -- 3. Энэ шалгалтад in_progress session байгаа эсэх (RESUME: цаг шалгахаас ӨМНӨ)
  SELECT es.id, es.status, es.started_at, es.attempt_number,
         es.total_score, es.max_score
  INTO v_existing
  FROM exam_sessions es
  WHERE es.exam_id = p_exam_id
    AND es.user_id = v_user_id
    AND es.status = 'in_progress'
  ORDER BY es.attempt_number DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    -- Session хугацаа дууссан эсэх шалгах
    IF v_existing.started_at + (v_exam.duration_minutes * INTERVAL '1 minute') < v_now THEN
      RETURN jsonb_build_object('expired_session_id', v_existing.id);
    END IF;
    -- Байгаа session-г буцаах (цонх хаагдсан ч resume хийнэ)
    RETURN jsonb_build_object('session', jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'started_at', v_existing.started_at,
      'attempt_number', v_existing.attempt_number,
      'exam_id', p_exam_id
    ));
  END IF;

  -- 4. Цаг шалгах (зөвхөн ШИНЭ session үүсгэх үед)
  IF v_now < v_start_time THEN
    RETURN jsonb_build_object('error', 'not_started');
  END IF;

  IF v_now > v_end_time THEN
    RETURN jsonb_build_object('error', 'window_closed');
  END IF;

  -- 5. Өөр шалгалтад in_progress session байгаа эсэх
  SELECT es.id, es.exam_id, es.started_at
  INTO v_other_active
  FROM exam_sessions es
  WHERE es.user_id = v_user_id
    AND es.status = 'in_progress'
    AND es.exam_id != p_exam_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'error', 'other_exam_active',
      'other_exam_id', v_other_active.exam_id,
      'other_session_id', v_other_active.id,
      'other_started_at', v_other_active.started_at
    );
  END IF;

  -- 6. Attempt тоо шалгах
  SELECT COUNT(*)
  INTO v_attempt_count
  FROM exam_sessions es
  WHERE es.exam_id = p_exam_id AND es.user_id = v_user_id;

  IF v_attempt_count >= v_max_attempts THEN
    RETURN jsonb_build_object('error', 'max_attempts_reached');
  END IF;

  -- 7. Шинэ session үүсгэх
  INSERT INTO exam_sessions (exam_id, user_id, status, attempt_number)
  VALUES (p_exam_id, v_user_id, 'in_progress', v_attempt_count + 1)
  RETURNING id, exam_id, user_id, status, started_at, attempt_number
  INTO v_new_session;

  RETURN jsonb_build_object('session', jsonb_build_object(
    'id', v_new_session.id,
    'status', v_new_session.status,
    'started_at', v_new_session.started_at,
    'attempt_number', v_new_session.attempt_number,
    'exam_id', v_new_session.exam_id
  ));

EXCEPTION
  WHEN unique_violation THEN
    -- Race condition: өөр tab дээрээс session үүссэн
    SELECT es.id, es.status, es.started_at, es.attempt_number, es.exam_id
    INTO v_existing
    FROM exam_sessions es
    WHERE es.exam_id = p_exam_id
      AND es.user_id = v_user_id
      AND es.status = 'in_progress'
    ORDER BY es.attempt_number DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('session', jsonb_build_object(
        'id', v_existing.id,
        'status', v_existing.status,
        'started_at', v_existing.started_at,
        'attempt_number', v_existing.attempt_number,
        'exam_id', v_existing.exam_id
      ));
    END IF;

    RETURN jsonb_build_object('error', 'concurrent_creation');
END;
$$;

-- Security: зөвхөн authenticated хэрэглэгчид дуудах эрхтэй
REVOKE ALL ON FUNCTION public.start_exam_session_atomic(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_exam_session_atomic(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_exam_session_atomic(UUID) TO authenticated;
