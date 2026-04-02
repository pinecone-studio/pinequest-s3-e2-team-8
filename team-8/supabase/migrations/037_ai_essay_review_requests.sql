ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS score_source text,
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS review_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS review_resolved_at timestamptz;

UPDATE public.answers
SET score_source = 'objective'
WHERE score_source IS NULL;

UPDATE public.answers
SET review_status = 'none'
WHERE review_status IS NULL;

ALTER TABLE public.answers
  ALTER COLUMN score_source SET DEFAULT 'objective',
  ALTER COLUMN score_source SET NOT NULL,
  ALTER COLUMN review_status SET DEFAULT 'none',
  ALTER COLUMN review_status SET NOT NULL;

ALTER TABLE public.answers
  DROP CONSTRAINT IF EXISTS answers_score_source_check,
  DROP CONSTRAINT IF EXISTS answers_review_status_check;

ALTER TABLE public.answers
  ADD CONSTRAINT answers_score_source_check
    CHECK (score_source IN ('objective', 'ai', 'teacher')),
  ADD CONSTRAINT answers_review_status_check
    CHECK (review_status IN ('none', 'requested', 'resolved'));

UPDATE public.answers answer_row
SET score_source = 'teacher'
FROM public.questions question_row
WHERE question_row.id = answer_row.question_id
  AND question_row.type = 'essay'
  AND answer_row.graded_by IS NOT NULL
  AND (
    answer_row.ai_graded_at IS NULL
    OR COALESCE(answer_row.feedback, '') NOT LIKE '[AI] %'
  );

UPDATE public.answers answer_row
SET score_source = 'ai'
FROM public.questions question_row
WHERE question_row.id = answer_row.question_id
  AND question_row.type = 'essay'
  AND answer_row.ai_graded_at IS NOT NULL
  AND answer_row.score_source <> 'teacher';

CREATE INDEX IF NOT EXISTS idx_answers_review_requested
  ON public.answers(review_requested_at DESC, session_id)
  WHERE review_status = 'requested';

CREATE INDEX IF NOT EXISTS idx_answers_score_source
  ON public.answers(score_source);

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'exam_submitted',
    'exam_graded',
    'exam_reminder_1day',
    'exam_reminder_1hour',
    'ai_grading_complete',
    'new_exam_assigned',
    'essay_review_resolved',
    'general'
  ));
