"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ==========================================
// БҮЛЭГ CRUD
// ==========================================

export async function createGroup(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const name = formData.get("name") as string;
  const grade = parseInt(formData.get("grade") as string) || null;
  const group_type = (formData.get("group_type") as string) || "class";

  if (!name) return { error: "Бүлгийн нэр оруулна уу" };

  const { data, error } = await supabase
    .from("student_groups")
    .insert({ name, grade, group_type, created_by: user.id })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/educator/groups");
  return { success: true, group: data };
}

export async function getGroups() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("student_groups")
    .select("*, student_group_members(count)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getGroupById(groupId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("student_groups")
    .select("*")
    .eq("id", groupId)
    .single();

  return data;
}

export async function deleteGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("student_groups")
    .delete()
    .eq("id", groupId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath("/educator/groups");
  return { success: true };
}

// ==========================================
// ГИШҮҮД УДИРДЛАГА
// ==========================================

export async function getGroupMembers(groupId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("student_group_members")
    .select("*, profiles!student_group_members_student_id_fkey(id, email, full_name)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: false });

  return data ?? [];
}

export async function addMemberToGroup(groupId: string, studentEmail: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  // Сурагчийг email-ээр хайх
  const { data: student } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("email", studentEmail.trim())
    .eq("role", "student")
    .single();

  if (!student) return { error: "Сурагч олдсонгүй. Email шалгана уу." };

  // Аль хэдийн байгаа эсэх
  const { data: existing } = await supabase
    .from("student_group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("student_id", student.id)
    .maybeSingle();

  if (existing) return { error: "Энэ сурагч аль хэдийн бүлэгт байна" };

  const { error } = await supabase
    .from("student_group_members")
    .insert({ group_id: groupId, student_id: student.id });

  if (error) return { error: error.message };

  revalidatePath(`/educator/groups/${groupId}`);
  return { success: true, student };
}

export async function removeMemberFromGroup(groupId: string, studentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("student_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("student_id", studentId);

  if (error) return { error: error.message };

  revalidatePath(`/educator/groups/${groupId}`);
  return { success: true };
}

// ==========================================
// ШАЛГАЛТ ОНООХ
// ==========================================

export async function getGroupExamAssignments(groupId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("exam_assignments")
    .select("*, exams(id, title, is_published, start_time, end_time, duration_minutes)")
    .eq("group_id", groupId)
    .order("assigned_at", { ascending: false });

  return data ?? [];
}

export async function assignExamToGroup(groupId: string, examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("exam_assignments")
    .insert({ exam_id: examId, group_id: groupId, assigned_by: user.id });

  if (error) {
    if (error.code === "23505") return { error: "Энэ шалгалт аль хэдийн оноогдсон" };
    return { error: error.message };
  }

  revalidatePath(`/educator/groups/${groupId}`);
  return { success: true };
}

export async function unassignExamFromGroup(groupId: string, examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("exam_assignments")
    .delete()
    .eq("group_id", groupId)
    .eq("exam_id", examId);

  if (error) return { error: error.message };

  revalidatePath(`/educator/groups/${groupId}`);
  return { success: true };
}

// Бүх published шалгалтуудыг авах (оноохын тулд)
export async function getAvailableExams() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("exams")
    .select("id, title, start_time, end_time, duration_minutes, is_published")
    .eq("created_by", user.id)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  return data ?? [];
}

// Бүх сурагчдыг авах (хайлт хийхэд)
export async function searchStudents(query: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "student")
    .or(`email.ilike.%${query}%,full_name.ilike.%${query}%`)
    .limit(10);

  return data ?? [];
}
