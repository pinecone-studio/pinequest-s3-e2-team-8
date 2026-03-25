-- =============================================
-- Migration 004: Backfill Question Bank
-- =============================================

INSERT INTO public.question_bank (
  subject_id,
  created_by,
  type,
  content,
  content_html,
  image_url,
  options,
  correct_answer,
  points,
  explanation,
  usage_count,
  created_at,
  updated_at
)
SELECT
  e.subject_id,
  COALESCE(q.created_by, e.created_by),
  q.type,
  q.content,
  q.content_html,
  q.image_url,
  q.options,
  q.correct_answer,
  q.points,
  q.explanation,
  1,
  q.created_at,
  NOW()
FROM public.questions q
JOIN public.exams e ON e.id = q.exam_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.question_bank qb
  WHERE qb.created_by = COALESCE(q.created_by, e.created_by)
    AND qb.type = q.type
    AND qb.content = q.content
    AND COALESCE(qb.correct_answer, '') = COALESCE(q.correct_answer, '')
    AND COALESCE(qb.image_url, '') = COALESCE(q.image_url, '')
);
