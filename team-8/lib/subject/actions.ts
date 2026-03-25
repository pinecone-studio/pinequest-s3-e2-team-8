"use server";

import { createClient } from "@/lib/supabase/server";

/** All subjects — used by admin and subject-unaware contexts. */
export async function getSubjects() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("subjects")
    .select("id, name, description, created_by, created_at")
    .order("name", { ascending: true });

  return data ?? [];
}

/**
 * Subjects the current user may teach / create exams for.
 *  - admin  → all subjects
 *  - teacher with teacher_subjects rows → only those subjects
 *  - teacher with NO rows yet → all subjects (permissive until admin assigns)
 */
export async function getTeacherSubjects() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") return getSubjects();

  const { data: rows } = await supabase
    .from("teacher_subjects")
    .select("subjects(id, name, description, created_by, created_at)")
    .eq("teacher_id", user.id);

  // No assignments yet → strict: teacher has access to nothing until admin assigns
  if (!rows || rows.length === 0) return [];

  // Supabase may return the FK join as object or array — normalise to object[]
  return rows.flatMap((r) => {
    if (!r.subjects) return [];
    if (Array.isArray(r.subjects)) return r.subjects;
    return [r.subjects];
  }) as { id: string; name: string; description: string | null; created_by: string | null; created_at: string }[];
}
