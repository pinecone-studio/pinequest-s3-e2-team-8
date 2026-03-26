import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
const EXAM_SCHEDULING_GUARD_ERROR =
  "Шалгалтын давхцал шалгах шинэчлэл идэвхжээгүй байна. Хамгийн сүүлийн DB migration-аа apply хийнэ үү.";

interface ScheduledExam {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
}

interface ConflictRow {
  student_id: string;
  student_name: string | null;
  conflicting_exam_id: string;
  conflicting_exam_title: string | null;
}

function buildConflictError(
  examTitle: string,
  conflicts: Array<{ studentName: string; conflictingExamTitle: string }>
) {
  const examples = conflicts
    .slice(0, 3)
    .map(
      (conflict) =>
        `${conflict.studentName} -> ${conflict.conflictingExamTitle}`
    )
    .join(", ");

  const suffix =
    conflicts.length > 3
      ? ` болон өөр ${conflicts.length - 3} зөрчил`
      : "";

  return `"${examTitle}" шалгалтыг оноох боломжгүй. Давхцаж буй шалгалтын жишээ: ${examples}${suffix}.`;
}

async function getExamSchedule(
  supabase: SupabaseServerClient,
  examId: string
): Promise<ScheduledExam | null> {
  const { data } = await supabase
    .from("exams")
    .select("id, title, start_time, end_time")
    .eq("id", examId)
    .maybeSingle();

  return data;
}

async function getGroupStudentIds(
  supabase: SupabaseServerClient,
  groupId: string
) {
  const { data } = await supabase
    .from("student_group_members")
    .select("student_id")
    .eq("group_id", groupId);

  return Array.from(
    new Set((data ?? []).map((member) => member.student_id))
  );
}

async function getConflictingAssignmentsForStudentsViaRpc(
  supabase: SupabaseServerClient,
  exam: ScheduledExam,
  groupIds: string[]
) {
  if (groupIds.length === 0) return { rows: [] as ConflictRow[] };

  const { data, error } = await supabase.rpc("get_exam_assignment_conflicts", {
    p_exam_id: exam.id,
    p_group_ids: groupIds,
    p_start_time: exam.start_time,
    p_end_time: exam.end_time,
  });

  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      return { error: EXAM_SCHEDULING_GUARD_ERROR };
    }

    return {
      error: `Шалгалтын давхцлыг шалгах үед алдаа гарлаа: ${error.message}`,
    };
  }

  return { rows: (data ?? []) as ConflictRow[] };
}

async function getAssignedGroupIdsForExam(
  supabase: SupabaseServerClient,
  examId: string
) {
  const { data } = await supabase
    .from("exam_assignments")
    .select("group_id")
    .eq("exam_id", examId);

  return Array.from(new Set((data ?? []).map((row) => row.group_id)));
}

export async function getGroupAssignmentConflictError(
  supabase: SupabaseServerClient,
  groupId: string,
  examId: string,
  overrides?: Partial<Pick<ScheduledExam, "title" | "start_time" | "end_time">>
) {
  const exam = await getExamSchedule(supabase, examId);
  if (!exam) return "Шалгалтын хуваарь олдсонгүй";

  const targetExam: ScheduledExam = {
    ...exam,
    title: overrides?.title ?? exam.title,
    start_time: overrides?.start_time ?? exam.start_time,
    end_time: overrides?.end_time ?? exam.end_time,
  };

  const studentIds = await getGroupStudentIds(supabase, groupId);
  if (studentIds.length === 0) return null;

  const conflictResult = await getConflictingAssignmentsForStudentsViaRpc(
    supabase,
    targetExam,
    [groupId]
  );
  if ("error" in conflictResult) return conflictResult.error;

  const conflicts = conflictResult.rows;

  if (conflicts.length === 0) return null;

  return buildConflictError(
    targetExam.title,
    conflicts.map((conflict) => ({
      studentName: conflict.student_name || "Сурагч",
      conflictingExamTitle: conflict.conflicting_exam_title || "Өөр шалгалт",
    }))
  );
}

export async function getExamAssignmentConflictError(
  supabase: SupabaseServerClient,
  examId: string,
  overrides?: Partial<Pick<ScheduledExam, "title" | "start_time" | "end_time">>
) {
  const exam = await getExamSchedule(supabase, examId);
  if (!exam) return "Шалгалтын хуваарь олдсонгүй";

  const assignedGroupIds = await getAssignedGroupIdsForExam(supabase, examId);
  if (assignedGroupIds.length === 0) return null;

  const targetExam: ScheduledExam = {
    ...exam,
    title: overrides?.title ?? exam.title,
    start_time: overrides?.start_time ?? exam.start_time,
    end_time: overrides?.end_time ?? exam.end_time,
  };

  const conflictResult = await getConflictingAssignmentsForStudentsViaRpc(
    supabase,
    targetExam,
    assignedGroupIds
  );
  if ("error" in conflictResult) return conflictResult.error;

  if (conflictResult.rows.length === 0) return null;

  return buildConflictError(
    targetExam.title,
    conflictResult.rows.map((conflict) => ({
      studentName: conflict.student_name || "Сурагч",
      conflictingExamTitle: conflict.conflicting_exam_title || "Өөр шалгалт",
    }))
  );
}

export async function getGroupMemberConflictError(
  supabase: SupabaseServerClient,
  groupId: string,
  studentId: string
) {
  // Get all exams assigned to the target group
  const { data: groupExamRows } = await supabase
    .from("exam_assignments")
    .select("exam_id, exams!inner(id, title, start_time, end_time)")
    .eq("group_id", groupId);

  if (!groupExamRows || groupExamRows.length === 0) return null;

  // Get all other groups the student already belongs to
  const { data: memberRows } = await supabase
    .from("student_group_members")
    .select("group_id")
    .eq("student_id", studentId)
    .neq("group_id", groupId);

  if (!memberRows || memberRows.length === 0) return null;

  const otherGroupIds = memberRows.map((r) => r.group_id);

  // Get all exams assigned to the student's other groups
  const { data: otherExamRows } = await supabase
    .from("exam_assignments")
    .select("exam_id, exams!inner(id, title, start_time, end_time)")
    .in("group_id", otherGroupIds);

  if (!otherExamRows || otherExamRows.length === 0) return null;

  // Check for time overlaps in memory (no N+1 queries)
  for (const ge of groupExamRows) {
    const exam = Array.isArray(ge.exams) ? ge.exams[0] : ge.exams;
    if (!exam) continue;
    const examStart = new Date(exam.start_time).getTime();
    const examEnd = new Date(exam.end_time).getTime();

    for (const oe of otherExamRows) {
      const other = Array.isArray(oe.exams) ? oe.exams[0] : oe.exams;
      if (!other || other.id === exam.id) continue;
      const otherStart = new Date(other.start_time).getTime();
      const otherEnd = new Date(other.end_time).getTime();

      if (examStart < otherEnd && examEnd > otherStart) {
        return buildConflictError(exam.title, [
          { studentName: "Сурагч", conflictingExamTitle: other.title },
        ]);
      }
    }
  }

  return null;
}
