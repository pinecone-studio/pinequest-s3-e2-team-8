-- ================================================================
-- Migration 017: global student-level assignment conflict checker
--
-- Used by create / assign / update / publish flows so a single student
-- can never be scheduled into overlapping exams through class/elective
-- memberships or multiple elective groups.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_exam_assignment_conflicts(
  p_exam_id uuid,
  p_group_ids uuid[],
  p_start_time timestamptz DEFAULT NULL,
  p_end_time timestamptz DEFAULT NULL
)
RETURNS TABLE (
  student_id uuid,
  student_name text,
  conflicting_exam_id uuid,
  conflicting_exam_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base_exam AS (
    SELECT
      e.id,
      COALESCE(p_start_time, e.start_time) AS start_time,
      COALESCE(p_end_time, e.end_time) AS end_time
    FROM public.exams e
    WHERE e.id = p_exam_id
      AND public.auth_is_exam_owner_or_admin(e.id)
  ),
  target_groups AS (
    SELECT DISTINCT unnest(COALESCE(p_group_ids, ARRAY[]::uuid[])) AS group_id
  ),
  target_students AS (
    SELECT DISTINCT
      sgm.student_id,
      COALESCE(p.full_name, p.email, 'Сурагч') AS student_name
    FROM target_groups tg
    JOIN public.student_group_members sgm
      ON sgm.group_id = tg.group_id
    LEFT JOIN public.profiles p
      ON p.id = sgm.student_id
  )
  SELECT DISTINCT
    ts.student_id,
    ts.student_name,
    e2.id AS conflicting_exam_id,
    e2.title AS conflicting_exam_title
  FROM base_exam be
  JOIN target_students ts
    ON true
  JOIN public.student_group_members sgm2
    ON sgm2.student_id = ts.student_id
  JOIN public.exam_assignments ea
    ON ea.group_id = sgm2.group_id
  JOIN public.exams e2
    ON e2.id = ea.exam_id
  WHERE e2.id <> be.id
    AND be.start_time < e2.end_time
    AND be.end_time > e2.start_time;
$$;

REVOKE ALL ON FUNCTION public.get_exam_assignment_conflicts(uuid, uuid[], timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_assignment_conflicts(uuid, uuid[], timestamptz, timestamptz) TO authenticated;
