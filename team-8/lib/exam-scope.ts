"use server";

import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function isAdminUser(
  supabase: SupabaseServerClient,
  userId: string
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return profile?.role === "admin";
}

export async function canManageExam(
  supabase: SupabaseServerClient,
  examId: string,
  userId: string
) {
  if (await isAdminUser(supabase, userId)) return true;

  const { data: exam } = await supabase
    .from("exams")
    .select("subject_id, created_by")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return false;
  if (exam.created_by === userId) return true;
  if (!exam.subject_id) return false;

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
    .eq("subject_id", exam.subject_id)
    .in("group_id", groupIds)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return Boolean(teachingAssignment);
}
