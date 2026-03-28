-- =============================================
-- RUN THIS IN SUPABASE DASHBOARD > SQL EDITOR
-- Manual catch-up script for migrations 022-026
-- Keeps notification security and email delivery schema
-- aligned with the application code.
-- =============================================

-- 022: Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'exam_submitted',
    'exam_graded',
    'exam_reminder_1day',
    'exam_reminder_1hour',
    'ai_grading_complete',
    'new_exam_assigned',
    'general'
  )),
  title text NOT NULL,
  message text NOT NULL,
  link text DEFAULT NULL,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read)
  WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE policyname = 'Users can view own notifications'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "Users can view own notifications"
      ON public.notifications
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE policyname = 'Users can update own notifications'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "Users can update own notifications"
      ON public.notifications
      FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 023: Parent email
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_email text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_parent_email
  ON public.profiles(parent_email)
  WHERE parent_email IS NOT NULL;

-- 024: Atomic Start Exam Session RPC
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

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
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    IF v_existing.started_at + (v_exam.duration_minutes * INTERVAL '1 minute') < v_now THEN
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

-- 025: Harden notification writes and email delivery tracking
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON public.notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

CREATE POLICY "Users can insert own notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL,
  subject text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'skipped')
  ),
  attempts integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  provider_message_id text DEFAULT NULL,
  last_error text DEFAULT NULL,
  sent_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_recipient_email
  ON public.email_deliveries(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_status
  ON public.email_deliveries(status);

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

-- 026: Restrict profile reads
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view permitted profiles" ON public.profiles;

CREATE POLICY "Users can view permitted profiles"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id OR EXISTS (
      SELECT 1
      FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND viewer.role IN ('teacher', 'admin')
    )
  );

SELECT 'DONE! Manual catch-up script applied successfully.' AS status;
