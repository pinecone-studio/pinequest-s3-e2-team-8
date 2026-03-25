"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Dashboard stats ──────────────────────────────────────────────────────────

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
  return { success: true };
}

/** Remove a subject from a teacher. */
export async function removeTeacherSubject(teacherId: string, subjectId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("teacher_subjects")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("subject_id", subjectId);

  if (error) return { error: error.message };

  revalidatePath("/admin/teachers");
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
