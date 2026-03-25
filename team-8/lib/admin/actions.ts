"use server";

import { createClient } from "@/lib/supabase/server";

export async function getAdminStats() {
  const supabase = await createClient();

  const [usersRes, teachersRes, studentsRes, examsRes, sessionsRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "teacher"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student"),
      supabase
        .from("exams")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("exam_sessions")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "graded"]),
    ]);

  return {
    totalUsers: usersRes.count ?? 0,
    totalTeachers: teachersRes.count ?? 0,
    totalStudents: studentsRes.count ?? 0,
    totalExams: examsRes.count ?? 0,
    totalSessions: sessionsRes.count ?? 0,
  };
}

export async function getAllUsers(role?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (role) {
    query = query.eq("role", role);
  }

  const { data } = await query;
  return data ?? [];
}
