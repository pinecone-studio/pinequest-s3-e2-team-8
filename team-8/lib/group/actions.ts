"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getPublishedAssignedExamIdsForGroup,
  syncExamRecipients,
  syncExamRecipientsForExams,
  syncPublishedExamRecipientsForGroup,
} from "@/lib/exam-recipients";
import {
  getGroupAssignmentConflictError,
  getGroupMemberConflictError,
} from "@/lib/exam-conflicts";

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("student_groups")
    .select("*")
    .eq("id", groupId)
    .eq("created_by", user.id)
    .maybeSingle();

  return data;
}

export async function deleteGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { examIds, error: impactedExamsError } =
    await getPublishedAssignedExamIdsForGroup(supabase, groupId);

  if (impactedExamsError) return { error: impactedExamsError };

  const { error } = await supabase
    .from("student_groups")
    .delete()
    .eq("id", groupId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  const syncResult = await syncExamRecipientsForExams(
    supabase,
    examIds,
    user.id
  );
  if (!syncResult.success) return { error: syncResult.error };

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

  const conflictError = await getGroupMemberConflictError(
    supabase,
    groupId,
    student.id
  );
  if (conflictError) return { error: conflictError };

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

  const syncResult = await syncPublishedExamRecipientsForGroup(
    supabase,
    groupId,
    user.id
  );
  if (!syncResult.success) return { error: syncResult.error };

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

  const syncResult = await syncPublishedExamRecipientsForGroup(
    supabase,
    groupId,
    user.id
  );
  if (!syncResult.success) return { error: syncResult.error };

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
    .select(
      "*, exams(id, title, is_published, start_time, end_time, duration_minutes, subjects(name), questions(count))"
    )
    .eq("group_id", groupId)
    .order("assigned_at", { ascending: false });

  return data ?? [];
}

export async function assignExamToGroup(groupId: string, examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: exam } = await supabase
    .from("exams")
    .select("id, is_published")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!exam) return { error: "Таны шалгалт олдсонгүй" };

  const conflictError = await getGroupAssignmentConflictError(
    supabase,
    groupId,
    examId
  );
  if (conflictError) return { error: conflictError };

  const { error } = await supabase
    .from("exam_assignments")
    .insert({ exam_id: examId, group_id: groupId, assigned_by: user.id });

  if (error) {
    if (error.code === "23505") return { error: "Энэ шалгалт аль хэдийн оноогдсон" };
    return { error: error.message };
  }

  if (exam.is_published) {
    const syncResult = await syncExamRecipients(supabase, examId, user.id);
    if (!syncResult.success) return { error: syncResult.error };
  }

  revalidatePath(`/educator/groups/${groupId}`);
  return { success: true };
}

export async function unassignExamFromGroup(groupId: string, examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: exam } = await supabase
    .from("exams")
    .select("id, is_published")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!exam) return { error: "Таны шалгалт олдсонгүй" };

  const { error } = await supabase
    .from("exam_assignments")
    .delete()
    .eq("group_id", groupId)
    .eq("exam_id", examId);

  if (error) return { error: error.message };

  if (exam.is_published) {
    const syncResult = await syncExamRecipients(supabase, examId, user.id);
    if (!syncResult.success) return { error: syncResult.error };
  }

  revalidatePath(`/educator/groups/${groupId}`);
  return { success: true };
}

// Бүх published шалгалтуудыг авах (оноохын тулд)
export async function getAvailableExams(groupId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("exams")
    .select(
      "id, title, start_time, end_time, duration_minutes, is_published, subjects(name), questions(count)"
    )
    .eq("created_by", user.id)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (!groupId || !data || data.length === 0) {
    return data ?? [];
  }

  const examsWithConflicts = await Promise.all(
    data.map(async (exam) => {
      const conflict_error = await getGroupAssignmentConflictError(
        supabase,
        groupId,
        exam.id
      );

      return {
        ...exam,
        conflict_error,
      };
    })
  );

  return examsWithConflicts;
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
