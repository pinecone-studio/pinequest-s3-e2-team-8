-- Student Learning Hub
-- Adds:
-- 1. Topic trace metadata on official exam questions
-- 2. Precomputed student mastery projection table
-- 3. Student-only practice exam domain
-- 4. Cached AI study plans per student + subject

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtopic text,
  ADD COLUMN IF NOT EXISTS source_question_bank_id uuid REFERENCES public.question_bank(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic_label_source text NOT NULL DEFAULT 'unknown'
    CHECK (topic_label_source IN ('unknown', 'manual', 'bank_import', 'sample_import', 'ai_generated', 'ai_inferred')),
  ADD COLUMN IF NOT EXISTS topic_label_confidence numeric(4,3);

UPDATE public.questions q
SET subject_id = e.subject_id
FROM public.exams e
WHERE e.id = q.exam_id
  AND q.subject_id IS NULL
  AND e.subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_subject_id
  ON public.questions(subject_id);

CREATE INDEX IF NOT EXISTS idx_questions_subject_subtopic
  ON public.questions(subject_id, subtopic);

CREATE INDEX IF NOT EXISTS idx_questions_source_question_bank
  ON public.questions(source_question_bank_id)
  WHERE source_question_bank_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.student_topic_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  topic_key text NOT NULL,
  topic_label text NOT NULL,
  official_correct_points numeric(8,2) NOT NULL DEFAULT 0,
  official_total_points numeric(8,2) NOT NULL DEFAULT 0,
  practice_correct_points numeric(8,2) NOT NULL DEFAULT 0,
  practice_total_points numeric(8,2) NOT NULL DEFAULT 0,
  official_question_count integer NOT NULL DEFAULT 0,
  practice_question_count integer NOT NULL DEFAULT 0,
  mastery_score numeric(5,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, topic_key)
);

CREATE INDEX IF NOT EXISTS idx_student_topic_mastery_student_subject
  ON public.student_topic_mastery(student_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_student_topic_mastery_student_score
  ON public.student_topic_mastery(student_id, mastery_score);

CREATE TABLE IF NOT EXISTS public.student_subject_study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  mastery_updated_at timestamptz NOT NULL,
  plan_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_student_subject_study_plans_student_subject
  ON public.student_subject_study_plans(student_id, subject_id);

CREATE TABLE IF NOT EXISTS public.student_practice_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  selected_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  question_count integer NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  generated_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_practice_exams_student_subject
  ON public.student_practice_exams(student_id, subject_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.student_practice_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_exam_id uuid NOT NULL REFERENCES public.student_practice_exams(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('bank', 'ai')),
  source_question_bank_id uuid REFERENCES public.question_bank(id) ON DELETE SET NULL,
  topic_key text NOT NULL,
  subtopic text,
  type text NOT NULL CHECK (type IN ('multiple_choice', 'multiple_response', 'essay', 'fill_blank', 'matching')),
  content text NOT NULL,
  content_html text,
  image_url text,
  options jsonb,
  correct_answer text,
  points numeric(5,2) NOT NULL DEFAULT 1.00,
  order_index integer NOT NULL DEFAULT 0,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_exam_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_student_practice_questions_exam
  ON public.student_practice_questions(practice_exam_id, order_index);

CREATE INDEX IF NOT EXISTS idx_student_practice_questions_topic
  ON public.student_practice_questions(practice_exam_id, topic_key);

CREATE TABLE IF NOT EXISTS public.student_practice_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_exam_id uuid NOT NULL REFERENCES public.student_practice_exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'graded')),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  total_score numeric(8,2),
  max_score numeric(8,2),
  attempt_number integer NOT NULL DEFAULT 1,
  UNIQUE (practice_exam_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_student_practice_attempts_student
  ON public.student_practice_attempts(student_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.student_practice_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_attempt_id uuid NOT NULL REFERENCES public.student_practice_attempts(id) ON DELETE CASCADE,
  practice_question_id uuid NOT NULL REFERENCES public.student_practice_questions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answer text,
  is_correct boolean,
  score numeric(5,2),
  feedback text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_attempt_id, practice_question_id)
);

CREATE INDEX IF NOT EXISTS idx_student_practice_answers_attempt
  ON public.student_practice_answers(practice_attempt_id);

ALTER TABLE public.student_topic_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_subject_study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_practice_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_practice_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_practice_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view own topic mastery" ON public.student_topic_mastery;
CREATE POLICY "Students can view own topic mastery"
  ON public.student_topic_mastery FOR SELECT
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can manage own topic mastery" ON public.student_topic_mastery;
CREATE POLICY "Students can manage own topic mastery"
  ON public.student_topic_mastery FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can view own study plans" ON public.student_subject_study_plans;
CREATE POLICY "Students can view own study plans"
  ON public.student_subject_study_plans FOR SELECT
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can manage own study plans" ON public.student_subject_study_plans;
CREATE POLICY "Students can manage own study plans"
  ON public.student_subject_study_plans FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can view own practice exams" ON public.student_practice_exams;
CREATE POLICY "Students can view own practice exams"
  ON public.student_practice_exams FOR SELECT
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can manage own practice exams" ON public.student_practice_exams;
CREATE POLICY "Students can manage own practice exams"
  ON public.student_practice_exams FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can view own practice questions" ON public.student_practice_questions;
CREATE POLICY "Students can view own practice questions"
  ON public.student_practice_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_practice_exams spe
      WHERE spe.id = student_practice_questions.practice_exam_id
        AND spe.student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can view own practice attempts" ON public.student_practice_attempts;
CREATE POLICY "Students can view own practice attempts"
  ON public.student_practice_attempts FOR SELECT
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can manage own practice attempts" ON public.student_practice_attempts;
CREATE POLICY "Students can manage own practice attempts"
  ON public.student_practice_attempts FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can view own practice answers" ON public.student_practice_answers;
CREATE POLICY "Students can view own practice answers"
  ON public.student_practice_answers FOR SELECT
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can manage own practice answers" ON public.student_practice_answers;
CREATE POLICY "Students can manage own practice answers"
  ON public.student_practice_answers FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP TRIGGER IF EXISTS update_student_subject_study_plans_updated_at
  ON public.student_subject_study_plans;
CREATE TRIGGER update_student_subject_study_plans_updated_at
  BEFORE UPDATE ON public.student_subject_study_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_student_practice_exams_updated_at
  ON public.student_practice_exams;
CREATE TRIGGER update_student_practice_exams_updated_at
  BEFORE UPDATE ON public.student_practice_exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
