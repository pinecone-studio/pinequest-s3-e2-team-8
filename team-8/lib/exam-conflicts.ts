import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface ScheduledExam {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
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

async function getConflictingAssignmentsForStudents(
  supabase: SupabaseServerClient,
  studentIds: string[],
  exam: ScheduledExam
) {
  if (studentIds.length === 0) return [];

  const { data } = await supabase
    .from("exam_recipients")
    .select(
      `
      student_id,
      exams!inner(id, title, start_time, end_time),
      profiles!exam_recipients_student_id_fkey(full_name, email)
    `
    )
    .in("student_id", studentIds)
    .neq("exam_id", exam.id)
    .lt("exams.start_time", exam.end_time)
    .gt("exams.end_time", exam.start_time);

  return data ?? [];
}

export async function getGroupAssignmentConflictError(
  supabase: SupabaseServerClient,
  groupId: string,
  examId: string
) {
  const exam = await getExamSchedule(supabase, examId);
  if (!exam) return "Шалгалтын хуваарь олдсонгүй";

  const studentIds = await getGroupStudentIds(supabase, groupId);
  if (studentIds.length === 0) return null;

  const conflicts = await getConflictingAssignmentsForStudents(
    supabase,
    studentIds,
    exam
  );

  if (conflicts.length === 0) return null;

  return buildConflictError(
    exam.title,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conflicts.map((conflict: any) => ({
      studentName:
        conflict.profiles?.full_name ||
        conflict.profiles?.email ||
        "Сурагч",
      conflictingExamTitle: conflict.exams?.title || "Өөр шалгалт",
    }))
  );
}

export async function getGroupMemberConflictError(
  supabase: SupabaseServerClient,
  groupId: string,
  studentId: string
) {
  const { data: assignedExams } = await supabase
    .from("exam_assignments")
    .select("exam_id, exams!inner(id, title, start_time, end_time, is_published)")
    .eq("group_id", groupId)
    .eq("exams.is_published", true);

  for (const assignment of assignedExams ?? []) {
    const exam = Array.isArray(assignment.exams)
      ? assignment.exams[0]
      : assignment.exams;

    if (!exam) continue;

    const conflicts = await getConflictingAssignmentsForStudents(
      supabase,
      [studentId],
      exam
    );

    if (conflicts.length > 0) {
      return buildConflictError(
        exam.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conflicts.map((conflict: any) => ({
          studentName:
            conflict.profiles?.full_name ||
            conflict.profiles?.email ||
            "Сурагч",
          conflictingExamTitle: conflict.exams?.title || "Өөр шалгалт",
        }))
      );
    }
  }

  return null;
}
