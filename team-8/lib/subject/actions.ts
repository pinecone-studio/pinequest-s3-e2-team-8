"use server";

import { createClient } from "@/lib/supabase/server";

const defaultSubjects = [
  { name: "Математик", description: "Математикийн шалгалт, бодлогууд" },
  { name: "Монгол хэл", description: "Монгол хэл, уран зохиолын агуулга" },
  { name: "Англи хэл", description: "Англи хэлний чадварын шалгалтууд" },
  { name: "Физик", description: "Физикийн ойлголт, тооцоолол" },
  { name: "Хими", description: "Химийн томьёо, урвал, тооцоолол" },
  { name: "Биологи", description: "Биологийн агуулга ба шалгалтууд" },
  { name: "Түүх", description: "Монгол болон дэлхийн түүх" },
  { name: "Нийгэм судлал", description: "Нийгмийн ухаан, иргэний боловсрол" },
  { name: "Мэдээлэл зүй", description: "Програмчлал, мэдээллийн технологи" },
  { name: "Газарзүй", description: "Газарзүйн агуулга, газрын зураг" },
  { name: "Иргэний ёс зүй", description: "Ёс зүй, харилцаа, иргэний боловсрол" },
];

/** All subjects — used by admin and subject-unaware contexts. */
export async function getSubjects() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("subjects")
    .select("id, name, description, created_by, created_at")
    .order("name", { ascending: true });

  const currentSubjects = data ?? [];
  const existingNames = new Set(
    currentSubjects.map((subject) => subject.name.trim().toLowerCase())
  );

  const missingSubjects = defaultSubjects.filter(
    (subject) => !existingNames.has(subject.name.trim().toLowerCase())
  );

  if (missingSubjects.length > 0 && user) {
    await supabase.from("subjects").insert(
      missingSubjects.map((subject) => ({
        ...subject,
        created_by: user.id,
      }))
    );

    const { data: refreshedData } = await supabase
      .from("subjects")
      .select("id, name, description, created_by, created_at")
      .order("name", { ascending: true });

    return refreshedData ?? currentSubjects;
  }

  return currentSubjects;
}

/**
 * Subjects the current user may teach / create exams for.
 *  - admin → all subjects
 *  - teacher with teacher_subjects rows → only those subjects
 *  - teacher with NO rows yet → strict: no access until admin assigns
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

  if (!rows || rows.length === 0) return [];

  return rows.flatMap((row) => {
    if (!row.subjects) return [];
    if (Array.isArray(row.subjects)) return row.subjects;
    return [row.subjects];
  }) as {
    id: string;
    name: string;
    description: string | null;
    created_by: string | null;
    created_at: string;
  }[];
}
