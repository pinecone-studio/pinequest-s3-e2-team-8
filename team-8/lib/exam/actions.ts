"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroupAssignmentConflictError } from "@/lib/exam-conflicts";
import { syncExamRecipients } from "@/lib/exam-recipients";
import { getExamPublishGuardError } from "@/lib/exam-readiness";
import { assignExamToGroupRecord } from "@/lib/exam-assignments";
import { notifyStudentsOfNewExam } from "@/lib/notification/actions";
import { prewarmExamCache } from "@/lib/student/actions";
import { toUlaanbaatarIsoString } from "@/lib/utils/date";
import {
  deriveStudentExamLifecycle,
  getEffectiveExamAccess,
} from "@/lib/exam-session-lifecycle";
import {
  getAttemptPercentage,
  isFinalizedAttemptStatus,
  pickBestAttempt,
  pickLatestAttempt,
} from "@/lib/exam-attempt-utils";
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
import { redis } from "@/lib/redis";
import {
  DEFAULT_PROCTORING_SETTINGS,
  getEffectiveDevicePolicy,
  type DevicePolicy,
  type EvidenceMode,
  type ProctoringMode,
} from "@/lib/proctoring";

function toUlaanbaatarTimestamp(rawValue: FormDataEntryValue | null) {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  return toUlaanbaatarIsoString(value);
}

function parsePositiveInteger(rawValue: FormDataEntryValue | null) {
  const value = Number.parseInt(String(rawValue ?? "").trim(), 10);
  return Number.isFinite(value) ? value : null;
}

function parseCheckbox(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function parseProctoringMode(rawValue: FormDataEntryValue | null): ProctoringMode {
  const value = String(rawValue ?? "").trim();
  if (value === "standard" || value === "strict") return value;
  return "off";
}

function parseEvidenceMode(rawValue: FormDataEntryValue | null): EvidenceMode {
  return String(rawValue ?? "").trim() === "metadata_snapshots"
    ? "metadata_snapshots"
    : "metadata_only";
}

function parseDevicePolicy(rawValue: FormDataEntryValue | null): DevicePolicy {
  const value = String(rawValue ?? "").trim();
  if (
    value === "any" ||
    value === "mobile_preferred" ||
    value === "desktop_only"
  ) {
    return value;
  }
  return DEFAULT_PROCTORING_SETTINGS.device_policy;
}

function getExamProctoringPayload(formData: FormData) {
  const proctoringMode = parseProctoringMode(formData.get("proctoring_mode"));
  const devicePolicy =
    proctoringMode === "off"
      ? "any"
      : proctoringMode === "strict"
        ? "desktop_only"
        : parseDevicePolicy(formData.get("device_policy"));
  const requireFullscreen =
    proctoringMode === "strict"
      ? true
      : proctoringMode === "off"
      ? false
      : parseCheckbox(formData, "require_fullscreen");
  const identityVerification =
    proctoringMode === "off"
      ? false
      : parseCheckbox(formData, "identity_verification");
  const requireCamera =
    proctoringMode === "strict"
      ? true
      : proctoringMode === "off"
      ? false
      : parseCheckbox(formData, "require_camera") || identityVerification;

  return {
    proctoring_mode: proctoringMode,
    device_policy: getEffectiveDevicePolicy({
      proctoring_mode: proctoringMode,
      device_policy: devicePolicy,
    }),
    require_fullscreen: requireFullscreen,
    require_camera: requireCamera,
    identity_verification: identityVerification,
    evidence_mode:
      proctoringMode === "off"
        ? DEFAULT_PROCTORING_SETTINGS.evidence_mode
        : parseEvidenceMode(formData.get("evidence_mode")),
    post_exam_similarity_enabled:
      proctoringMode === "off"
        ? false
        : parseCheckbox(formData, "post_exam_similarity_enabled"),
  };
}

function getExamQuestionCacheKey(examId: string) {
  return `exam:${examId}:questions`;
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
  const shuffle_questions = parseCheckbox(formData, "shuffle_questions");
  const shuffle_options = parseCheckbox(formData, "shuffle_options");
  const proctoringPayload = getExamProctoringPayload(formData);

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
      ...proctoringPayload,
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
  redirect(`/educator/question-bank/private?examId=${data.id}`);
}

async function legacyUpdateExam(examId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: existingExam } = await supabase
    .from("exams")
    .select(
      "id, title, description, subject_id, is_published, start_time, published_at, shuffle_questions, shuffle_options"
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
        ? parseCheckbox(formData, "shuffle_questions")
        : existingExam.shuffle_questions,
      shuffle_options: formData.has("shuffle_options")
        ? parseCheckbox(formData, "shuffle_options")
        : existingExam.shuffle_options,
      ...getExamProctoringPayload(formData),
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

export async function updateExam(examId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: existingExam } = await supabase
    .from("exams")
    .select(
      "id, title, description, subject_id, is_published, start_time, published_at, shuffle_questions, shuffle_options"
    )
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!existingExam) return { error: "Шалгалт олдсонгүй" };
  if (!existingExam.is_published) {
    return legacyUpdateExam(examId, formData);
  }

  const publishedStartMs = new Date(existingExam.start_time).getTime();
  if (Number.isNaN(publishedStartMs) || publishedStartMs <= Date.now()) {
    return {
      error: "Нийтлэгдсэн шалгалтыг зөвхөн эхлэхээс өмнө өөрчлөх боломжтой",
    };
  }

  const { count: sessionCount, error: sessionCountError } = await supabase
    .from("exam_sessions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId)
    .in("status", ["in_progress", "submitted", "graded", "timed_out"]);

  if (sessionCountError) {
    return { error: sessionCountError.message };
  }

  if ((sessionCount ?? 0) > 0) {
    return { error: "Энэ шалгалтад оролдлого эхэлсэн тул өөрчлөх боломжгүй" };
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
    return { error: "Нээгдэх болон хаагдах хугацаагаа бүрэн оруулна уу" };
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

  const allowedIds = await getAllowedSubjectIds(supabase, user.id);
  if (allowedIds !== null) {
    if (!subject_id) {
      return { error: "Хичээл заавал сонгоно уу" };
    }

    if (!allowedIds.includes(subject_id)) {
      return {
        error: "Энэ хичээлийн шалгалт үүсгэх эрх байхгүй байна",
      };
    }
  }

  if (groupIds.length > 0) {
    if (allowedIds !== null) {
      if (!subject_id) {
        return { error: "Хичээл заавал сонгоно уу" };
      }

      const allowedGroupIds =
        (await getAllowedGroupIds(supabase, user.id, subject_id)) ?? [];

      const invalidGroupId = groupIds.find(
        (groupId) => !allowedGroupIds.includes(groupId)
      );
      if (invalidGroupId) {
        return {
          error: "Энэ бүлэгт энэ хичээлийн шалгалт оноох эрх байхгүй байна",
        };
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
  const groupsToAdd = groupIds.filter(
    (groupId) => !existingGroupIds.includes(groupId)
  );
  const groupsToRemove = existingGroupIds.filter(
    (groupId) => !groupIds.includes(groupId)
  );

  const { data: previousRecipients } = await supabase
    .from("exam_recipients")
    .select("student_id")
    .eq("exam_id", examId);
  const previousRecipientIds = new Set(
    (previousRecipients ?? []).map((row) => row.student_id)
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
        ? parseCheckbox(formData, "shuffle_questions")
        : existingExam.shuffle_questions,
      shuffle_options: formData.has("shuffle_options")
        ? parseCheckbox(formData, "shuffle_options")
        : existingExam.shuffle_options,
      ...getExamProctoringPayload(formData),
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

  const syncResult = await syncExamRecipients(supabase, examId, user.id);
  if (!syncResult.success) {
    return { error: syncResult.error };
  }

  const snapshot = await buildPublishedExamSnapshot(supabase, examId);
  if (!snapshot) {
    return { error: "Шалгалтын snapshot шинэчилж чадсангүй" };
  }

  const publishedAt = existingExam.published_at ?? snapshot.exam.published_at;
  const nextSnapshot = {
    ...snapshot,
    exam: {
      ...snapshot.exam,
      published_at: publishedAt,
    },
  };

  const { error: snapshotError } = await supabase
    .from("exams")
    .update({
      published_snapshot: nextSnapshot,
      published_at: publishedAt,
    })
    .eq("id", examId)
    .eq("created_by", user.id);

  if (snapshotError && !isSnapshotColumnMissingError(snapshotError.code)) {
    return { error: snapshotError.message };
  }

  await redis.del(getExamQuestionCacheKey(examId));

  const { data: nextRecipients } = await supabase
    .from("exam_recipients")
    .select("student_id")
    .eq("exam_id", examId);
  const newStudentIds = (nextRecipients ?? [])
    .map((row) => row.student_id)
    .filter((studentId) => !previousRecipientIds.has(studentId));

  if (newStudentIds.length > 0) {
    notifyStudentsOfNewExam(examId, title, newStudentIds).catch(() => {});
  }

  revalidatePath("/educator");
  revalidatePath(`/educator/exams/${examId}`);
  revalidatePath(`/educator/exams/${examId}/edit`);
  revalidatePath(`/educator/exams/${examId}/questions`);
  revalidatePath("/student");
  revalidatePath("/student/exams");
  revalidatePath("/student/schedule");
  revalidatePath("/student/results");
  revalidatePath(`/student/exams/${examId}/take`);
  revalidatePath(`/student/exams/${examId}/result`);

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

  // Redis prewarm: cache stampede-ээс сэргийлж exam payload-г урьдчилан cache-лэнэ.
  // Publish зөвхөн cache амжилттай бэлтгэгдсэн үед үргэлжилнэ.
  try {
    await prewarmExamCache(examId, snapshot);
  } catch (prewarmError) {
    return {
      error:
        prewarmError instanceof Error
          ? `Шалгалтын cache бэлтгэхэд алдаа гарлаа: ${prewarmError.message}`
          : "Шалгалтын cache бэлтгэхэд алдаа гарлаа",
    };
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

  // Notify all assigned students about the new exam
  const { data: recipients } = await supabase
    .from("exam_recipients")
    .select("student_id")
    .eq("exam_id", examId);

  if (recipients && recipients.length > 0) {
    const studentIds = recipients.map((r) => r.student_id);
    try {
      await notifyStudentsOfNewExam(
        examId,
        snapshot.exam.title,
        studentIds,
        {
          startTime: snapshot.exam.start_time,
          durationMinutes: snapshot.exam.duration_minutes,
        }
      );
    } catch (notificationError) {
      console.error(
        `Failed to notify students after publishing exam ${examId}:`,
        notificationError
      );
    }
  }

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
        "student_id, access_start_time, access_end_time, max_attempts_override, excused_at, status_note, profiles:profiles!exam_recipients_student_id_fkey(full_name, email, avatar_url)"
      )
      .eq("exam_id", examId),
    supabase
      .from("exam_sessions")
      .select(
        "id, user_id, status, total_score, max_score, submitted_at, started_at, attempt_number, risk_score, risk_level, flag_status, flag_summary, last_snapshot_at, review_note, profiles(full_name, email, avatar_url)"
      )
      .eq("exam_id", examId)
      .in("status", ["in_progress", "submitted", "graded", "timed_out"])
      .order("attempt_number", { ascending: false }),
  ]);

  if (recipientsResult.error) {
    console.error("Failed to load exam recipients for results", {
      examId,
      error: recipientsResult.error,
    });
  }

  if (sessionsResult.error) {
    console.error("Failed to load exam sessions for results", {
      examId,
      error: sessionsResult.error,
    });
  }

  const recipients = (recipientsResult.data ?? []).filter(
    (recipient) =>
      managementScope.manageAll || visibleStudentIds.has(recipient.student_id)
  );
  const sessions = (sessionsResult.data ?? []).filter(
    (session) => managementScope.manageAll || visibleStudentIds.has(session.user_id)
  );
  const sessionsByStudent = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const studentSessions = sessionsByStudent.get(session.user_id) ?? [];
    studentSessions.push(session);
    sessionsByStudent.set(session.user_id, studentSessions);
  }

  const latestSessionByStudent = new Map<string, (typeof sessions)[number]>();
  const bestSessionByStudent = new Map<string, (typeof sessions)[number]>();

  for (const [studentId, studentSessions] of sessionsByStudent.entries()) {
    const latestSession = pickLatestAttempt(studentSessions);
    if (latestSession) {
      latestSessionByStudent.set(studentId, latestSession);
    }

    const bestSession = pickBestAttempt(
      studentSessions.filter((session) =>
        isFinalizedAttemptStatus(String(session.status ?? ""))
      )
    );
    if (bestSession) {
      bestSessionByStudent.set(studentId, bestSession);
    }
  }

  const recipientsByStudent = new Map(
    recipients.map((recipient) => [recipient.student_id, recipient] as const)
  );
  const orderedStudentIds = [
    ...recipients.map((recipient) => recipient.student_id),
    ...sessions
      .map((session) => session.user_id)
      .filter((studentId) => !recipientsByStudent.has(studentId)),
  ];

  const passingScore = exam.passing_score ?? 60;
  const nowMs = Date.now();
  const bestSessionIds = Array.from(
    new Set(
      Array.from(bestSessionByStudent.values())
        .map((session) => session.id)
        .filter(Boolean)
    )
  );
  const normalizeProfile = (
    profile:
      | {
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
        }
      | Array<{
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
        }>
      | null
      | undefined
  ) => (Array.isArray(profile) ? profile[0] ?? null : profile ?? null);

  const sessionResults = orderedStudentIds.map((studentId) => {
    const recipient = recipientsByStudent.get(studentId);
    const latestSession = latestSessionByStudent.get(studentId);
    const bestSession = bestSessionByStudent.get(studentId);
    const recipientProfile = normalizeProfile(recipient?.profiles);
    const sessionProfile = normalizeProfile(
      bestSession?.profiles ?? latestSession?.profiles
    );
    const studentGroupIds = studentGroupMap.get(studentId) ?? [];
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
      recipient ?? {}
    );
    const lifecycle = deriveStudentExamLifecycle({
      exam: {
        start_time: exam.start_time,
        end_time: exam.end_time,
        max_attempts: exam.max_attempts,
        duration_minutes: exam.duration_minutes,
      },
      recipient: recipient ?? {},
      latestSessionStatus: latestSession?.status ?? null,
      latestAttemptNumber: latestSession?.attempt_number ?? 0,
      latestSessionStartedAt: latestSession?.started_at ?? null,
      nowMs,
    });
    const isAttempted = Boolean(bestSession);
    const totalScore = Number(bestSession?.total_score ?? 0);
    const maxScore = Number(bestSession?.max_score ?? 0);
    const percentage = isAttempted
      ? getAttemptPercentage(bestSession ?? {})
      : 0;
    const hasRemainingAttempts = ["available", "retake_available"].includes(
      lifecycle.key
    );

    return {
      session_id: bestSession?.id ?? latestSession?.id ?? null,
      student_id: studentId,
      student_name:
        recipientProfile?.full_name ??
        sessionProfile?.full_name ??
        "—",
      student_email:
        recipientProfile?.email ??
        sessionProfile?.email ??
        "—",
      student_avatar_url:
        recipientProfile?.avatar_url ?? sessionProfile?.avatar_url ?? null,
      total_score: isAttempted ? totalScore : null,
      max_score: isAttempted ? maxScore : null,
      percentage: isAttempted ? percentage : null,
      status: lifecycle.key,
      status_label: lifecycle.label,
      submitted_at:
        bestSession?.submitted_at ??
        bestSession?.started_at ??
        latestSession?.submitted_at ??
        latestSession?.started_at ??
        null,
      passed: isAttempted ? percentage >= passingScore : false,
      groups: studentGroups,
      has_retake_override: access.hasRetakeOverride,
      has_remaining_attempts: hasRemainingAttempts,
      status_note: recipient?.status_note ?? null,
      risk_score: Number(bestSession?.risk_score ?? latestSession?.risk_score ?? 0),
      risk_level: String(bestSession?.risk_level ?? latestSession?.risk_level ?? "low"),
      flag_status: String(bestSession?.flag_status ?? latestSession?.flag_status ?? "clear"),
      flag_summary:
        String(bestSession?.flag_summary ?? latestSession?.flag_summary ?? "").trim() ||
        null,
      last_snapshot_at:
        String(bestSession?.last_snapshot_at ?? latestSession?.last_snapshot_at ?? "").trim() ||
        null,
      review_note:
        String(bestSession?.review_note ?? latestSession?.review_note ?? "").trim() ||
        null,
    };
  });

  const attemptedRows = sessionResults.filter((row) => row.percentage !== null);
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

  const [questionsResult, answersResult] = await Promise.all([
    supabase
      .from("questions")
      .select("id, content, points, order_index, type")
      .eq("exam_id", examId)
      .order("order_index", { ascending: true }),
    bestSessionIds.length > 0
      ? supabase
          .from("answers")
          .select("session_id, question_id, answer, score, is_correct, first_answered_at, last_changed_at, change_count")
          .in("session_id", bestSessionIds)
      : Promise.resolve({
          data: [] as Array<{
            session_id: string;
            question_id: string;
            answer: string | null;
            score: number | null;
            is_correct: boolean | null;
          }>,
          error: null,
        }),
  ]);

  if (questionsResult.error) {
    console.error("Failed to load exam questions for results analytics", {
      examId,
      error: questionsResult.error,
    });
  }

  if (answersResult.error) {
    console.error("Failed to load exam answers for results analytics", {
      examId,
      error: answersResult.error,
    });
  }

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
    questions:
      (questionsResult.data ?? []).map((question) => ({
        id: String(question.id),
        content: String(question.content ?? ""),
        points: Number(question.points ?? 0),
        order_index: Number(question.order_index ?? 0),
        type: String(question.type ?? ""),
      })) ?? [],
    answers:
      (answersResult.data ?? []).map((answer) => ({
        session_id: String(answer.session_id),
        question_id: String(answer.question_id),
        answer: answer.answer ?? null,
        score: answer.score === null ? null : Number(answer.score),
        is_correct:
          typeof answer.is_correct === "boolean" ? answer.is_correct : null,
        first_answered_at:
          "first_answered_at" in answer &&
          typeof answer.first_answered_at === "string"
            ? answer.first_answered_at
            : null,
        last_changed_at:
          "last_changed_at" in answer &&
          typeof answer.last_changed_at === "string"
            ? answer.last_changed_at
            : null,
        change_count:
          "change_count" in answer ? Number(answer.change_count ?? 0) : 0,
      })) ?? [],
    groups: visibleGroups,
  };
}
