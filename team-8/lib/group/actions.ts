"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getAttemptPercentage,
  pickBestAttempt,
  pickLatestAttempt,
} from "@/lib/exam-attempt-utils";
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
import { assignExamToGroupRecord } from "@/lib/exam-assignments";
import { notifyStudentsOfNewExam } from "@/lib/notification/actions";
import { getAllowedGroupIds, getAllTeachingGroupIds, isAdminUser } from "@/lib/teacher/permissions";

type GroupScoreOverviewRow = {
  student_id: string;
  student_name: string;
  student_email: string;
  student_avatar_url: string | null;
  joined_at: string;
  score: number | null;
  status: "passed" | "failed" | "not_taken";
  status_label: string;
  attempted_exam_count: number;
  assigned_exam_count: number;
  latest_exam_title: string | null;
  latest_submitted_at: string | null;
  passing_threshold: number;
};

async function notifyStudentAboutPublishedExamsInGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  studentId: string
) {
  const { examIds } = await getPublishedAssignedExamIdsForGroup(supabase, groupId);
  if (examIds.length === 0) return;

  const { data: exams, error } = await supabase
    .from("exams")
    .select("id, title, start_time, duration_minutes")
    .in("id", examIds)
    .eq("is_published", true);

  if (error || !exams) return;

  await Promise.all(
    exams.map((exam) =>
      notifyStudentsOfNewExam(exam.id, exam.title, [studentId], {
        startTime: exam.start_time,
        durationMinutes: exam.duration_minutes,
      })
    )
  );
}

async function notifyGroupMembersAboutPublishedExamAssignment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  exam: {
    id: string;
    title: string;
    start_time: string | null;
    duration_minutes: number | null;
  }
) {
  const { data: members, error } = await supabase
    .from("student_group_members")
    .select("student_id")
    .eq("group_id", groupId);

  if (error || !members || members.length === 0) return;

  const studentIds = Array.from(
    new Set(members.map((member) => String(member.student_id)))
  );

  await notifyStudentsOfNewExam(exam.id, exam.title, studentIds, {
    startTime: exam.start_time,
    durationMinutes: exam.duration_minutes,
  });
}

// ==========================================
// БҮЛЭГ CRUD
// ==========================================

export async function createGroup(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: "Зөвхөн admin бүлэг үүсгэж чадна" };
  }

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

  // Admin sees all groups; teacher sees groups from teaching_assignments + own created groups
  const teachingGroupIds = await getAllTeachingGroupIds(supabase, user.id);

  if (teachingGroupIds === null) {
    // Admin — all groups
    const { data } = await supabase
      .from("student_groups")
      .select("*, student_group_members(count)")
      .order("created_at", { ascending: false });
    return data ?? [];
  }

  // Teacher: groups they teach in OR created themselves
  let query = supabase
    .from("student_groups")
    .select("*, student_group_members(count)")
    .order("created_at", { ascending: false });

  if (teachingGroupIds.length > 0) {
    query = query.or(`id.in.(${teachingGroupIds.join(",")}),created_by.eq.${user.id}`);
  } else {
    query = query.eq("created_by", user.id);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getExamCreationGroups() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  if (await isAdminUser(supabase, user.id)) {
    const { data } = await supabase
      .from("student_groups")
      .select("id, name, grade, group_type")
      .order("grade", { ascending: true })
      .order("name", { ascending: true });

    return (data ?? []).map((group) => ({
      ...group,
      allowed_subject_ids: [] as string[],
    }));
  }

  const { data } = await supabase
    .from("teaching_assignments")
    .select("group_id, subject_id, student_groups(id, name, grade, group_type)")
    .eq("teacher_id", user.id)
    .eq("is_active", true);

  const grouped = new Map<
    string,
    {
      id: string;
      name: string;
      grade: number | null;
      group_type: string;
      allowed_subject_ids: Set<string>;
    }
  >();

  for (const row of data ?? []) {
    const group = Array.isArray(row.student_groups)
      ? row.student_groups[0]
      : row.student_groups;
    if (!group) continue;

    const existing = grouped.get(row.group_id) ?? {
      id: String(group.id),
      name: String(group.name),
      grade: group.grade ? Number(group.grade) : null,
      group_type: String(group.group_type),
      allowed_subject_ids: new Set<string>(),
    };

    existing.allowed_subject_ids.add(String(row.subject_id));
    grouped.set(row.group_id, existing);
  }

  return Array.from(grouped.values())
    .map((group) => ({
      id: group.id,
      name: group.name,
      grade: group.grade,
      group_type: group.group_type,
      allowed_subject_ids: Array.from(group.allowed_subject_ids),
    }))
    .sort((a, b) => {
      const gradeA = a.grade ?? 99;
      const gradeB = b.grade ?? 99;
      if (gradeA !== gradeB) return gradeA - gradeB;
      return a.name.localeCompare(b.name, "mn");
    });
}

export async function getGroupById(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const teachingGroupIds = await getAllTeachingGroupIds(supabase, user.id);

  // Admin can see any group
  if (teachingGroupIds === null) {
    const { data } = await supabase
      .from("student_groups")
      .select("*")
      .eq("id", groupId)
      .maybeSingle();
    return data;
  }

  // Teacher: must be in their teaching assignments or created by them
  const canAccess = teachingGroupIds.includes(groupId);

  let query = supabase
    .from("student_groups")
    .select("*")
    .eq("id", groupId);

  if (canAccess) {
    // Teaching assignment grants access regardless of creator
  } else {
    query = query.eq("created_by", user.id);
  }

  const { data } = await query.maybeSingle();
  return data;
}

export async function deleteGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { examIds, error: impactedExamsError } =
    await getPublishedAssignedExamIdsForGroup(supabase, groupId);

  if (impactedExamsError) return { error: impactedExamsError };

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: "Зөвхөн admin бүлэг устгаж чадна" };
  }

  const { error } = await supabase
    .from("student_groups")
    .delete()
    .eq("id", groupId);

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
    .select("*, profiles!student_group_members_student_id_fkey(id, email, full_name, avatar_url)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: false });

  return data ?? [];
}

export async function getGroupScoreOverview(groupId: string) {
  const supabase = await createClient();

  const [membersResult, assignmentsResult] = await Promise.all([
    supabase
      .from("student_group_members")
      .select(
        "student_id, joined_at, profiles!student_group_members_student_id_fkey(id, email, full_name, avatar_url)",
      )
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("exam_assignments")
      .select("exam_id, exams(id, title, passing_score, is_published)")
      .eq("group_id", groupId),
  ]);

  const members = membersResult.data ?? [];
  const publishedExams = (assignmentsResult.data ?? []).flatMap((assignment) => {
    const exam = Array.isArray(assignment.exams)
      ? assignment.exams[0] ?? null
      : assignment.exams;

    return exam && exam.is_published
      ? [
          {
            id: String(exam.id),
            title: String(exam.title ?? "Шалгалт"),
            passing_score: Number(exam.passing_score ?? 60),
          },
        ]
      : [];
  });

  const examById = new Map(publishedExams.map((exam) => [exam.id, exam] as const));
  const examIds = publishedExams.map((exam) => exam.id);
  const studentIds = members.map((member) => String(member.student_id));

  const sessions =
    examIds.length > 0 && studentIds.length > 0
      ? (
          await supabase
            .from("exam_sessions")
            .select(
              "id, exam_id, user_id, status, total_score, max_score, attempt_number, submitted_at, started_at",
            )
            .in("exam_id", examIds)
            .in("user_id", studentIds)
            .in("status", ["submitted", "graded", "timed_out"])
        ).data ?? []
      : [];

  const sessionsByStudent = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const existing = sessionsByStudent.get(String(session.user_id)) ?? [];
    existing.push(session);
    sessionsByStudent.set(String(session.user_id), existing);
  }

  const rows: GroupScoreOverviewRow[] = members.map((member) => {
    const studentId = String(member.student_id);
    const studentSessions = sessionsByStudent.get(studentId) ?? [];
    const attemptsByExam = new Map<string, typeof studentSessions>();

    for (const session of studentSessions) {
      const examAttempts = attemptsByExam.get(String(session.exam_id)) ?? [];
      examAttempts.push(session);
      attemptsByExam.set(String(session.exam_id), examAttempts);
    }

    const bestAttempts = Array.from(attemptsByExam.entries())
      .map(([examId, examAttempts]) => {
        const bestAttempt = pickBestAttempt(examAttempts);
        return bestAttempt ? { ...bestAttempt, exam_id: examId } : null;
      })
      .filter(
        (
          attempt,
        ): attempt is NonNullable<typeof attempt> => Boolean(attempt),
      );

    const latestAttempt = pickLatestAttempt(studentSessions);
    const latestExam = latestAttempt
      ? examById.get(String(latestAttempt.exam_id))
      : null;
    const score =
      bestAttempts.length > 0
        ? Math.round(
            bestAttempts.reduce(
              (sum, attempt) => sum + getAttemptPercentage(attempt),
              0,
            ) / bestAttempts.length,
          )
        : null;
    const passingThreshold =
      bestAttempts.length > 0
        ? Math.round(
            bestAttempts.reduce(
              (sum, attempt) =>
                sum + Number(examById.get(String(attempt.exam_id))?.passing_score ?? 60),
              0,
            ) / bestAttempts.length,
          )
        : 60;

    const status =
      score === null
        ? "not_taken"
        : score >= passingThreshold
          ? "passed"
          : "failed";

    const profile = Array.isArray(member.profiles)
      ? member.profiles[0] ?? null
      : member.profiles;

    return {
      student_id: studentId,
      student_name:
        String(profile?.full_name ?? "").trim() ||
        String(profile?.email ?? "").trim() ||
        "Нэргүй сурагч",
      student_email: String(profile?.email ?? "").trim() || "Имэйлгүй",
      student_avatar_url: profile?.avatar_url ?? null,
      joined_at: String(member.joined_at),
      score,
      status,
      status_label:
        status === "passed"
          ? "Тэнцсэн"
          : status === "failed"
            ? "Тэнцээгүй"
            : "Шалгалт өгөөгүй",
      attempted_exam_count: bestAttempts.length,
      assigned_exam_count: publishedExams.length,
      latest_exam_title: latestExam?.title ?? null,
      latest_submitted_at:
        String(latestAttempt?.submitted_at ?? latestAttempt?.started_at ?? "").trim() ||
        null,
      passing_threshold: passingThreshold,
    };
  });

  return {
    rows,
    assigned_exam_count: publishedExams.length,
  };
}

export async function addMemberToGroup(groupId: string, studentEmail: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: "Зөвхөн admin бүлгийн гишүүн нэмж чадна" };
  }

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

  await notifyStudentAboutPublishedExamsInGroup(supabase, groupId, student.id);

  revalidatePath(`/educator/groups/${groupId}`);
  return { success: true, student };
}

export async function removeMemberFromGroup(groupId: string, studentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: "Зөвхөн admin бүлгийн гишүүн хасаж чадна" };
  }

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
    .select("id, title, start_time, duration_minutes, is_published, subject_id")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!exam) return { error: "Таны шалгалт олдсонгүй" };

  // Strict teaching-assignment guard
  const allowedGroupIds = await getAllowedGroupIds(
    supabase,
    user.id,
    exam.subject_id ?? ""
  );
  if (allowedGroupIds !== null) {
    // Non-admin teacher
    if (!exam.subject_id) {
      return { error: "Хичээл тодорхойлогдоогүй шалгалтыг бүлэгт оноох боломжгүй" };
    }
    if (!allowedGroupIds.includes(groupId)) {
      return { error: "Энэ бүлэгт энэ хичээлийн шалгалт оноох эрх байхгүй байна" };
    }
  }

  const conflictError = await getGroupAssignmentConflictError(
    supabase,
    groupId,
    examId
  );
  if (conflictError) return { error: conflictError };

  const assignmentResult = await assignExamToGroupRecord(supabase, {
    examId,
    groupId,
    assignedBy: user.id,
  });

  if ("error" in assignmentResult) {
    return { error: assignmentResult.error };
  }

  if (exam.is_published) {
    const syncResult = await syncExamRecipients(supabase, examId, user.id);
    if (!syncResult.success) return { error: syncResult.error };
    await notifyGroupMembersAboutPublishedExamAssignment(supabase, groupId, exam);
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

/** All groups visible to admin (no created_by filter). */
export async function getAllGroupsAdmin() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("student_groups")
    .select("id, name, grade, group_type, created_by, created_at, student_group_members(count)")
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
