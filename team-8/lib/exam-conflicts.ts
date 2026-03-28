import { createClient } from "@/lib/supabase/server";
import { hasUnavoidableExamWindowConflict } from "@/lib/exam-window-conflicts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface ScheduledExam {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
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
    conflicts.length > 3 ? ` болон өөр ${conflicts.length - 3} зөрчил` : "";

  return `"${examTitle}" шалгалтыг оноох боломжгүй. Давхцаж буй шалгалтын жишээ: ${examples}${suffix}.`;
}

async function getExamSchedule(
  supabase: SupabaseServerClient,
  examId: string
): Promise<ScheduledExam | null> {
  const { data } = await supabase
    .from("exams")
    .select("id, title, start_time, end_time, duration_minutes")
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

  return Array.from(new Set((data ?? []).map((member) => member.student_id)));
}

async function collectStudentAssignmentConflicts(
  supabase: SupabaseServerClient,
  exam: ScheduledExam,
  groupIds: string[]
) {
  if (groupIds.length === 0) return { rows: [] as ConflictRow[] };

  const { data: targetMembers, error: targetMembersError } = await supabase
    .from("student_group_members")
    .select("student_id")
    .in("group_id", groupIds);

  if (targetMembersError) {
    return {
      error: `Шалгалтын давхцлыг шалгах үед алдаа гарлаа: ${targetMembersError.message}`,
    };
  }

  const studentIds = Array.from(
    new Set((targetMembers ?? []).map((member) => String(member.student_id)))
  );

  if (studentIds.length === 0) return { rows: [] as ConflictRow[] };

  const [
    { data: profiles, error: profilesError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").in("id", studentIds),
    supabase
      .from("student_group_members")
      .select("student_id, group_id")
      .in("student_id", studentIds),
  ]);

  if (profilesError) {
    return {
      error: `Шалгалтын давхцлыг шалгах үед алдаа гарлаа: ${profilesError.message}`,
    };
  }

  if (membershipsError) {
    return {
      error: `Шалгалтын давхцлыг шалгах үед алдаа гарлаа: ${membershipsError.message}`,
    };
  }

  const profileNameById = new Map(
    (profiles ?? []).map((profile) => [
      String(profile.id),
      profile.full_name ?? profile.email ?? "Сурагч",
    ])
  );

  const groupIdsByStudent = new Map<string, Set<string>>();
  for (const membership of memberships ?? []) {
    const studentId = String(membership.student_id);
    const existing = groupIdsByStudent.get(studentId) ?? new Set<string>();
    existing.add(String(membership.group_id));
    groupIdsByStudent.set(studentId, existing);
  }

  const relatedGroupIds = Array.from(
    new Set((memberships ?? []).map((membership) => String(membership.group_id)))
  );

  if (relatedGroupIds.length === 0) return { rows: [] as ConflictRow[] };

  const { data: assignedExamRows, error: assignedExamsError } = await supabase
    .from("exam_assignments")
    .select("group_id, exams!inner(id, title, start_time, end_time, duration_minutes)")
    .in("group_id", relatedGroupIds);

  if (assignedExamsError) {
    return {
      error: `Шалгалтын давхцлыг шалгах үед алдаа гарлаа: ${assignedExamsError.message}`,
    };
  }

  const rows: ConflictRow[] = [];
  const seen = new Set<string>();

  for (const studentId of studentIds) {
    const studentGroupIds = groupIdsByStudent.get(studentId) ?? new Set<string>();

    for (const assignment of assignedExamRows ?? []) {
      if (!studentGroupIds.has(String(assignment.group_id))) continue;

      const conflictingExam = Array.isArray(assignment.exams)
        ? assignment.exams[0]
        : assignment.exams;

      if (!conflictingExam || String(conflictingExam.id) === exam.id) continue;

      if (
        !hasUnavoidableExamWindowConflict(exam, {
          start_time: String(conflictingExam.start_time),
          end_time: String(conflictingExam.end_time),
          duration_minutes: Number(conflictingExam.duration_minutes ?? 0),
        })
      ) {
        continue;
      }

      const conflictKey = `${studentId}:${String(conflictingExam.id)}`;
      if (seen.has(conflictKey)) continue;
      seen.add(conflictKey);

      rows.push({
        student_id: studentId,
        student_name: profileNameById.get(studentId) ?? "Сурагч",
        conflicting_exam_id: String(conflictingExam.id),
        conflicting_exam_title: String(
          conflictingExam.title ?? "Өөр шалгалт"
        ),
      });
    }
  }

  return { rows };
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
  overrides?: Partial<
    Pick<ScheduledExam, "title" | "start_time" | "end_time" | "duration_minutes">
  >
) {
  const exam = await getExamSchedule(supabase, examId);
  if (!exam) return "Шалгалтын хуваарь олдсонгүй";

  const targetExam: ScheduledExam = {
    ...exam,
    title: overrides?.title ?? exam.title,
    start_time: overrides?.start_time ?? exam.start_time,
    end_time: overrides?.end_time ?? exam.end_time,
    duration_minutes: overrides?.duration_minutes ?? exam.duration_minutes,
  };

  const studentIds = await getGroupStudentIds(supabase, groupId);
  if (studentIds.length === 0) return null;

  const conflictResult = await collectStudentAssignmentConflicts(
    supabase,
    targetExam,
    [groupId]
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

export async function getExamAssignmentConflictError(
  supabase: SupabaseServerClient,
  examId: string,
  overrides?: Partial<
    Pick<ScheduledExam, "title" | "start_time" | "end_time" | "duration_minutes">
  >
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
    duration_minutes: overrides?.duration_minutes ?? exam.duration_minutes,
  };

  const conflictResult = await collectStudentAssignmentConflicts(
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
  const { data: groupExamRows } = await supabase
    .from("exam_assignments")
    .select("exam_id, exams!inner(id, title, start_time, end_time, duration_minutes)")
    .eq("group_id", groupId);

  if (!groupExamRows || groupExamRows.length === 0) return null;

  const { data: memberRows } = await supabase
    .from("student_group_members")
    .select("group_id")
    .eq("student_id", studentId)
    .neq("group_id", groupId);

  if (!memberRows || memberRows.length === 0) return null;

  const otherGroupIds = memberRows.map((row) => row.group_id);

  const { data: otherExamRows } = await supabase
    .from("exam_assignments")
    .select("exam_id, exams!inner(id, title, start_time, end_time, duration_minutes)")
    .in("group_id", otherGroupIds);

  if (!otherExamRows || otherExamRows.length === 0) return null;

  for (const groupExamRow of groupExamRows) {
    const exam = Array.isArray(groupExamRow.exams)
      ? groupExamRow.exams[0]
      : groupExamRow.exams;
    if (!exam) continue;

    for (const otherExamRow of otherExamRows) {
      const other = Array.isArray(otherExamRow.exams)
        ? otherExamRow.exams[0]
        : otherExamRow.exams;
      if (!other || other.id === exam.id) continue;

      if (
        hasUnavoidableExamWindowConflict(
          {
            start_time: String(exam.start_time),
            end_time: String(exam.end_time),
            duration_minutes: Number(exam.duration_minutes ?? 0),
          },
          {
            start_time: String(other.start_time),
            end_time: String(other.end_time),
            duration_minutes: Number(other.duration_minutes ?? 0),
          }
        )
      ) {
        return buildConflictError(exam.title, [
          { studentName: "Сурагч", conflictingExamTitle: other.title },
        ]);
      }
    }
  }

  return null;
}
