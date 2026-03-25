-- =============================================
-- Migration 011: schedule conflict RPC
-- Allows schedule pages to detect conflicts against
-- all exams in the system without broadening general
-- exam visibility for teachers.
-- =============================================

CREATE OR REPLACE FUNCTION public.get_schedule_conflicts_for_scope(
  p_exam_ids uuid[]
)
RETURNS TABLE (
  exam_id uuid,
  conflicting_exam_id uuid,
  conflicting_exam_title text,
  reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requester AS (
    SELECT auth.uid() AS uid
  ),
  base_exams AS (
    SELECT
      e.id,
      e.title,
      e.subject_id,
      e.start_time,
      e.end_time,
      es.room
    FROM public.exams e
    LEFT JOIN public.exam_schedules es
      ON es.exam_id = e.id
    WHERE e.id = ANY(COALESCE(p_exam_ids, ARRAY[]::uuid[]))
      AND (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          JOIN requester r
            ON r.uid = p.id
          WHERE p.role = 'admin'
        )
        OR e.created_by = (SELECT uid FROM requester)
        OR EXISTS (
          SELECT 1
          FROM public.exam_assignments ea
          JOIN public.teaching_assignments ta
            ON ta.group_id = ea.group_id
           AND ta.subject_id = e.subject_id
           AND ta.is_active = true
          WHERE ea.exam_id = e.id
            AND ta.teacher_id = (SELECT uid FROM requester)
        )
      )
  ),
  base_exam_students AS (
    SELECT DISTINCT
      be.id AS exam_id,
      sgm.student_id
    FROM base_exams be
    JOIN public.exam_assignments ea
      ON ea.exam_id = be.id
    JOIN public.student_group_members sgm
      ON sgm.group_id = ea.group_id
  ),
  all_exams AS (
    SELECT
      e.id,
      e.title,
      e.start_time,
      e.end_time,
      es.room
    FROM public.exams e
    LEFT JOIN public.exam_schedules es
      ON es.exam_id = e.id
  ),
  all_exam_students AS (
    SELECT DISTINCT
      e.id AS exam_id,
      sgm.student_id
    FROM public.exams e
    JOIN public.exam_assignments ea
      ON ea.exam_id = e.id
    JOIN public.student_group_members sgm
      ON sgm.group_id = ea.group_id
  ),
  shared_students_conflicts AS (
    SELECT DISTINCT
      be.id AS exam_id,
      ae.id AS conflicting_exam_id,
      ae.title AS conflicting_exam_title,
      'shared_students'::text AS reason
    FROM base_exams be
    JOIN all_exams ae
      ON ae.id <> be.id
     AND be.start_time < ae.end_time
     AND be.end_time > ae.start_time
    JOIN base_exam_students bes
      ON bes.exam_id = be.id
    JOIN all_exam_students aes
      ON aes.exam_id = ae.id
     AND aes.student_id = bes.student_id
  ),
  same_room_conflicts AS (
    SELECT DISTINCT
      be.id AS exam_id,
      ae.id AS conflicting_exam_id,
      ae.title AS conflicting_exam_title,
      'same_room'::text AS reason
    FROM base_exams be
    JOIN all_exams ae
      ON ae.id <> be.id
     AND be.start_time < ae.end_time
     AND be.end_time > ae.start_time
    WHERE be.room IS NOT NULL
      AND ae.room IS NOT NULL
      AND lower(trim(be.room)) = lower(trim(ae.room))
  )
  SELECT * FROM shared_students_conflicts
  UNION
  SELECT * FROM same_room_conflicts;
$$;

REVOKE ALL ON FUNCTION public.get_schedule_conflicts_for_scope(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_schedule_conflicts_for_scope(uuid[]) TO authenticated;
