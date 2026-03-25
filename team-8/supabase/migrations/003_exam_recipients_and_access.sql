-- =============================================
-- Migration 003: Exam Recipients & Access Hardening
-- =============================================

-- Runtime truth table: exactly which students can access an exam
CREATE TABLE public.exam_recipients (
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exam_id, student_id)
);

CREATE INDEX idx_exam_recipients_exam ON public.exam_recipients(exam_id);
CREATE INDEX idx_exam_recipients_student ON public.exam_recipients(student_id);

-- Backfill recipients for already-published exams
INSERT INTO public.exam_recipients (exam_id, student_id, assigned_by, assigned_at)
SELECT DISTINCT
  ea.exam_id,
  sgm.student_id,
  ea.assigned_by,
  COALESCE(ea.assigned_at, NOW())
FROM public.exam_assignments ea
JOIN public.exams e ON e.id = ea.exam_id
JOIN public.student_group_members sgm ON sgm.group_id = ea.group_id
WHERE e.is_published = true
ON CONFLICT (exam_id, student_id) DO NOTHING;

ALTER TABLE public.exam_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own exam recipients"
  ON public.exam_recipients FOR SELECT
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.exams
      WHERE exams.id = exam_recipients.exam_id
      AND (
        exams.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Teachers can manage exam recipients"
  ON public.exam_recipients FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.exams
      WHERE exams.id = exam_recipients.exam_id
      AND (
        exams.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.exams
      WHERE exams.id = exam_recipients.exam_id
      AND (
        exams.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

-- Tighten published exam visibility so students only see exams assigned to them
DROP POLICY IF EXISTS "Anyone can view published exams" ON public.exams;
CREATE POLICY "Users can view accessible exams"
  ON public.exams FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
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

DROP POLICY IF EXISTS "Anyone can view questions of published exams" ON public.questions;
CREATE POLICY "Users can view accessible questions"
  ON public.questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.exams
      WHERE exams.id = questions.exam_id
      AND (
        exams.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
        OR (
          exams.is_published = true
          AND EXISTS (
            SELECT 1
            FROM public.exam_recipients er
            WHERE er.exam_id = exams.id
            AND er.student_id = auth.uid()
          )
        )
      )
    )
  );

-- Tighten group visibility
DROP POLICY IF EXISTS "Anyone can view student groups" ON public.student_groups;
CREATE POLICY "Users can view relevant student groups"
  ON public.student_groups FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.student_group_members sgm
      WHERE sgm.group_id = student_groups.id
      AND sgm.student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can manage student groups" ON public.student_groups;
CREATE POLICY "Teachers can manage student groups"
  ON public.student_groups FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Anyone can view group members" ON public.student_group_members;
CREATE POLICY "Users can view relevant group members"
  ON public.student_group_members FOR SELECT
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.student_groups sg
      WHERE sg.id = student_group_members.group_id
      AND (
        sg.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

DROP POLICY IF EXISTS "Teachers can manage group members" ON public.student_group_members;
CREATE POLICY "Teachers can manage own group members"
  ON public.student_group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.student_groups sg
      WHERE sg.id = student_group_members.group_id
      AND (
        sg.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

DROP POLICY IF EXISTS "Teachers can remove group members" ON public.student_group_members;
CREATE POLICY "Teachers can remove own group members"
  ON public.student_group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_groups sg
      WHERE sg.id = student_group_members.group_id
      AND (
        sg.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

-- Tighten assignment visibility and ownership
DROP POLICY IF EXISTS "Anyone can view exam assignments" ON public.exam_assignments;
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
  );

DROP POLICY IF EXISTS "Teachers can assign exams" ON public.exam_assignments;
CREATE POLICY "Teachers can assign own exams"
  ON public.exam_assignments FOR INSERT
  WITH CHECK (
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
    AND EXISTS (
      SELECT 1
      FROM public.student_groups sg
      WHERE sg.id = exam_assignments.group_id
      AND (
        sg.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

DROP POLICY IF EXISTS "Teachers can unassign exams" ON public.exam_assignments;
CREATE POLICY "Teachers can unassign own exams"
  ON public.exam_assignments FOR DELETE
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
    AND EXISTS (
      SELECT 1
      FROM public.student_groups sg
      WHERE sg.id = exam_assignments.group_id
      AND (
        sg.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );
