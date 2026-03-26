-- ================================================================
-- Migration 016: Fix infinite recursion in exam/exam_assignments RLS
--
-- Root cause (migration 012):
--   exams SELECT policy    → queries exam_assignments (triggers its RLS)
--   exam_assignments SELECT → queries exams (triggers its RLS)
--   → infinite recursion
--
-- Fix: SECURITY DEFINER function that queries both tables without
--      triggering RLS, then reference it from both policies.
-- ================================================================

-- SECURITY DEFINER: check if current user has an active teaching
-- assignment for the given exam's subject+group pair.
-- Runs with definer privileges → bypasses RLS on both tables.
CREATE OR REPLACE FUNCTION public.auth_has_teaching_scope_for_exam(p_exam_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.exam_assignments ea
    JOIN   public.exams e
           ON  e.id = ea.exam_id
    JOIN   public.teaching_assignments ta
           ON  ta.group_id   = ea.group_id
           AND ta.subject_id = e.subject_id
           AND ta.teacher_id = auth.uid()
           AND ta.is_active  = true
    WHERE  ea.exam_id = p_exam_id
  );
$$;

REVOKE ALL ON FUNCTION public.auth_has_teaching_scope_for_exam(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_has_teaching_scope_for_exam(uuid) TO authenticated;

-- ── exams SELECT policy ───────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view accessible exams" ON public.exams;

CREATE POLICY "Users can view accessible exams"
  ON public.exams FOR SELECT
  USING (
    -- Owner
    created_by = auth.uid()
    -- Admin
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE  id = auth.uid() AND role = 'admin'
    )
    -- Teaching-assignment teacher (SECURITY DEFINER – no RLS cycle)
    OR public.auth_has_teaching_scope_for_exam(exams.id)
    -- Published exam assigned to this student
    OR (
      is_published = true
      AND EXISTS (
        SELECT 1 FROM public.exam_recipients er
        WHERE  er.exam_id   = exams.id
          AND  er.student_id = auth.uid()
      )
    )
  );

-- ── exam_assignments SELECT policy ───────────────────────────────
DROP POLICY IF EXISTS "Users can view relevant exam assignments" ON public.exam_assignments;

CREATE POLICY "Users can view relevant exam assignments"
  ON public.exam_assignments FOR SELECT
  USING (
    -- Exam owner or admin (auth_is_exam_owner_or_admin is already SECURITY DEFINER)
    public.auth_is_exam_owner_or_admin(exam_assignments.exam_id)
    -- Student who is a member of the group
    OR EXISTS (
      SELECT 1 FROM public.student_group_members sgm
      WHERE  sgm.group_id  = exam_assignments.group_id
        AND  sgm.student_id = auth.uid()
    )
    -- Teaching-assignment teacher (SECURITY DEFINER – no RLS cycle)
    OR public.auth_has_teaching_scope_for_exam(exam_assignments.exam_id)
  );
