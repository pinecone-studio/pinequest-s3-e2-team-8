-- =============================================
-- Migration 010: exam_sessions / answers RLS
-- Teaching-assignment багш нар admin үүсгэсэн
-- шалгалтын sessions болон answers-ийг харах,
-- grading хийх боломжтой болгоно.
-- =============================================

-- ── exam_sessions ────────────────────────────

DROP POLICY IF EXISTS "Teachers can view all sessions for their exams"
  ON public.exam_sessions;
DROP POLICY IF EXISTS "Teachers can update sessions for grading"
  ON public.exam_sessions;

-- SELECT: өөрийн session | шалгалтыг үүсгэсэн багш |
--         admin | teaching-assignment-аар хамаарах багш
CREATE POLICY "Teachers can view sessions for their scope"
  ON public.exam_sessions FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_sessions.exam_id
        AND e.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.exam_assignments ea
      JOIN public.exams e          ON e.id = ea.exam_id
      JOIN public.teaching_assignments ta
        ON ta.group_id   = ea.group_id
       AND ta.subject_id = e.subject_id
       AND ta.is_active  = TRUE
       AND ta.teacher_id = auth.uid()
      WHERE ea.exam_id = exam_sessions.exam_id
    )
  );

-- UPDATE (grading): шалгалтыг үүсгэсэн багш | admin | teaching-assignment
CREATE POLICY "Teachers can update sessions for grading"
  ON public.exam_sessions FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_sessions.exam_id
        AND e.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.exam_assignments ea
      JOIN public.exams e          ON e.id = ea.exam_id
      JOIN public.teaching_assignments ta
        ON ta.group_id   = ea.group_id
       AND ta.subject_id = e.subject_id
       AND ta.is_active  = TRUE
       AND ta.teacher_id = auth.uid()
      WHERE ea.exam_id = exam_sessions.exam_id
    )
  );

-- ── answers ──────────────────────────────────

DROP POLICY IF EXISTS "Teachers can view answers for their exams"
  ON public.answers;
DROP POLICY IF EXISTS "Teachers can grade answers"
  ON public.answers;

-- SELECT: өөрийн хариулт | шалгалтыг үүсгэсэн багш |
--         admin | teaching-assignment
CREATE POLICY "Teachers can view answers for their scope"
  ON public.answers FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.exam_sessions es
      JOIN public.exams e ON e.id = es.exam_id
      WHERE es.id = answers.session_id
        AND e.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.exam_sessions es
      JOIN public.exam_assignments ea ON ea.exam_id = es.exam_id
      JOIN public.exams e             ON e.id = es.exam_id
      JOIN public.teaching_assignments ta
        ON ta.group_id   = ea.group_id
       AND ta.subject_id = e.subject_id
       AND ta.is_active  = TRUE
       AND ta.teacher_id = auth.uid()
      WHERE es.id = answers.session_id
    )
  );

-- UPDATE (grading): шалгалтыг үүсгэсэн багш | admin | teaching-assignment
CREATE POLICY "Teachers can grade answers"
  ON public.answers FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.exam_sessions es
      JOIN public.exams e ON e.id = es.exam_id
      WHERE es.id = answers.session_id
        AND e.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.exam_sessions es
      JOIN public.exam_assignments ea ON ea.exam_id = es.exam_id
      JOIN public.exams e             ON e.id = es.exam_id
      JOIN public.teaching_assignments ta
        ON ta.group_id   = ea.group_id
       AND ta.subject_id = e.subject_id
       AND ta.is_active  = TRUE
       AND ta.teacher_id = auth.uid()
      WHERE es.id = answers.session_id
    )
  );
