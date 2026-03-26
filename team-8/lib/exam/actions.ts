"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExamAssignmentConflictError, getGroupAssignmentConflictError } from "@/lib/exam-conflicts";
import { syncExamRecipients } from "@/lib/exam-recipients";
import { getExamPublishGuardError } from "@/lib/exam-readiness";
import {
  deriveStudentExamLifecycle,
  getEffectiveExamAccess,
} from "@/lib/exam-session-lifecycle";
import {
  buildExamLifecycleMap,
  getExamSubjectAssignmentConsistency,
} from "@/lib/exam-lifecycle";
import { canManageExam } from "@/lib/exam-scope";
import {
  buildPublishedExamSnapshot,
  isSnapshotColumnMissingError,
} from "@/lib/exam-snapshot";
import {
  getAllowedGroupIds,
  getAllowedSubjectIds,
} from "@/lib/teacher/permissions";

function getScheduleWindowMinutes(startTime: string, endTime: string) {
  return Math.floor(
    (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000
  );
}

export async function createExam(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const duration_minutes = parseInt(formData.get("duration_minutes") as string);
  const subject_id = ((formData.get("subject_id") as string) || "").trim() || null;
  const group_id = ((formData.get("group_id") as string) || "").trim() || null;
  // datetime-local input өгөгдлийг UB цагаар хадгалах (+08:00)
  const start_time = (formData.get("start_time") as string) + "+08:00";
  const end_time = (formData.get("end_time") as string) + "+08:00";
  const passing_score = parseFloat(formData.get("passing_score") as string) || 60;
  const max_attempts = parseInt(formData.get("max_attempts") as string) || 1;
  const shuffle_questions = formData.get("shuffle_questions") === "on";
  const shuffle_options = formData.get("shuffle_options") === "on";

  if (!title || !start_time || !end_time || !duration_minutes) {
    return { error: "Бүх талбарыг бөглөнө үү" };
  }

  if (new Date(start_time).getTime() >= new Date(end_time).getTime()) {
    return { error: "Дуусах цаг нь эхлэх цагаасаа хойш байх ёстой" };
  }

  const scheduleWindowMinutes = getScheduleWindowMinutes(start_time, end_time);
  if (duration_minutes > scheduleWindowMinutes) {
    return { error: "Шалгалтын хугацаа нь нээлттэй цонхоос урт байж болохгүй" };
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

  if (group_id) {
    if (allowedIds !== null) {
      if (!subject_id) {
        return { error: "Хичээл заавал сонгоно уу" };
      }

      const allowedGroupIds = await getAllowedGroupIds(
        supabase,
        user.id,
        subject_id
      ) ?? [];

      if (!allowedGroupIds.includes(group_id)) {
        return { error: "Энэ бүлэгт энэ хичээлийн шалгалт оноох эрх байхгүй байна" };
      }
    }

    const { data: group } = await supabase
      .from("student_groups")
      .select("id")
      .eq("id", group_id)
      .maybeSingle();

    if (!group) return { error: "Сонгосон бүлэг олдсонгүй" };
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

  if (group_id) {
    const conflictError = await getGroupAssignmentConflictError(
      supabase,
      group_id,
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

    const { error: assignmentError } = await supabase.rpc(
      "assign_exam_to_group",
      {
        p_exam_id: data.id,
        p_group_id: group_id,
        p_assigned_by: user.id,
      }
    );

    if (assignmentError) {
      await supabase
        .from("exams")
        .delete()
        .eq("id", data.id)
        .eq("created_by", user.id);
      return { error: assignmentError.message };
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
    .select("id, title, subject_id, is_published")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!existingExam) return { error: "Шалгалт олдсонгүй" };
  if (existingExam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтыг өөрчлөх боломжгүй" };
  }

  const start_time = (formData.get("start_time") as string) + "+08:00";
  const end_time = (formData.get("end_time") as string) + "+08:00";
  const subject_id = ((formData.get("subject_id") as string) || "").trim() || null;

  if (new Date(start_time).getTime() >= new Date(end_time).getTime()) {
    return { error: "Дуусах цаг нь эхлэх цагаасаа хойш байх ёстой" };
  }

  const scheduleWindowMinutes = getScheduleWindowMinutes(start_time, end_time);
  const durationMinutes = parseInt(formData.get("duration_minutes") as string);
  if (durationMinutes > scheduleWindowMinutes) {
    return { error: "Шалгалтын хугацаа нь нээлттэй цонхоос урт байж болохгүй" };
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

  const title = String(formData.get("title") || "").trim();
  const assignmentConsistency = await getExamSubjectAssignmentConsistency(
    supabase,
    user.id,
    examId,
    subject_id
  );
  if (assignmentConsistency.error) {
    return { error: assignmentConsistency.error };
  }

  const conflictError = await getExamAssignmentConflictError(supabase, examId, {
    title: title || existingExam.title,
    start_time,
    end_time,
  });
  if (conflictError) {
    return { error: conflictError };
  }

  const { error } = await supabase
    .from("exams")
    .update({
      title,
      description: (formData.get("description") as string) || null,
      subject_id,
      duration_minutes: durationMinutes,
      start_time,
      end_time,
      passing_score: parseFloat(formData.get("passing_score") as string) || 60,
      max_attempts: parseInt(formData.get("max_attempts") as string) || 1,
      shuffle_questions: formData.get("shuffle_questions") === "on",
      shuffle_options: formData.get("shuffle_options") === "on",
    })
    .eq("id", examId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

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
    .select("*, subjects(name), questions(*)")
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
      "id, title, passing_score, subject_id, created_by, start_time, end_time, max_attempts, subjects(name)"
    )
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return null;
  if (!(await canManageExam(supabase, examId, user.id))) return null;

  // Энэ шалгалтад хамаарах бүлгүүд
  const { data: assignmentRows } = await supabase
    .from("exam_assignments")
    .select("group_id, student_groups(id, name)")
    .eq("exam_id", examId);

  const groups = (assignmentRows ?? []).flatMap((r) => {
    const g = Array.isArray(r.student_groups) ? r.student_groups[0] : r.student_groups;
    return g ? [g as { id: string; name: string }] : [];
  });

  // Сурагч бүрийн харьяалах group-ийг олох
  const groupIds = groups.map((g) => g.id);
  const memberRows = groupIds.length > 0
    ? (await supabase
        .from("student_group_members")
        .select("student_id, group_id")
        .in("group_id", groupIds)).data ?? []
    : [];

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

  const recipients = recipientsResult.data ?? [];
  const sessions = sessionsResult.data ?? [];
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
    const studentGroups = groups.filter((g) => studentGroupIds.includes(g.id));
    const access = getEffectiveExamAccess(
      {
        start_time: exam.start_time,
        end_time: exam.end_time,
        max_attempts: exam.max_attempts,
      },
      recipient
    );
    const lifecycle = deriveStudentExamLifecycle({
      exam: {
        start_time: exam.start_time,
        end_time: exam.end_time,
        max_attempts: exam.max_attempts,
      },
      recipient,
      latestSessionStatus: latestSession?.status ?? null,
      latestAttemptNumber: latestSession?.attempt_number ?? 0,
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
      excused: sessionResults.filter((s) => s.status === "excused").length,
      avgScore,
      passCount,
      passRate:
        attemptedRows.length > 0
          ? Math.round((passCount / attemptedRows.length) * 100)
          : 0,
    },
    groups,
  };
}
