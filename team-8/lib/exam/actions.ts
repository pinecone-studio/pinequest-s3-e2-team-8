"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroupAssignmentConflictError } from "@/lib/exam-conflicts";
import { syncExamRecipients } from "@/lib/exam-recipients";
import { getExamPublishGuardError } from "@/lib/exam-readiness";
import { assignExamToGroupRecord } from "@/lib/exam-assignments";
import {
  deriveStudentExamLifecycle,
  getEffectiveExamAccess,
} from "@/lib/exam-session-lifecycle";
import {
  buildExamLifecycleMap,
} from "@/lib/exam-lifecycle";
import { getExamManagementScope } from "@/lib/exam-scope";
import {
  buildPublishedExamSnapshot,
  isSnapshotColumnMissingError,
} from "@/lib/exam-snapshot";
import {
  getAllowedGroupIds,
  getAllowedSubjectIds,
} from "@/lib/teacher/permissions";

function toUlaanbaatarTimestamp(rawValue: FormDataEntryValue | null) {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  return `${value}+08:00`;
}

function parsePositiveInteger(rawValue: FormDataEntryValue | null) {
  const value = Number.parseInt(String(rawValue ?? "").trim(), 10);
  return Number.isFinite(value) ? value : null;
}

export async function createExam(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const duration_minutes = parsePositiveInteger(formData.get("duration_minutes"));
  const subject_id = ((formData.get("subject_id") as string) || "").trim() || null;
  const selectedGroupIds = Array.from(
    new Set(
      formData
        .getAll("group_ids")
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
  const legacyGroupId = ((formData.get("group_id") as string) || "").trim() || null;
  const groupIds =
    selectedGroupIds.length > 0
      ? selectedGroupIds
      : legacyGroupId
        ? [legacyGroupId]
        : [];
  const start_time = toUlaanbaatarTimestamp(formData.get("start_time"));
  const end_time = toUlaanbaatarTimestamp(formData.get("end_time"));
  const passing_score = parseFloat(formData.get("passing_score") as string) || 60;
  const max_attempts = parseInt(formData.get("max_attempts") as string) || 1;
  const shuffle_questions = formData.get("shuffle_questions") === "on";
  const shuffle_options = formData.get("shuffle_options") === "on";

  if (!title || !start_time || !end_time || !duration_minutes) {
    return { error: "Бүх талбарыг бөглөнө үү" };
  }

  const startTimeMs = new Date(start_time).getTime();
  const endTimeMs = new Date(end_time).getTime();
  if (Number.isNaN(startTimeMs) || Number.isNaN(endTimeMs)) {
    return { error: "Нээгдэх эсвэл хаагдах хугацаа буруу байна" };
  }

  if (startTimeMs >= endTimeMs) {
    return { error: "Хаагдах хугацаа нь нээгдэх хугацаанаас хойш байх ёстой" };
  }
  if (duration_minutes <= 0) {
    return { error: "Шалгалтын үргэлжлэх хугацаа 0-ээс их байх ёстой" };
  }

  // Subject permission check (strict)
  const allowedIds = await getAllowedSubjectIds(supabase, user.id);
  if (allowedIds !== null) {
    // Non-admin teacher
    if (!subject_id) {
      return { error: "Хичээл заавал сонгоно уу" };
    }
    if (!allowedIds.includes(subject_id)) {
      return { error: "Энэ хичээлийн шалгалт үүсгэх эрх байхгүй байна" };
    }
  }

  if (groupIds.length > 0) {
    if (allowedIds !== null) {
      if (!subject_id) {
        return { error: "Хичээл заавал сонгоно уу" };
      }

      const allowedGroupIds = await getAllowedGroupIds(
        supabase,
        user.id,
        subject_id
      ) ?? [];

      const invalidGroupId = groupIds.find(
        (groupId) => !allowedGroupIds.includes(groupId)
      );
      if (invalidGroupId) {
        return { error: "Энэ бүлэгт энэ хичээлийн шалгалт оноох эрх байхгүй байна" };
      }
    }

    const { data: groups } = await supabase
      .from("student_groups")
      .select("id")
      .in("id", groupIds);

    if ((groups ?? []).length !== groupIds.length) {
      return { error: "Сонгосон бүлгийн зарим нь олдсонгүй" };
    }
  }

  const { data, error } = await supabase
    .from("exams")
    .insert({
      title,
      description: description || null,
      subject_id,
      created_by: user.id,
      start_time,
      end_time,
      duration_minutes,
      passing_score,
      max_attempts,
      shuffle_questions,
      shuffle_options,
      is_published: false,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  if (groupIds.length > 0) {
    for (const groupId of groupIds) {
      const conflictError = await getGroupAssignmentConflictError(
        supabase,
        groupId,
        data.id
      );
      if (conflictError) {
        await supabase
          .from("exams")
          .delete()
          .eq("id", data.id)
          .eq("created_by", user.id);
        return { error: conflictError };
      }
    }

    for (const groupId of groupIds) {
      const assignmentResult = await assignExamToGroupRecord(supabase, {
        examId: data.id,
        groupId,
        assignedBy: user.id,
      });

      if ("error" in assignmentResult) {
        await supabase
          .from("exams")
          .delete()
          .eq("id", data.id)
          .eq("created_by", user.id);
        return { error: assignmentResult.error };
      }
    }
  }

  revalidatePath("/educator");
  redirect(`/educator/exams/${data.id}/questions`);
}

export async function updateExam(examId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: existingExam } = await supabase
    .from("exams")
    .select(
      "id, title, description, subject_id, is_published, shuffle_questions, shuffle_options"
    )
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!existingExam) return { error: "Шалгалт олдсонгүй" };
  if (existingExam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтыг өөрчлөх боломжгүй" };
  }

  const start_time = toUlaanbaatarTimestamp(formData.get("start_time"));
  const end_time = toUlaanbaatarTimestamp(formData.get("end_time"));
  const subject_id = ((formData.get("subject_id") as string) || "").trim() || null;
  const selectedGroupIds = Array.from(
    new Set(
      formData
        .getAll("group_ids")
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
  const legacyGroupId = ((formData.get("group_id") as string) || "").trim() || null;
  const groupIds =
    selectedGroupIds.length > 0
      ? selectedGroupIds
      : legacyGroupId
        ? [legacyGroupId]
        : [];

  if (!start_time || !end_time) {
    return { error: "Нээгдэх болон хаагдах хугацааг бүрэн оруулна уу" };
  }

  const startTimeMs = new Date(start_time).getTime();
  const endTimeMs = new Date(end_time).getTime();
  if (Number.isNaN(startTimeMs) || Number.isNaN(endTimeMs)) {
    return { error: "Нээгдэх эсвэл хаагдах хугацаа буруу байна" };
  }

  if (startTimeMs >= endTimeMs) {
    return { error: "Хаагдах хугацаа нь нээгдэх хугацаанаас хойш байх ёстой" };
  }

  const durationMinutes = parsePositiveInteger(formData.get("duration_minutes"));
  if (!durationMinutes || durationMinutes <= 0) {
    return { error: "Шалгалтын үргэлжлэх хугацаа 0-ээс их байх ёстой" };
  }

  // Subject permission check (strict)
  const allowedIds = await getAllowedSubjectIds(supabase, user.id);
  if (allowedIds !== null) {
    if (!subject_id) {
      return { error: "Хичээл заавал сонгоно уу" };
    }
    if (!allowedIds.includes(subject_id)) {
      return { error: "Энэ хичээлийн шалгалт үүсгэх эрх байхгүй байна" };
    }
  }

  if (groupIds.length > 0) {
    if (allowedIds !== null) {
      if (!subject_id) {
        return { error: "Хичээл заавал сонгоно уу" };
      }

      const allowedGroupIds = await getAllowedGroupIds(
        supabase,
        user.id,
        subject_id
      ) ?? [];

      const invalidGroupId = groupIds.find(
        (groupId) => !allowedGroupIds.includes(groupId)
      );
      if (invalidGroupId) {
        return { error: "Энэ бүлэгт энэ хичээлийн шалгалт оноох эрх байхгүй байна" };
      }
    }

    const { data: groups } = await supabase
      .from("student_groups")
      .select("id")
      .in("id", groupIds);

    if ((groups ?? []).length !== groupIds.length) {
      return { error: "Сонгосон бүлгийн зарим нь олдсонгүй" };
    }
  }

  const title = String(formData.get("title") || "").trim();
  if (!title) {
    return { error: "Шалгалтын нэрээ бөглөнө үү" };
  }
  for (const groupId of groupIds) {
    const conflictError = await getGroupAssignmentConflictError(
      supabase,
      groupId,
      examId,
      {
        title: title || existingExam.title,
        start_time,
        end_time,
        duration_minutes: durationMinutes,
      }
    );
    if (conflictError) {
      return { error: conflictError };
    }
  }

  const { data: existingAssignments } = await supabase
    .from("exam_assignments")
    .select("group_id")
    .eq("exam_id", examId);

  const existingGroupIds = Array.from(
    new Set((existingAssignments ?? []).map((row) => row.group_id))
  );
  const groupsToAdd = groupIds.filter((groupId) => !existingGroupIds.includes(groupId));
  const groupsToRemove = existingGroupIds.filter(
    (groupId) => !groupIds.includes(groupId)
  );

  const { error } = await supabase
    .from("exams")
    .update({
      title,
      description: formData.has("description")
        ? String(formData.get("description") ?? "").trim() || null
        : existingExam.description ?? null,
      subject_id,
      duration_minutes: durationMinutes,
      start_time,
      end_time,
      passing_score: parseFloat(formData.get("passing_score") as string) || 60,
      max_attempts: parseInt(formData.get("max_attempts") as string) || 1,
      shuffle_questions: formData.has("shuffle_questions")
        ? formData.get("shuffle_questions") === "on"
        : existingExam.shuffle_questions,
      shuffle_options: formData.has("shuffle_options")
        ? formData.get("shuffle_options") === "on"
        : existingExam.shuffle_options,
    })
    .eq("id", examId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  const addedGroupIds: string[] = [];
  for (const groupId of groupsToAdd) {
    const assignmentResult = await assignExamToGroupRecord(supabase, {
      examId,
      groupId,
      assignedBy: user.id,
    });

    if ("error" in assignmentResult) {
      if (addedGroupIds.length > 0) {
        await supabase
          .from("exam_assignments")
          .delete()
          .eq("exam_id", examId)
          .in("group_id", addedGroupIds);
      }
      return { error: assignmentResult.error };
    }

    addedGroupIds.push(groupId);
  }

  if (groupsToRemove.length > 0) {
    const { error: removeError } = await supabase
      .from("exam_assignments")
      .delete()
      .eq("exam_id", examId)
      .in("group_id", groupsToRemove);

    if (removeError) {
      return { error: removeError.message };
    }
  }

  revalidatePath("/educator");
  revalidatePath(`/educator/exams/${examId}`);
  return { success: true };
}

export async function publishExam(examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: exam } = await supabase
    .from("exams")
    .select("id, is_published")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!exam) return { error: "Шалгалт олдсонгүй" };

  const publishGuardError = await getExamPublishGuardError(
    supabase,
    user.id,
    examId
  );
  if (publishGuardError) {
    return { error: publishGuardError };
  }

  const syncResult = await syncExamRecipients(supabase, examId, user.id);
  if (!syncResult.success) {
    return { error: syncResult.error };
  }

  const snapshot = await buildPublishedExamSnapshot(supabase, examId);
  if (!snapshot) {
    return { error: "Шалгалтын snapshot үүсгэж чадсангүй" };
  }

  const publishPayload = {
    is_published: true,
    published_snapshot: snapshot,
    published_at: snapshot.exam.published_at,
  };

  const { error } = await supabase
    .from("exams")
    .update(publishPayload)
    .eq("id", examId)
    .eq("created_by", user.id);

  if (error && isSnapshotColumnMissingError(error.code)) {
    const fallbackResult = await supabase
      .from("exams")
      .update({ is_published: true })
      .eq("id", examId)
      .eq("created_by", user.id);

    if (fallbackResult.error) {
      return { error: fallbackResult.error.message };
    }

    revalidatePath("/educator");
    revalidatePath(`/educator/exams/${examId}`);
    return { success: true, warning: "Snapshot migration apply хийгдээгүй тул publish fallback mode-оор үргэлжиллээ." };
  }

  if (error) return { error: error.message };

  revalidatePath("/educator");
  revalidatePath(`/educator/exams/${examId}`);
  return { success: true };
}

export async function deleteExam(examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: exam } = await supabase
    .from("exams")
    .select("id, is_published")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!exam) return { error: "Шалгалт олдсонгүй" };

  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтыг устгах боломжгүй. Эхлээд нийтлэлтийг цуцлах шаардлагатай." };
  }

  const { error } = await supabase
    .from("exams")
    .delete()
    .eq("id", examId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath("/educator");
  redirect("/educator");
}

export async function getExams() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("exams")
    .select("*, subjects(name), questions(count)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  const exams = data ?? [];
  const lifecycleMap = await buildExamLifecycleMap(supabase, exams);

  return exams.map((exam) => ({
    ...exam,
    lifecycle: lifecycleMap.get(exam.id) ?? null,
  }));
}

export async function getExamById(examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("exams")
    .select(
      "*, subjects(name), questions(*), exam_assignments(group_id, student_groups(id, name, grade, group_type))"
    )
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  return data;
}

/**
 * Шалгалтын бүх оролцогчдын дүнг нэгтгэн буцаана.
 * Багш өөрийн болон teaching scope-ийн шалгалтыг харж болно.
 * Admin бүх шалгалтыг харж болно.
 */
export async function getExamResults(examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Шалгалтын мэдээлэл авах
  const { data: exam } = await supabase
    .from("exams")
    .select(
      "id, title, passing_score, subject_id, created_by, start_time, end_time, duration_minutes, max_attempts, subjects(name)"
    )
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return null;
  const managementScope = await getExamManagementScope(supabase, examId, user.id);
  if (!managementScope.canManage) return null;

  // Энэ шалгалтад хамаарах бүлгүүд
  const { data: assignmentRows } = await supabase
    .from("exam_assignments")
    .select("group_id, student_groups(id, name)")
    .eq("exam_id", examId);

  const groups = (assignmentRows ?? []).flatMap((r) => {
    const g = Array.isArray(r.student_groups) ? r.student_groups[0] : r.student_groups;
    return g ? [g as { id: string; name: string }] : [];
  });
  const visibleGroups = managementScope.manageAll
    ? groups
    : groups.filter((group) => managementScope.managedGroupIds.includes(group.id));

  // Сурагч бүрийн харьяалах group-ийг олох
  const groupIds = visibleGroups.map((g) => g.id);
  const memberRows = groupIds.length > 0
    ? (await supabase
        .from("student_group_members")
        .select("student_id, group_id")
        .in("group_id", groupIds)).data ?? []
    : [];
  const visibleStudentIds = new Set(memberRows.map((member) => member.student_id));

  const studentGroupMap = new Map<string, string[]>();
  for (const m of memberRows) {
    const existing = studentGroupMap.get(m.student_id) ?? [];
    existing.push(m.group_id);
    studentGroupMap.set(m.student_id, existing);
  }

  const [recipientsResult, sessionsResult] = await Promise.all([
    supabase
      .from("exam_recipients")
      .select(
        "student_id, access_start_time, access_end_time, max_attempts_override, excused_at, status_note, profiles(full_name, email)"
      )
      .eq("exam_id", examId),
    supabase
      .from("exam_sessions")
      .select(
        "id, user_id, status, total_score, max_score, submitted_at, started_at, attempt_number, profiles(full_name, email)"
      )
      .eq("exam_id", examId)
      .in("status", ["in_progress", "submitted", "graded", "timed_out"])
      .order("attempt_number", { ascending: false }),
  ]);

  const recipients = (recipientsResult.data ?? []).filter(
    (recipient) =>
      managementScope.manageAll || visibleStudentIds.has(recipient.student_id)
  );
  const sessions = (sessionsResult.data ?? []).filter(
    (session) => managementScope.manageAll || visibleStudentIds.has(session.user_id)
  );
  const latestSessionByStudent = new Map<string, (typeof sessions)[number]>();

  for (const session of sessions) {
    if (!latestSessionByStudent.has(session.user_id)) {
      latestSessionByStudent.set(session.user_id, session);
    }
  }

  const passingScore = exam.passing_score ?? 60;
  const nowMs = Date.now();

  const sessionResults = recipients.map((recipient) => {
    const latestSession = latestSessionByStudent.get(recipient.student_id);
    const recipientProfile = Array.isArray(recipient.profiles)
      ? recipient.profiles[0]
      : recipient.profiles;
    const sessionProfile = latestSession
      ? Array.isArray(latestSession.profiles)
        ? latestSession.profiles[0]
        : latestSession.profiles
      : null;
    const studentGroupIds = studentGroupMap.get(recipient.student_id) ?? [];
    const studentGroups = visibleGroups.filter((g) =>
      studentGroupIds.includes(g.id)
    );
    const access = getEffectiveExamAccess(
      {
        start_time: exam.start_time,
        end_time: exam.end_time,
        duration_minutes: exam.duration_minutes,
        max_attempts: exam.max_attempts,
      },
      recipient
    );
    const lifecycle = deriveStudentExamLifecycle({
      exam: {
        start_time: exam.start_time,
        end_time: exam.end_time,
        max_attempts: exam.max_attempts,
        duration_minutes: exam.duration_minutes,
      },
      recipient,
      latestSessionStatus: latestSession?.status ?? null,
      latestAttemptNumber: latestSession?.attempt_number ?? 0,
      latestSessionStartedAt: latestSession?.started_at ?? null,
      nowMs,
    });
    const isAttempted = ["submitted", "graded", "timed_out"].includes(
      lifecycle.key
    );
    const totalScore = Number(latestSession?.total_score ?? 0);
    const maxScore = Number(latestSession?.max_score ?? 0);
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    return {
      session_id: latestSession?.id ?? null,
      student_id: recipient.student_id,
      student_name:
        recipientProfile?.full_name ??
        sessionProfile?.full_name ??
        "—",
      student_email:
        recipientProfile?.email ??
        sessionProfile?.email ??
        "—",
      total_score: isAttempted ? totalScore : null,
      max_score: isAttempted ? maxScore : null,
      percentage: isAttempted ? percentage : null,
      status: lifecycle.key,
      status_label: lifecycle.label,
      submitted_at: latestSession?.submitted_at ?? latestSession?.started_at ?? null,
      passed: isAttempted ? percentage >= passingScore : false,
      groups: studentGroups,
      has_retake_override: access.hasRetakeOverride,
      status_note: recipient.status_note ?? null,
    };
  });

  const attemptedRows = sessionResults.filter((row) =>
    ["submitted", "graded", "timed_out"].includes(row.status)
  );
  const total = sessionResults.length;
  const passCount = attemptedRows.filter((row) => row.passed).length;
  const avgScore =
    attemptedRows.length > 0
      ? Math.round(
          attemptedRows.reduce(
            (sum, row) => sum + Number(row.percentage ?? 0),
            0
          ) / attemptedRows.length
        )
      : 0;

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      passing_score: passingScore,
      subject: Array.isArray(exam.subjects) ? exam.subjects[0] ?? null : exam.subjects,
    },
    sessions: sessionResults,
    stats: {
      total,
      attempted: attemptedRows.length,
      submitted: sessionResults.filter((s) => s.status === "submitted").length,
      graded: sessionResults.filter((s) => s.status === "graded").length,
      absent: sessionResults.filter((s) => s.status === "absent").length,
      timedOut: sessionResults.filter((s) => s.status === "timed_out").length,
      excused: sessionResults.filter((s) => s.status === "excused").length,
      avgScore,
      passCount,
      passRate:
        attemptedRows.length > 0
          ? Math.round((passCount / attemptedRows.length) * 100)
          : 0,
    },
    groups: visibleGroups,
  };
}
