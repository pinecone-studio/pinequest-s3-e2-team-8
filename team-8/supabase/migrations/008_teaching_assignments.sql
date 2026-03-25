-- =============================================
-- Migration 008: Teacher Subjects & Teaching Assignments
-- Teaching-assignment-based access model:
--   teacher_subjects  → which subjects a teacher may create exams for
--   teaching_assignments → which subject a teacher teaches in which group
-- =============================================

-- teacher_subjects: admin assigns which subjects each teacher can use
CREATE TABLE public.teacher_subjects (
  teacher_id  UUID NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES public.subjects(id)  ON DELETE CASCADE,
  assigned_by UUID           REFERENCES public.profiles(id)  ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (teacher_id, subject_id)
);

CREATE INDEX idx_teacher_subjects_teacher ON public.teacher_subjects(teacher_id);
CREATE INDEX idx_teacher_subjects_subject ON public.teacher_subjects(subject_id);

-- teaching_assignments: teacher teaches subject X in group Y
CREATE TABLE public.teaching_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES public.profiles(id)        ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES public.student_groups(id)  ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES public.subjects(id)        ON DELETE CASCADE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  assigned_by UUID           REFERENCES public.profiles(id)        ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, group_id, subject_id)
);

CREATE INDEX idx_teaching_assignments_teacher ON public.teaching_assignments(teacher_id);
CREATE INDEX idx_teaching_assignments_group   ON public.teaching_assignments(group_id);
CREATE INDEX idx_teaching_assignments_subject ON public.teaching_assignments(subject_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.teacher_subjects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaching_assignments ENABLE ROW LEVEL SECURITY;

-- teacher_subjects: teachers see their own rows; admins see/manage all
CREATE POLICY "Teachers view own subject assignments"
  ON public.teacher_subjects FOR SELECT
  USING (
    teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins manage teacher subjects"
  ON public.teacher_subjects FOR ALL
  USING    (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- teaching_assignments: teachers see their own rows; admins see/manage all
CREATE POLICY "Teachers view own teaching assignments"
  ON public.teaching_assignments FOR SELECT
  USING (
    teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins manage teaching assignments"
  ON public.teaching_assignments FOR ALL
  USING    (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
