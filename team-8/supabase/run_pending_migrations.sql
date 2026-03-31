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

SELECT 'DONE! Manual catch-up script applied successfully.' AS status;
