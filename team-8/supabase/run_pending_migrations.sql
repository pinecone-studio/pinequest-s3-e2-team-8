-- =============================================
-- RUN THIS IN SUPABASE DASHBOARD > SQL EDITOR
-- Manual catch-up script for migrations 022-032
-- Keeps notification, exam concurrency, and learning hub schema
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

CREATE OR REPLACE FUNCTION public.auth_is_teacher_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('teacher', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_teacher_or_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_is_teacher_or_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_is_teacher_or_admin() TO authenticated;

CREATE POLICY "Users can view permitted profiles"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.auth_is_teacher_or_admin()
  );

-- 031: Exam concurrency integrity + mastery refresh queue
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

-- 032: Learning hub projection + practice integrity
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

SELECT 'DONE! Manual catch-up script applied successfully.' AS status;
