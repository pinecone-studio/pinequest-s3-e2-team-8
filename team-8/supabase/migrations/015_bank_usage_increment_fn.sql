-- Migration 015: SECURITY DEFINER function to increment bank question usage
-- Needed because non-owners (who import shared questions) cannot UPDATE via RLS.

CREATE OR REPLACE FUNCTION public.increment_bank_question_usage(p_item_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.question_bank
  SET
    usage_count = usage_count + 1,
    last_used_at = now()
  WHERE id = p_item_id
    AND (
      -- Only increment if caller can view the item (owner, admin, or shared in their subject)
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      OR (
        visibility IN ('shared_subject', 'admin_curated')
        AND subject_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.teacher_subjects ts
          WHERE ts.teacher_id = auth.uid() AND ts.subject_id = question_bank.subject_id
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.increment_bank_question_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_bank_question_usage(uuid) TO authenticated;
