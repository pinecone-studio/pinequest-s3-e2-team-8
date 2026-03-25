"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

/** exam owner, admin, OR teaching-assignment teacher can manage */
async function canManageExam(
  supabase: SupabaseServerClient,
  examId: string,
  userId: string
): Promise<boolean> {
  if (await isAdminUser(supabase, userId)) return true;

  // Owner check
  const { data: own } = await supabase
    .from("exams")
    .select("id")
    .eq("id", examId)
    .eq("created_by", userId)
    .maybeSingle();
  if (own) return true;

  // Teaching-assignment: teacher must have assignment for exam's subject in one of exam's groups
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

  const groupIds = examAssignments.map((a) => a.group_id);

  const { data: ta } = await supabase
    .from("teaching_assignments")
    .select("id")
    .eq("teacher_id", userId)
    .eq("subject_id", examData.subject_id)
    .in("group_id", groupIds)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return !!ta;
}

async function applyLocalConflictFallback(
  supabase: SupabaseServerClient,
  rows: ExamRow[]
) {
  const allGroupIds = new Set<string>();
  for (const exam of rows) {
    for (const g of exam.groups) allGroupIds.add(g.id);
  }

  const groupStudentMap = new Map<string, Set<string>>();

  if (allGroupIds.size > 0) {
    const { data: memberRows } = await supabase
      .from("student_group_members")
      .select("student_id, group_id")
      .in("group_id", [...allGroupIds]);

    for (const member of memberRows ?? []) {
      if (!groupStudentMap.has(member.group_id)) {
        groupStudentMap.set(member.group_id, new Set());
      }
      groupStudentMap.get(member.group_id)?.add(member.student_id);
    }
  }

  function getExamStudents(exam: ExamRow): Set<string> {
    const students = new Set<string>();
    for (const group of exam.groups) {
      for (const studentId of groupStudentMap.get(group.id) ?? []) {
        students.add(studentId);
      }
    }
    return students;
  }

  for (const exam of rows) {
    const eStart = new Date(exam.start_time).getTime();
    const eEnd = new Date(exam.end_time).getTime();
    const examStudents = getExamStudents(exam);

    for (const other of rows) {
      if (other.id === exam.id) continue;

      const oStart = new Date(other.start_time).getTime();
      const oEnd = new Date(other.end_time).getTime();
      const overlaps = eStart < oEnd && eEnd > oStart;

      if (!overlaps) continue;

      const otherStudents = getExamStudents(other);
      const hasStudentOverlap =
        examStudents.size > 0 &&
        [...examStudents].some((studentId) => otherStudents.has(studentId));

      if (
        hasStudentOverlap &&
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

      const sameRoom =
        exam.room &&
        other.room &&
        exam.room.trim().toLowerCase() === other.room.trim().toLowerCase();

      if (
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

/** Багшийн scope дахь бүх шалгалтыг room болон conflict мэдээлэлтэй авах */
export async function getExamSchedules() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = await isAdminUser(supabase, user.id);

  // ── Scope дахь exam_id-ийг цуглуулах ──────────────────────────────
  const scopeIds = new Set<string>();

  if (admin) {
    const { data } = await supabase.from("exams").select("id");
    for (const e of data ?? []) scopeIds.add(e.id);
  } else {
    // Өөрийн үүсгэсэн
    const { data: own } = await supabase
      .from("exams")
      .select("id")
      .eq("created_by", user.id);
    for (const e of own ?? []) scopeIds.add(e.id);

    // Teaching assignment: group+subject хосоор тулгах
    const { data: taRows } = await supabase
      .from("teaching_assignments")
      .select("group_id, subject_id")
      .eq("teacher_id", user.id)
      .eq("is_active", true);

    if (taRows && taRows.length > 0) {
      const groupIds = [...new Set(taRows.map((r) => r.group_id))];
      const { data: assigned } = await supabase
        .from("exam_assignments")
        .select("exam_id, group_id, exams(subject_id)")
        .in("group_id", groupIds);

      for (const ae of assigned ?? []) {
        const subjectId = Array.isArray(ae.exams)
          ? ae.exams[0]?.subject_id
          : (ae.exams as { subject_id: string } | null)?.subject_id;
        // group+subject хос таарч байвал л оруулна
        if (taRows.find((ta) => ta.subject_id === subjectId && ta.group_id === ae.group_id)) {
          scopeIds.add(ae.exam_id);
        }
      }
    }
  }

  const examIds = [...scopeIds];
  if (examIds.length === 0) return [];

  // ── Шалгалтуудыг дэлгэрэнгүй мэдээлэлтэй авах ────────────────────
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
      .map((a) => {
        const g = Array.isArray(a.student_groups)
          ? a.student_groups[0]
          : a.student_groups;
        return g ? { id: (g as { id: string; name: string }).id, name: (g as { id: string; name: string }).name } : null;
      })
      .filter((g): g is { id: string; name: string } => g !== null);

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

  const { data: conflictRows, error: conflictError } = await supabase.rpc(
    "get_schedule_conflicts_for_scope",
    {
      p_exam_ids: examIds,
    }
  );

  if (conflictError) {
    await applyLocalConflictFallback(supabase, rows);
    return rows;
  }

  const rowMap = new Map(rows.map((row) => [row.id, row]));
  for (const conflict of conflictRows ?? []) {
    const row = rowMap.get(conflict.exam_id as string);
    if (!row) continue;

    const reason = conflict.reason as ConflictReason;
    const examTitle = String(conflict.conflicting_exam_title ?? "Бусад шалгалт");
    const exists = row.conflicts.find(
      (item) => item.examTitle === examTitle && item.reason === reason
    );

    if (!exists) {
      row.conflicts.push({ examTitle, reason });
    }
  }

  return rows;
}

/** Шалгалтад танхим оноох / шинэчлэх */
export async function setExamRoom(examId: string, room: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const canManage = await canManageExam(supabase, examId, user.id);
  if (!canManage) return { error: "Энэ шалгалтад өөрчлөлт хийх эрх алга" };

  const { data: exam } = await supabase
    .from("exams")
    .select("start_time, end_time")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return { error: "Шалгалт олдсонгүй" };

  if (!room || room.trim() === "") {
    await supabase.from("exam_schedules").delete().eq("exam_id", examId);
    revalidatePath("/educator/schedule");
    return { success: true };
  }

  const { error } = await supabase.from("exam_schedules").upsert(
    {
      exam_id: examId,
      room: room.trim(),
      start_time: exam.start_time,
      end_time: exam.end_time,
    },
    { onConflict: "exam_id" }
  );

  if (error) {
    // PostgreSQL EXCLUDE constraint violation (room overlap)
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
