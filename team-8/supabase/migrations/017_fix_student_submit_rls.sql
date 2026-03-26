-- ================================================================
-- Migration 017: Fix student exam submission RLS policies
--
-- Root cause:
--   "Students can update own in-progress sessions" (migration 001)
--   has USING (status = 'in_progress') but no WITH CHECK clause.
--   PostgreSQL reuses USING as WITH CHECK, so the new row's status
--   is also validated against status = 'in_progress' — blocking any
--   status transition (e.g. → 'graded' or 'submitted').
--
--   Also: no student UPDATE policy on answers, preventing auto-grading
--   score writes from submitExam() server action.
-- ================================================================

-- ── exam_sessions: allow students to submit (transition status) ──
DROP POLICY IF EXISTS "Students can update own in-progress sessions"
  ON public.exam_sessions;

CREATE POLICY "Students can update own in-progress sessions"
  ON public.exam_sessions FOR UPDATE
  USING  (user_id = auth.uid() AND status = 'in_progress')
  WITH CHECK (user_id = auth.uid());

-- ── answers: allow auto-grading score writes during submission ───
-- Students may update is_correct / score on their own answers only
-- while the parent session is still in_progress (i.e., during submit).
DROP POLICY IF EXISTS "Students can update own answer scores"
  ON public.answers;

CREATE POLICY "Students can update own answer scores"
  ON public.answers FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM   public.exam_sessions es
      WHERE  es.id      = answers.session_id
        AND  es.user_id = auth.uid()
        AND  es.status  = 'in_progress'
    )
  )
  WITH CHECK (user_id = auth.uid());
