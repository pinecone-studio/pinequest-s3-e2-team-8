-- =============================================
-- Migration 009: Align RLS with teaching-assignment access model
--
-- Teaching assignment model дээр суурилсан group/member/exam_assignments
-- RLS policy-уудыг шинэчлэнэ.
--
-- Өөрчлөлтүүд:
--   1. student_groups       SELECT — teaching_assignments-тай teacher харах боломжтой
--   2. student_groups       INSERT — admin-only болгох
--   3. student_group_members SELECT — teaching_assignments-тай teacher харах боломжтой
--   4. student_group_members INSERT/DELETE — admin-only болгох
--   5. exam_assignments     INSERT/DELETE — group-д teaching_assignment-тай teacher оноох боломжтой
-- =============================================

-- ── Helper: is_admin ──────────────────────────────────────────────────────────
-- Existing function used by other policies; just reference inline for clarity.

-- ── 1. student_groups SELECT ──────────────────────────────────────────────────
-- Allow: creator | admin | member student | teacher with teaching_assignment

DROP POLICY IF EXISTS "Users can view relevant student groups" ON public.student_groups;

CREATE POLICY "Users can view relevant student groups"
  ON public.student_groups FOR SELECT
  USING (
    -- own groups
    created_by = auth.uid()
    -- admin
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    -- student is a member of this group
    OR EXISTS (
      SELECT 1 FROM public.student_group_members sgm
      WHERE sgm.group_id = student_groups.id
        AND sgm.student_id = auth.uid()
    )
    -- teacher has an active teaching assignment for this group
    OR EXISTS (
      SELECT 1 FROM public.teaching_assignments ta
      WHERE ta.group_id = student_groups.id
        AND ta.teacher_id = auth.uid()
        AND ta.is_active = true
    )
  );

-- ── 2. student_groups INSERT — admin-only ────────────────────────────────────
-- Group management is admin-only per policy decision.

DROP POLICY IF EXISTS "Teachers can manage student groups" ON public.student_groups;

CREATE POLICY "Admins can create student groups"
  ON public.student_groups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 3. student_groups UPDATE/DELETE — admin-only ─────────────────────────────

DROP POLICY IF EXISTS "Admins can update student groups" ON public.student_groups;
DROP POLICY IF EXISTS "Admins can delete student groups" ON public.student_groups;

CREATE POLICY "Admins can update student groups"
  ON public.student_groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete student groups"
  ON public.student_groups FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 4. student_group_members SELECT ──────────────────────────────────────────
-- Allow: own record | admin | group creator | teacher with teaching_assignment

DROP POLICY IF EXISTS "Users can view relevant group members" ON public.student_group_members;

CREATE POLICY "Users can view relevant group members"
  ON public.student_group_members FOR SELECT
  USING (
    -- the student themselves
    student_id = auth.uid()
    -- admin
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    -- group creator
    OR EXISTS (
      SELECT 1 FROM public.student_groups sg
      WHERE sg.id = student_group_members.group_id
        AND sg.created_by = auth.uid()
    )
    -- teacher with an active teaching assignment for this group
    OR EXISTS (
      SELECT 1 FROM public.teaching_assignments ta
      WHERE ta.group_id = student_group_members.group_id
        AND ta.teacher_id = auth.uid()
        AND ta.is_active = true
    )
  );

-- ── 5. student_group_members INSERT/DELETE — admin-only ──────────────────────
-- Member management is admin-only per policy decision.

DROP POLICY IF EXISTS "Teachers can manage own group members" ON public.student_group_members;
DROP POLICY IF EXISTS "Teachers can remove own group members"  ON public.student_group_members;

CREATE POLICY "Admins can add group members"
  ON public.student_group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can remove group members"
  ON public.student_group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 6. exam_assignments INSERT ────────────────────────────────────────────────
-- Allow teacher to assign their own exam to a group IF they have a
-- teaching_assignment for the exam's subject in that group.
-- Admin can assign any exam to any group.

DROP POLICY IF EXISTS "Teachers can assign own exams" ON public.exam_assignments;

CREATE POLICY "Teachers can assign own exams"
  ON public.exam_assignments FOR INSERT
  WITH CHECK (
    -- Must own the exam or be admin
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_assignments.exam_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
    -- Group access: admin OR teacher has teaching_assignment for exam's subject in this group
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
      OR EXISTS (
        SELECT 1
        FROM public.exams e2
        JOIN public.teaching_assignments ta
          ON ta.subject_id = e2.subject_id
        WHERE e2.id = exam_assignments.exam_id
          AND ta.teacher_id = auth.uid()
          AND ta.group_id = exam_assignments.group_id
          AND ta.is_active = true
      )
    )
  );

-- ── 7. exam_assignments DELETE ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Teachers can unassign own exams" ON public.exam_assignments;

CREATE POLICY "Teachers can unassign own exams"
  ON public.exam_assignments FOR DELETE
  USING (
    -- Must own the exam or be admin
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_assignments.exam_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
    -- Group access: admin OR teacher has teaching_assignment for exam's subject in this group
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
      OR EXISTS (
        SELECT 1
        FROM public.exams e2
        JOIN public.teaching_assignments ta
          ON ta.subject_id = e2.subject_id
        WHERE e2.id = exam_assignments.exam_id
          AND ta.teacher_id = auth.uid()
          AND ta.group_id = exam_assignments.group_id
          AND ta.is_active = true
      )
    )
  );
