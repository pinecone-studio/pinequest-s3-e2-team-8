-- =============================================
-- Migration 012: teacher schedule visibility RLS
-- Allow teaching-assignment teachers to view:
--   1. exams in their exact group+subject scope
--   2. exam_assignments rows for that same scope
-- This closes the schedule visibility gap without opening
-- unrelated exams system-wide.
--
-- NOTE: The policies created here caused an RLS circular reference
-- (exams → exam_assignments → exams). Migration 016 replaces them
-- with SECURITY DEFINER function-based policies that break the cycle.
-- =============================================

DROP POLICY IF EXISTS "Users can view accessible exams" ON public.exams;

CREATE POLICY "Users can view accessible exams"
  ON public.exams FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.exam_assignments ea
      JOIN public.teaching_assignments ta
        ON ta.group_id = ea.group_id
       AND ta.subject_id = exams.subject_id
       AND ta.teacher_id = auth.uid()
       AND ta.is_active = true
      WHERE ea.exam_id = exams.id
    )
    OR (
      is_published = true
      AND EXISTS (
        SELECT 1
        FROM public.exam_recipients er
        WHERE er.exam_id = exams.id
          AND er.student_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can view relevant exam assignments" ON public.exam_assignments;

CREATE POLICY "Users can view relevant exam assignments"
  ON public.exam_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.exams e
      WHERE e.id = exam_assignments.exam_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.student_group_members sgm
      WHERE sgm.group_id = exam_assignments.group_id
        AND sgm.student_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.exams e2
      JOIN public.teaching_assignments ta
        ON ta.group_id = exam_assignments.group_id
       AND ta.subject_id = e2.subject_id
       AND ta.teacher_id = auth.uid()
       AND ta.is_active = true
      WHERE e2.id = exam_assignments.exam_id
    )
  );
