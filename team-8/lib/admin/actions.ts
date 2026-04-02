"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildExamLifecycleMap,
  type ExamLifecycleSummary,
} from "@/lib/exam-lifecycle";
import { getExamPublishGuardError } from "@/lib/exam-readiness";
import { syncExamRecipients } from "@/lib/exam-recipients";
import {
  buildPublishedExamSnapshot,
  isSnapshotColumnMissingError,
  primePublishedExamSnapshotCache,
} from "@/lib/exam-snapshot";
import { prewarmExamCache } from "@/lib/student/actions";


export async function getAdminStats() {
  const supabase = await createClient();

  const [usersRes, teachersRes, studentsRes, examsRes, sessionsRes] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
      supabase.from("exams").select("id", { count: "exact", head: true }),
      supabase
        .from("exam_sessions")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "graded"]),
    ]);

  return {
    totalUsers:    usersRes.count    ?? 0,
    totalTeachers: teachersRes.count ?? 0,
    totalStudents: studentsRes.count ?? 0,
    totalExams:    examsRes.count    ?? 0,
    totalSessions: sessionsRes.count ?? 0,
  };
}

export async function getAllUsers(role?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (role) query = query.eq("role", role);

  const { data } = await query;
  return data ?? [];
}

export type AdminExamOverview = {
  id: string;
  title: string;
  description: string | null;
  subjectName: string | null;
  questionCount: number;
  isPublished: boolean;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  assignedGroupCount: number;
  assignedStudentCount: number;
  pendingGradingCount: number;
  gradedCount: number;
  inProgressCount: number;
  lifecycle: ExamLifecycleSummary | null;
};

export async function getAdminExamOverview(): Promise<AdminExamOverview[]> {
  const supabase = await createClient();

  const { data: exams } = await supabase
    .from("exams")
    .select(
      "id, title, description, subject_id, is_published, start_time, end_time, duration_minutes, created_at, subjects(name), questions(count)"
    )
    .order("created_at", { ascending: false });

  const examRows = exams ?? [];
  if (examRows.length === 0) return [];

  const lifecycleMap = await buildExamLifecycleMap(
    supabase,
    examRows.map((exam) => ({
      id: exam.id,
      subject_id: exam.subject_id,
      start_time: exam.start_time,
      end_time: exam.end_time,
      duration_minutes: Number(exam.duration_minutes ?? 0),
      is_published: Boolean(exam.is_published),
      questions: Array.isArray(exam.questions)
        ? exam.questions
        : exam.questions
          ? [exam.questions]
          : [],
    }))
  );

  const examIds = examRows.map((exam) => exam.id);
  const [{ data: assignmentRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from("exam_assignments")
      .select("exam_id, group_id")
      .in("exam_id", examIds),
    supabase
      .from("exam_sessions")
      .select("exam_id, status")
      .in("exam_id", examIds)
      .in("status", ["in_progress", "submitted", "graded"]),
  ]);

  const groupIds = Array.from(
    new Set((assignmentRows ?? []).map((row) => row.group_id))
  );

  const { data: memberRows } =
    groupIds.length > 0
      ? await supabase
          .from("student_group_members")
          .select("group_id, student_id")
          .in("group_id", groupIds)
      : { data: [] as Array<{ group_id: string; student_id: string }> };

  const studentIdsByGroup = new Map<string, Set<string>>();
  for (const member of memberRows ?? []) {
    const current = studentIdsByGroup.get(member.group_id) ?? new Set<string>();
    current.add(member.student_id);
    studentIdsByGroup.set(member.group_id, current);
  }

  const groupIdsByExam = new Map<string, string[]>();
  for (const row of assignmentRows ?? []) {
    const current = groupIdsByExam.get(row.exam_id) ?? [];
    current.push(row.group_id);
    groupIdsByExam.set(row.exam_id, current);
  }

  const sessionCountsByExam = new Map<
    string,
    {
      inProgressCount: number;
      pendingGradingCount: number;
      gradedCount: number;
    }
  >();

  for (const row of sessionRows ?? []) {
    const current = sessionCountsByExam.get(row.exam_id) ?? {
      inProgressCount: 0,
      pendingGradingCount: 0,
      gradedCount: 0,
    };

    if (row.status === "in_progress") current.inProgressCount += 1;
    if (row.status === "submitted") current.pendingGradingCount += 1;
    if (row.status === "graded") current.gradedCount += 1;

    sessionCountsByExam.set(row.exam_id, current);
  }

  return examRows.map((exam) => {
    const subject = Array.isArray(exam.subjects)
      ? exam.subjects[0]
      : exam.subjects;
    const groupIdsForExam = groupIdsByExam.get(exam.id) ?? [];
    const uniqueStudentIds = new Set<string>();

    groupIdsForExam.forEach((groupId) => {
      (studentIdsByGroup.get(groupId) ?? new Set<string>()).forEach(
        (studentId) => {
          uniqueStudentIds.add(studentId);
        }
      );
    });

    const sessionCounts = sessionCountsByExam.get(exam.id) ?? {
      inProgressCount: 0,
      pendingGradingCount: 0,
      gradedCount: 0,
    };

    return {
      id: exam.id,
      title: exam.title,
      description: exam.description ?? null,
      subjectName: subject?.name ?? null,
      questionCount: Array.isArray(exam.questions)
        ? (exam.questions[0]?.count ?? 0)
        : 0,
      isPublished: Boolean(exam.is_published),
      startTime: exam.start_time,
      endTime: exam.end_time,
      durationMinutes: Number(exam.duration_minutes ?? 0),
      assignedGroupCount: groupIdsForExam.length,
      assignedStudentCount: uniqueStudentIds.size,
      pendingGradingCount: sessionCounts.pendingGradingCount,
      gradedCount: sessionCounts.gradedCount,
      inProgressCount: sessionCounts.inProgressCount,
      lifecycle: lifecycleMap.get(exam.id) ?? null,
    };
  });
}

async function requireAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Нэвтрээгүй байна", userId: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return { error: "Админ эрх шаардлагатай", userId: null };
  }

  return { error: null, userId: user.id };
}

export async function approveAdminExam(examId: string) {
  const auth = await requireAdminUser();
  if (auth.error || !auth.userId) return { error: auth.error };

  const admin = createAdminClient();

  const { data: exam } = await admin
    .from("exams")
    .select("id, is_published")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) return { error: "Энэ шалгалт аль хэдийн батлагдсан." };

  const publishGuardError = await getExamPublishGuardError(
    admin,
    auth.userId,
    examId
  );
  if (publishGuardError) {
    return { error: publishGuardError };
  }

  const syncResult = await syncExamRecipients(admin, examId, auth.userId);
  if (!syncResult.success) {
    return { error: syncResult.error };
  }

  const snapshot = await buildPublishedExamSnapshot(admin, examId);
  if (!snapshot) {
    return { error: "Шалгалтын snapshot үүсгэж чадсангүй" };
  }

  try {
    await prewarmExamCache(examId, snapshot);
  } catch (prewarmError) {
    return {
      error:
        prewarmError instanceof Error
          ? `Шалгалтын cache бэлтгэхэд алдаа гарлаа: ${prewarmError.message}`
          : "Шалгалтын cache бэлтгэхэд алдаа гарлаа",
    };
  }

  const publishPayload = {
    is_published: true,
    published_snapshot: snapshot,
    published_at: snapshot.exam.published_at,
  };

  const { error } = await admin
    .from("exams")
    .update(publishPayload)
    .eq("id", examId);

  if (error && isSnapshotColumnMissingError(error.code)) {
    const fallback = await admin
      .from("exams")
      .update({ is_published: true })
      .eq("id", examId);

    if (fallback.error) return { error: fallback.error.message };
  } else if (error) {
    return { error: error.message };
  } else {
    await primePublishedExamSnapshotCache(examId, snapshot);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/teachers/exams");
  revalidatePath("/educator");
  revalidatePath(`/educator/exams/${examId}`);
  revalidatePath("/student");
  revalidatePath("/student/exams");
  revalidatePath("/student/schedule");
  revalidatePath("/student/results");
  revalidatePath(`/student/exams/${examId}/take`);
  revalidatePath(`/student/exams/${examId}/result`);

  return { success: true };
}

export async function rejectAdminExam(examId: string) {
  const auth = await requireAdminUser();
  if (auth.error || !auth.userId) return { error: auth.error };

  const admin = createAdminClient();

  const { data: exam } = await admin
    .from("exams")
    .select("id, is_published")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Батлагдсан шалгалтыг татгалзах боломжгүй." };
  }

  const { error } = await admin.from("exams").delete().eq("id", examId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/teachers/exams");
  revalidatePath("/educator");

  return { success: true };
}

// ── Teacher subject & assignment management ───────────────────────────────────

/** All teachers with their assigned subjects and teaching groups. */
export async function getTeachersWithAssignments() {
  const supabase = await createClient();

  const { data: teachers } = await supabase
    .from("profiles")
    .select("id, email, full_name, created_at")
    .eq("role", "teacher")
    .order("full_name", { ascending: true });

  if (!teachers || teachers.length === 0) return [];

  // Fetch all teacher_subjects and teaching_assignments in parallel
  const [subjectRows, assignmentRows] = await Promise.all([
    supabase
      .from("teacher_subjects")
      .select("teacher_id, subject_id, subjects(id, name)")
      .in("teacher_id", teachers.map((t) => t.id)),
    supabase
      .from("teaching_assignments")
      .select("id, teacher_id, group_id, subject_id, is_active, student_groups(id, name, grade, group_type), subjects(id, name)")
      .in("teacher_id", teachers.map((t) => t.id))
      .eq("is_active", true),
  ]);

  return teachers.map((teacher) => ({
    ...teacher,
    subjects: (subjectRows.data ?? [])
      .filter((r) => r.teacher_id === teacher.id)
      .flatMap((r) => {
        if (!r.subjects) return [];
        if (Array.isArray(r.subjects)) return r.subjects;
        return [r.subjects];
      }) as { id: string; name: string }[],
    assignments: (assignmentRows.data ?? [])
      .filter((r) => r.teacher_id === teacher.id)
      .map((r) => ({
        id: r.id,
        teacher_id: r.teacher_id,
        group_id: r.group_id,
        subject_id: r.subject_id,
        is_active: r.is_active,
        student_groups: Array.isArray(r.student_groups) ? r.student_groups[0] ?? null : r.student_groups,
        subjects: Array.isArray(r.subjects) ? r.subjects[0] ?? null : r.subjects,
      })),
  }));
}

/** Add a subject to a teacher. */
export async function addTeacherSubject(teacherId: string, subjectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("teacher_subjects")
    .insert({ teacher_id: teacherId, subject_id: subjectId, assigned_by: user.id });

  if (error) {
    if (error.code === "23505") return { error: "Аль хэдийн оноогдсон байна" };
    return { error: error.message };
  }

  revalidatePath("/admin/teachers");
  revalidatePath("/admin/teachers/[departmentId]", "page");
  return { success: true };
}

/** Remove a subject from a teacher. Also deactivates related teaching assignments. */
export async function removeTeacherSubject(teacherId: string, subjectId: string) {
  const supabase = await createClient();

  // Deactivate teaching assignments for this teacher+subject
  await supabase
    .from("teaching_assignments")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("subject_id", subjectId);

  const { error } = await supabase
    .from("teacher_subjects")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("subject_id", subjectId);

  if (error) return { error: error.message };

  revalidatePath("/admin/teachers");
  revalidatePath("/admin/teachers/[departmentId]", "page");
  return { success: true };
}

/** Add a teaching assignment (teacher → group → subject). */
export async function addTeachingAssignment(
  teacherId: string,
  groupId: string,
  subjectId: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  // Verify teacher has this subject assigned first
  const { data: ts } = await supabase
    .from("teacher_subjects")
    .select("teacher_id")
    .eq("teacher_id", teacherId)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (!ts) {
    return { error: "Энэ багшид эхлээд тухайн хичээлийг оноох шаардлагатай" };
  }

  const { error } = await supabase
    .from("teaching_assignments")
    .insert({
      teacher_id: teacherId,
      group_id: groupId,
      subject_id: subjectId,
      assigned_by: user.id,
      is_active: true,
    });

  if (error) {
    if (error.code === "23505") return { error: "Энэ оноолт аль хэдийн байна" };
    return { error: error.message };
  }

  revalidatePath("/admin/teachers");
  return { success: true };
}

/** Remove a teaching assignment by ID. */
export async function removeTeachingAssignment(assignmentId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("teaching_assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  revalidatePath("/admin/teachers");
  return { success: true };
}
