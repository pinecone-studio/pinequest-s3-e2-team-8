-- =============================================
-- Migration 031: Exam concurrency integrity + mastery refresh queue
-- Problem 5 hardening:
-- 1. Prevent duplicate in_progress sessions per exam/user
-- 2. Respect effective end_time when resuming/expiring sessions
-- 3. Move mastery recompute off the submit/grading hot path
-- =============================================

-- Clean duplicate active sessions before adding the partial unique index.
WITH ranked_in_progress AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY exam_id, user_id
      ORDER BY started_at DESC NULLS LAST, attempt_number DESC, id DESC
    ) AS row_num
  FROM public.exam_sessions
  WHERE status = 'in_progress'
)
UPDATE public.exam_sessions AS exam_sessions
SET
  status = 'timed_out',
  submitted_at = COALESCE(exam_sessions.submitted_at, now())
FROM ranked_in_progress
WHERE ranked_in_progress.id = exam_sessions.id
  AND ranked_in_progress.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sessions_one_in_progress_per_exam_user
  ON public.exam_sessions(exam_id, user_id)
  WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS public.student_mastery_refresh_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  scope_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_student_mastery_refresh_queue_status
  ON public.student_mastery_refresh_queue(status, next_run_at, created_at);

CREATE INDEX IF NOT EXISTS idx_student_mastery_refresh_queue_student
  ON public.student_mastery_refresh_queue(student_id, scope_key);

DROP TRIGGER IF EXISTS update_student_mastery_refresh_queue_updated_at
  ON public.student_mastery_refresh_queue;
CREATE TRIGGER update_student_mastery_refresh_queue_updated_at
  BEFORE UPDATE ON public.student_mastery_refresh_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.claim_student_mastery_refresh_jobs(
  p_limit integer DEFAULT 10
)
RETURNS SETOF public.student_mastery_refresh_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(COALESCE(p_limit, 10), 1);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT q.id
    FROM public.student_mastery_refresh_queue q
    WHERE q.status = 'pending'
      AND q.next_run_at <= now()
    ORDER BY q.next_run_at ASC, q.created_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.student_mastery_refresh_queue q
  SET
    status = 'processing',
    attempts = q.attempts + 1,
    last_error = NULL,
    updated_at = now()
  FROM candidates
  WHERE q.id = candidates.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_student_mastery_refresh_jobs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_student_mastery_refresh_jobs(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_student_mastery_refresh_jobs(integer) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.claim_student_mastery_refresh_jobs(integer) TO service_role';
  END IF;
END $$;

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
  v_duration_deadline TIMESTAMPTZ;
  v_session_deadline TIMESTAMPTZ;
  v_new_session RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_exam_id::text || ':' || v_user_id::text, 0)
  );

  SELECT er.exam_id, er.access_start_time, er.access_end_time,
         er.max_attempts_override, er.excused_at
  INTO v_recipient
  FROM public.exam_recipients er
  WHERE er.exam_id = p_exam_id
    AND er.student_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_assigned');
  END IF;

  IF v_recipient.excused_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'excused');
  END IF;

  SELECT e.id, e.start_time, e.end_time, e.duration_minutes, e.max_attempts,
         e.is_published
  INTO v_exam
  FROM public.exams e
  WHERE e.id = p_exam_id;

  IF NOT FOUND OR NOT v_exam.is_published THEN
    RETURN jsonb_build_object('error', 'exam_not_found');
  END IF;

  v_start_time := COALESCE(v_recipient.access_start_time, v_exam.start_time);
  v_end_time := COALESCE(v_recipient.access_end_time, v_exam.end_time);
  v_max_attempts := COALESCE(v_recipient.max_attempts_override, v_exam.max_attempts, 1);

  SELECT es.id, es.status, es.started_at, es.attempt_number,
         es.total_score, es.max_score
  INTO v_existing
  FROM public.exam_sessions es
  WHERE es.exam_id = p_exam_id
    AND es.user_id = v_user_id
    AND es.status = 'in_progress'
  ORDER BY es.attempt_number DESC
  LIMIT 1;

  IF FOUND THEN
    v_duration_deadline :=
      v_existing.started_at + (COALESCE(v_exam.duration_minutes, 0) * INTERVAL '1 minute');
    v_session_deadline := LEAST(v_duration_deadline, v_end_time);

    IF v_session_deadline <= v_now THEN
      RETURN jsonb_build_object('expired_session_id', v_existing.id);
    END IF;

    RETURN jsonb_build_object('session', jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'started_at', v_existing.started_at,
      'attempt_number', v_existing.attempt_number,
      'exam_id', p_exam_id
    ));
  END IF;

  IF v_now < v_start_time THEN
    RETURN jsonb_build_object('error', 'not_started');
  END IF;

  IF v_now > v_end_time THEN
    RETURN jsonb_build_object('error', 'window_closed');
  END IF;

  SELECT es.id, es.exam_id, es.started_at
  INTO v_other_active
  FROM public.exam_sessions es
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

  SELECT COUNT(*)
  INTO v_attempt_count
  FROM public.exam_sessions es
  WHERE es.exam_id = p_exam_id
    AND es.user_id = v_user_id;

  IF v_attempt_count >= v_max_attempts THEN
    RETURN jsonb_build_object('error', 'max_attempts_reached');
  END IF;

  INSERT INTO public.exam_sessions (exam_id, user_id, status, attempt_number)
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
    SELECT es.id, es.status, es.started_at, es.attempt_number, es.exam_id
    INTO v_existing
    FROM public.exam_sessions es
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

REVOKE ALL ON FUNCTION public.start_exam_session_atomic(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_exam_session_atomic(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_exam_session_atomic(UUID) TO authenticated;
