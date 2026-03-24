-- =============================================
-- Migration 002: Student Groups, Exam Assignments & Fixes
-- =============================================

-- Fix: questions table-д created_by column нэмэх
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- =============================================
-- STUDENT GROUPS (Бүлэг / Анги / Сонголт)
-- =============================================
CREATE TABLE public.student_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  grade SMALLINT,
  group_type TEXT NOT NULL DEFAULT 'class' CHECK (group_type IN ('class', 'elective', 'mixed')),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- STUDENT GROUP MEMBERS (Бүлгийн гишүүд)
-- =============================================
CREATE TABLE public.student_group_members (
  group_id UUID NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, student_id)
);

-- =============================================
-- EXAM ASSIGNMENTS (Шалгалтыг бүлэгт оноох)
-- =============================================
CREATE TABLE public.exam_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(exam_id, group_id)
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_student_groups_created_by ON public.student_groups(created_by);
CREATE INDEX idx_student_groups_grade ON public.student_groups(grade);
CREATE INDEX idx_group_members_student ON public.student_group_members(student_id);
CREATE INDEX idx_group_members_group ON public.student_group_members(group_id);
CREATE INDEX idx_exam_assignments_exam ON public.exam_assignments(exam_id);
CREATE INDEX idx_exam_assignments_group ON public.exam_assignments(group_id);

-- =============================================
-- RLS POLICIES
-- =============================================

-- Student Groups
ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view student groups"
  ON public.student_groups FOR SELECT USING (true);

CREATE POLICY "Teachers can manage student groups"
  ON public.student_groups FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

CREATE POLICY "Teachers can update own groups"
  ON public.student_groups FOR UPDATE
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Teachers can delete own groups"
  ON public.student_groups FOR DELETE
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Student Group Members
ALTER TABLE public.student_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view group members"
  ON public.student_group_members FOR SELECT USING (true);

CREATE POLICY "Teachers can manage group members"
  ON public.student_group_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

CREATE POLICY "Teachers can remove group members"
  ON public.student_group_members FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- Exam Assignments
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view exam assignments"
  ON public.exam_assignments FOR SELECT USING (true);

CREATE POLICY "Teachers can assign exams"
  ON public.exam_assignments FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

CREATE POLICY "Teachers can unassign exams"
  ON public.exam_assignments FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );
