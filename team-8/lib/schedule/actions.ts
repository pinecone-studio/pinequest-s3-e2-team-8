"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasUnavoidableExamWindowConflict } from "@/lib/exam-window-conflicts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ConflictReason = "shared_students" | "same_room";

type ConflictInfo = {
  examTitle: string;
  reason: ConflictReason;
};

type ExamRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
  subject_name: string | null;
  room: string | null;
  groups: { id: string; name: string }[];
  conflicts: ConflictInfo[];
};

function getOccupiedEndMs(exam: Pick<ExamRow, "end_time" | "duration_minutes">) {
  const closeTimeMs = new Date(exam.end_time).getTime();
  const durationMs = Number(exam.duration_minutes ?? 0) * 60 * 1000;

  if (
    Number.isNaN(closeTimeMs) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return closeTimeMs;
  }

  return closeTimeMs + durationMs;
}

async function isAdminUser(
  supabase: SupabaseServerClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return data?.role === "admin";
}

async function canManageExam(
  supabase: SupabaseServerClient,
  examId: string,
  userId: string
): Promise<boolean> {
  if (await isAdminUser(supabase, userId)) return true;

  const { data: own } = await supabase
    .from("exams")
    .select("id")
    .eq("id", examId)
    .eq("created_by", userId)
    .maybeSingle();

  if (own) return true;

  const { data: examData } = await supabase
    .from("exams")
    .select("subject_id")
    .eq("id", examId)
    .maybeSingle();

  if (!examData?.subject_id) return false;

  const { data: examAssignments } = await supabase
    .from("exam_assignments")
    .select("group_id")
    .eq("exam_id", examId);

  if (!examAssignments || examAssignments.length === 0) return false;

  const groupIds = examAssignments.map((assignment) => assignment.group_id);

  const { data: teachingAssignment } = await supabase
    .from("teaching_assignments")
    .select("id")
    .eq("teacher_id", userId)
    .eq("subject_id", examData.subject_id)
    .in("group_id", groupIds)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return Boolean(teachingAssignment);
}

async function applyLocalConflictFallback(
  supabase: SupabaseServerClient,
  rows: ExamRow[]
) {
  const allGroupIds = new Set<string>();
  for (const exam of rows) {
    for (const group of exam.groups) {
      allGroupIds.add(group.id);
    }
  }

  const groupStudentMap = new Map<string, Set<string>>();

  if (allGroupIds.size > 0) {
    const { data: memberRows } = await supabase
      .from("student_group_members")
      .select("student_id, group_id")
      .in("group_id", [...allGroupIds]);

    for (const member of memberRows ?? []) {
      const groupId = String(member.group_id);
      const existing = groupStudentMap.get(groupId) ?? new Set<string>();
      existing.add(String(member.student_id));
      groupStudentMap.set(groupId, existing);
    }
  }

  function getExamStudents(exam: ExamRow) {
    const students = new Set<string>();

    for (const group of exam.groups) {
      for (const studentId of groupStudentMap.get(group.id) ?? []) {
        students.add(studentId);
      }
    }

    return students;
  }

  for (const exam of rows) {
    const examStudents = getExamStudents(exam);
    const examStartMs = new Date(exam.start_time).getTime();
    const examOccupiedEndMs = getOccupiedEndMs(exam);

    for (const other of rows) {
      if (other.id === exam.id) continue;

      const otherStudents = getExamStudents(other);
      const hasStudentOverlap =
        examStudents.size > 0 &&
        [...examStudents].some((studentId) => otherStudents.has(studentId));

      const sharedStudentConflict =
        hasStudentOverlap && hasUnavoidableExamWindowConflict(exam, other);

      if (
        sharedStudentConflict &&
        !exam.conflicts.find(
          (conflict) =>
            conflict.examTitle === other.title &&
            conflict.reason === "shared_students"
        )
      ) {
        exam.conflicts.push({
          examTitle: other.title,
          reason: "shared_students",
        });
      }

      const otherStartMs = new Date(other.start_time).getTime();
      const otherOccupiedEndMs = getOccupiedEndMs(other);
      const sameRoom =
        exam.room &&
        other.room &&
        exam.room.trim().toLowerCase() === other.room.trim().toLowerCase();
      const roomOverlaps =
        examStartMs < otherOccupiedEndMs && examOccupiedEndMs > otherStartMs;

      if (
        roomOverlaps &&
        sameRoom &&
        !exam.conflicts.find(
          (conflict) =>
            conflict.examTitle === other.title &&
            conflict.reason === "same_room"
        )
      ) {
        exam.conflicts.push({
          examTitle: other.title,
          reason: "same_room",
        });
      }
    }
  }
}

export async function getExamSchedules() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const admin = await isAdminUser(supabase, user.id);
  const scopeIds = new Set<string>();

  if (admin) {
    const { data } = await supabase.from("exams").select("id");
    for (const exam of data ?? []) {
      scopeIds.add(exam.id);
    }
  } else {
    const { data: ownExams } = await supabase
      .from("exams")
      .select("id")
      .eq("created_by", user.id);

    for (const exam of ownExams ?? []) {
      scopeIds.add(exam.id);
    }

    const { data: teachingAssignments } = await supabase
      .from("teaching_assignments")
      .select("group_id, subject_id")
      .eq("teacher_id", user.id)
      .eq("is_active", true);

    if (teachingAssignments && teachingAssignments.length > 0) {
      const groupIds = [
        ...new Set(teachingAssignments.map((assignment) => assignment.group_id)),
      ];

      const { data: assignedExams } = await supabase
        .from("exam_assignments")
        .select("exam_id, group_id, exams(subject_id)")
        .in("group_id", groupIds);

      for (const assignment of assignedExams ?? []) {
        const subjectId = Array.isArray(assignment.exams)
          ? assignment.exams[0]?.subject_id
          : (assignment.exams as { subject_id: string } | null)?.subject_id;

        if (
          teachingAssignments.find(
            (teachingAssignment) =>
              teachingAssignment.subject_id === subjectId &&
              teachingAssignment.group_id === assignment.group_id
          )
        ) {
          scopeIds.add(assignment.exam_id);
        }
      }
    }
  }

  const examIds = [...scopeIds];
  if (examIds.length === 0) return [];

  const { data: exams } = await supabase
    .from("exams")
    .select(
      `
      id, title, start_time, end_time, duration_minutes, is_published,
      subjects(id, name),
      exam_schedules(room),
      exam_assignments(
        group_id,
        student_groups(id, name)
      )
    `
    )
    .in("id", examIds)
    .order("start_time", { ascending: true });

  if (!exams) return [];

  const rows: ExamRow[] = exams.map((exam) => {
    const schedule = Array.isArray(exam.exam_schedules)
      ? exam.exam_schedules[0]
      : exam.exam_schedules;
    const subject = Array.isArray(exam.subjects)
      ? exam.subjects[0]
      : exam.subjects;
    const assignments = Array.isArray(exam.exam_assignments)
      ? exam.exam_assignments
      : exam.exam_assignments
        ? [exam.exam_assignments]
        : [];

    const groups = assignments
      .map((assignment) => {
        const group = Array.isArray(assignment.student_groups)
          ? assignment.student_groups[0]
          : assignment.student_groups;

        return group
          ? {
              id: (group as { id: string; name: string }).id,
              name: (group as { id: string; name: string }).name,
            }
          : null;
      })
      .filter((group): group is { id: string; name: string } => group !== null);

    return {
      id: exam.id,
      title: exam.title,
      start_time: exam.start_time,
      end_time: exam.end_time,
      duration_minutes: exam.duration_minutes,
      is_published: exam.is_published,
      subject_name: (subject as { name: string } | null)?.name ?? null,
      room: (schedule as { room: string } | null)?.room ?? null,
      groups,
      conflicts: [],
    };
  });

  await applyLocalConflictFallback(supabase, rows);
  return rows;
}

export async function setExamRoom(examId: string, room: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Нэвтрээгүй байна" };

  const canManage = await canManageExam(supabase, examId, user.id);
  if (!canManage) {
    return { error: "Энэ шалгалтад өөрчлөлт хийх эрх алга" };
  }

  const { data: exam } = await supabase
    .from("exams")
    .select("start_time, end_time, duration_minutes")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return { error: "Шалгалт олдсонгүй" };

  if (!room || room.trim() === "") {
    await supabase.from("exam_schedules").delete().eq("exam_id", examId);
    revalidatePath("/educator/schedule");
    return { success: true };
  }

  const occupiedEndMs = getOccupiedEndMs({
    end_time: exam.end_time,
    duration_minutes: Number(exam.duration_minutes ?? 0),
  });
  const occupiedEndTime = Number.isNaN(occupiedEndMs)
    ? exam.end_time
    : new Date(occupiedEndMs).toISOString();

  const { error } = await supabase.from("exam_schedules").upsert(
    {
      exam_id: examId,
      room: room.trim(),
      start_time: exam.start_time,
      end_time: occupiedEndTime,
    },
    { onConflict: "exam_id" }
  );

  if (error) {
    if (error.code === "23P01") {
      return {
        error: `"${room.trim()}" танхим энэ цагт өөр шалгалтад ашиглагдаж байна`,
      };
    }

    return { error: error.message };
  }

  revalidatePath("/educator/schedule");
  return { success: true };
}
