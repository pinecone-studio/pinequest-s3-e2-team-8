"use server";

import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ExamManagementScope = {
  canManage: boolean;
  manageAll: boolean;
  managedGroupIds: string[];
  managedStudentIds: string[];
};

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

async function getAssignedGroupIdsForExam(
  supabase: SupabaseServerClient,
  examId: string
) {
  const { data: examAssignments } = await supabase
    .from("exam_assignments")
    .select("group_id")
    .eq("exam_id", examId);

  return Array.from(
    new Set((examAssignments ?? []).map((assignment) => assignment.group_id))
  );
}

async function getStudentIdsForGroups(
  supabase: SupabaseServerClient,
  groupIds: string[]
) {
  if (groupIds.length === 0) return [];

  const { data: members } = await supabase
    .from("student_group_members")
    .select("student_id")
    .in("group_id", groupIds);

  return Array.from(new Set((members ?? []).map((member) => member.student_id)));
}

export async function getExamManagementScope(
  supabase: SupabaseServerClient,
  examId: string,
  userId: string
): Promise<ExamManagementScope> {
  const manageAll = await isAdminUser(supabase, userId);

  const { data: exam } = await supabase
    .from("exams")
    .select("subject_id, created_by")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) {
    return {
      canManage: false,
      manageAll: false,
      managedGroupIds: [],
      managedStudentIds: [],
    };
  }

  const assignedGroupIds = await getAssignedGroupIdsForExam(supabase, examId);

  if (manageAll || exam.created_by === userId) {
    return {
      canManage: true,
      manageAll: true,
      managedGroupIds: assignedGroupIds,
      managedStudentIds: await getStudentIdsForGroups(supabase, assignedGroupIds),
    };
  }

  if (!exam.subject_id || assignedGroupIds.length === 0) {
    return {
      canManage: false,
      manageAll: false,
      managedGroupIds: [],
      managedStudentIds: [],
    };
  }

  const { data: teachingAssignments } = await supabase
    .from("teaching_assignments")
    .select("group_id")
    .eq("teacher_id", userId)
    .eq("subject_id", exam.subject_id)
    .in("group_id", assignedGroupIds)
    .eq("is_active", true);

  const managedGroupIds = Array.from(
    new Set((teachingAssignments ?? []).map((assignment) => assignment.group_id))
  );

  return {
    canManage: managedGroupIds.length > 0,
    manageAll: false,
    managedGroupIds,
    managedStudentIds: await getStudentIdsForGroups(supabase, managedGroupIds),
  };
}

export async function canManageExamStudent(
  supabase: SupabaseServerClient,
  examId: string,
  userId: string,
  studentId: string
) {
  const scope = await getExamManagementScope(supabase, examId, userId);
  if (!scope.canManage) return false;
  if (scope.manageAll) return true;
  return scope.managedStudentIds.includes(studentId);
}

export async function canManageExam(
  supabase: SupabaseServerClient,
  examId: string,
  userId: string
) {
  const scope = await getExamManagementScope(supabase, examId, userId);
  return scope.canManage;
}
