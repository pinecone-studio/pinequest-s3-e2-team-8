"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailMessage } from "@/lib/notification/email";
import { formatDateTimeUB } from "@/lib/utils/date";

export type NotificationType =
  | "exam_submitted"
  | "exam_graded"
  | "exam_reminder_1day"
  | "exam_reminder_1hour"
  | "ai_grading_complete"
  | "new_exam_assigned"
  | "general";

type EmailDeliveryType =
  | "new_exam_assigned_student"
  | "exam_graded_student"
  | "exam_graded_parent"
  | "exam_reminder_1day_student"
  | "exam_reminder_1day_parent"
  | "exam_reminder_1hour_student"
  | "exam_reminder_1hour_parent"
  | "weekly_parent_digest";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

type NotificationInsertParams = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
};

export type ExamReminderType = "exam_reminder_1day" | "exam_reminder_1hour";

export type ExamReminderCandidate = {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  parentEmail: string | null;
  examId: string;
  examTitle: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

export type ParentWeeklyDigest = {
  studentId: string;
  studentName: string;
  parentEmail: string;
  digestKey: string;
  completedCount: number;
  averagePercentage: number | null;
  recentResults: Array<{
    examId: string;
    examTitle: string;
    totalScore: number;
    maxScore: number;
    percentage: number;
    submittedAt: string;
  }>;
  missedCount: number;
  timedOutCount: number;
  upcomingExams: Array<{
    examId: string;
    examTitle: string;
    startTime: string;
  }>;
};

type EmailDeliveryParams = {
  recipientEmail: string;
  recipientUserId?: string | null;
  type: EmailDeliveryType;
  subject: string;
  html: string;
  text: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
};

type NotificationRow = {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  metadata: Record<string, unknown>;
  dedupe_key?: string | null;
};

type NotificationWriteResult = {
  insertedRows: NotificationRow[];
};

const EMAIL_DELIVERY_BATCH_SIZE = 4;
const EMAIL_DELIVERY_BATCH_DELAY_MS = 250;

function getAppBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, "")}`;
  }

  return "http://localhost:3000";
}

function toAbsoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${getAppBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDedupeKey(...parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) => String(part).trim())
    .join(":");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDurationMinutes(durationMinutes: number) {
  if (durationMinutes <= 0) return "Тодорхойгүй";
  if (durationMinutes < 60) return `${durationMinutes} минут`;

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (minutes === 0) return `${hours} цаг`;
  return `${hours} цаг ${minutes} минут`;
}

function buildEmailHtml(title: string, intro: string, sections: string[]) {
  const renderedSections = sections
    .filter(Boolean)
    .map(
      (section) =>
        `<div style="margin:12px 0;padding:12px 14px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">${section}</div>`
    )
    .join("");

  return `<!doctype html>
<html lang="mn">
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 12px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Smart Exam System</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">${escapeHtml(intro)}</p>
      ${renderedSections}
      <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
        Энэ мэдэгдэл нь Smart Exam System-ээс автоматаар илгээгдэв.
      </p>
    </div>
  </body>
</html>`;
}

function buildExamInfoLine(candidate: {
  examTitle: string;
  startTime: string;
  durationMinutes: number;
}) {
  return [
    `Шалгалт: ${candidate.examTitle}`,
    `Эхлэх цаг: ${formatDateTimeUB(candidate.startTime)}`,
    `Үргэлжлэх хугацаа: ${formatDurationMinutes(candidate.durationMinutes)}`,
  ].join("\n");
}

function buildReminderContent(
  candidate: ExamReminderCandidate,
  type: ExamReminderType,
  recipient: "student" | "parent"
) {
  const isParent = recipient === "parent";
  const relativeLabel =
    type === "exam_reminder_1day" ? "маргааш" : "1 цагийн дараа";
  const link = toAbsoluteUrl("/student/exams");
  const intro = isParent
    ? `${candidate.studentName}-ийн "${candidate.examTitle}" шалгалт ${relativeLabel} эхэлнэ.`
    : `"${candidate.examTitle}" шалгалт ${relativeLabel} эхэлнэ.`;
  const title = isParent
    ? `${candidate.studentName}-ийн шалгалтын сануулга`
    : "Шалгалтын сануулга";
  const subjectPrefix =
    type === "exam_reminder_1day" ? "Маргааш шалгалт байна" : "Шалгалт удахгүй эхэлнэ";
  const subject = isParent
    ? `${subjectPrefix}: ${candidate.studentName}`
    : `${subjectPrefix}: ${candidate.examTitle}`;

  const html = buildEmailHtml(title, intro, [
    `<strong>Шалгалт</strong><br />${escapeHtml(candidate.examTitle)}`,
    `<strong>Эхлэх цаг</strong><br />${escapeHtml(formatDateTimeUB(candidate.startTime))}`,
    `<strong>Үргэлжлэх хугацаа</strong><br />${escapeHtml(formatDurationMinutes(candidate.durationMinutes))}`,
    `<strong>Шалгалт руу орох холбоос</strong><br /><a href="${escapeHtml(link)}" style="color:#2563eb;">${escapeHtml(link)}</a>`,
  ]);

  const text = [
    title,
    intro,
    buildExamInfoLine(candidate),
    `Шалгалт руу орох холбоос: ${link}`,
  ].join("\n\n");

  return { subject, html, text };
}

function buildNewExamAssignedContent(params: {
  studentName: string;
  examTitle: string;
  startTime?: string | null;
  durationMinutes?: number | null;
  link: string;
}) {
  const hasSchedule = Boolean(params.startTime);
  const title = "Шинэ шалгалт танд оноогдлоо";
  const intro = hasSchedule
    ? `"${params.examTitle}" шалгалт танд оноогдлоо. Хугацаагаа урьдчилж шалгаарай.`
    : `"${params.examTitle}" шалгалт танд оноогдлоо.`;
  const subject = `Шинэ шалгалт: ${params.examTitle}`;

  const sections = [
    `<strong>Шалгалт</strong><br />${escapeHtml(params.examTitle)}`,
    hasSchedule
      ? `<strong>Эхлэх цаг</strong><br />${escapeHtml(formatDateTimeUB(String(params.startTime)))}`
      : "",
    params.durationMinutes
      ? `<strong>Үргэлжлэх хугацаа</strong><br />${escapeHtml(
          formatDurationMinutes(Number(params.durationMinutes))
        )}`
      : "",
    `<strong>Шалгалтын жагсаалт</strong><br /><a href="${escapeHtml(params.link)}" style="color:#2563eb;">${escapeHtml(params.link)}</a>`,
  ].filter(Boolean);

  const html = buildEmailHtml(title, intro, sections);
  const text = [
    title,
    intro,
    `Шалгалт: ${params.examTitle}`,
    params.startTime ? `Эхлэх цаг: ${formatDateTimeUB(String(params.startTime))}` : "",
    params.durationMinutes
      ? `Үргэлжлэх хугацаа: ${formatDurationMinutes(Number(params.durationMinutes))}`
      : "",
    `Шалгалтын жагсаалт: ${params.link}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}

function buildGradingContent(params: {
  recipient: "student" | "parent";
  studentName: string;
  examTitle: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  link: string;
}) {
  const intro =
    params.recipient === "parent"
      ? `${params.studentName}-ийн "${params.examTitle}" шалгалтын дүн гарлаа.`
      : `"${params.examTitle}" шалгалтын таны дүн гарлаа.`;
  const title =
    params.recipient === "parent"
      ? `${params.studentName}-ийн шалгалтын дүн`
      : "Шалгалтын дүн гарлаа";
  const subject =
    params.recipient === "parent"
      ? `Шалгалтын дүн: ${params.studentName}`
      : `Шалгалтын дүн: ${params.examTitle}`;

  const html = buildEmailHtml(title, intro, [
    `<strong>Шалгалт</strong><br />${escapeHtml(params.examTitle)}`,
    `<strong>Оноо</strong><br />${escapeHtml(`${params.totalScore}/${params.maxScore} (${params.percentage}%)`)}`,
    `<strong>Дэлгэрэнгүй харах холбоос</strong><br /><a href="${escapeHtml(params.link)}" style="color:#2563eb;">${escapeHtml(params.link)}</a>`,
  ]);

  const text = [
    title,
    intro,
    `Шалгалт: ${params.examTitle}`,
    `Оноо: ${params.totalScore}/${params.maxScore} (${params.percentage}%)`,
    `Дэлгэрэнгүй: ${params.link}`,
  ].join("\n\n");

  return { subject, html, text };
}

function buildWeeklyDigestContent(digest: ParentWeeklyDigest) {
  const attentionPoints: string[] = [];
  if (digest.missedCount > 0) {
    attentionPoints.push(`Өгөөгүй шалгалт: ${digest.missedCount}`);
  }
  if (digest.timedOutCount > 0) {
    attentionPoints.push(`Хугацаа дууссан оролдлого: ${digest.timedOutCount}`);
  }
  if (
    digest.averagePercentage !== null &&
    Number.isFinite(digest.averagePercentage) &&
    digest.averagePercentage < 60
  ) {
    attentionPoints.push(`Дундаж дүн ${digest.averagePercentage}% байгаа тул нэмэлт анхаарал хэрэгтэй`);
  }

  const recentResultsBlock =
    digest.recentResults.length === 0
      ? "Энэ 7 хоногт дүн гарсан шалгалт алга."
      : digest.recentResults
          .slice(0, 3)
          .map(
            (result) =>
              `${result.examTitle}: ${result.totalScore}/${result.maxScore} (${result.percentage}%)`
          )
          .join("<br />");

  const upcomingBlock =
    digest.upcomingExams.length === 0
      ? "Ирэх 7 хоногт товлогдсон шалгалт алга."
      : digest.upcomingExams
          .slice(0, 3)
          .map(
            (exam) =>
              `${exam.examTitle}: ${formatDateTimeUB(exam.startTime)}`
          )
          .join("<br />");

  const intro = `${digest.studentName}-ийн сүүлийн 7 хоногийн гол мэдээллийг нэг дор бэлтгэлээ.`;
  const title = `${digest.studentName}-ийн 7 хоногийн тайлан`;
  const subject = `7 хоногийн тайлан: ${digest.studentName}`;
  const summaryLines = [
    `Дуусгасан шалгалт: ${digest.completedCount}`,
    `Дундаж дүн: ${
      digest.averagePercentage === null ? "Одоогоор байхгүй" : `${digest.averagePercentage}%`
    }`,
    `Өгөөгүй шалгалт: ${digest.missedCount}`,
    `Хугацаа дууссан оролдлого: ${digest.timedOutCount}`,
  ];

  const html = buildEmailHtml(title, intro, [
    `<strong>Товч тойм</strong><br />${summaryLines
      .map((line) => escapeHtml(line))
      .join("<br />")}`,
    `<strong>Сүүлийн дүнгүүд</strong><br />${recentResultsBlock}`,
    `<strong>Ирэх 7 хоногийн шалгалтууд</strong><br />${upcomingBlock}`,
    attentionPoints.length > 0
      ? `<strong>Анхаарах зүйл</strong><br />${attentionPoints
          .map((point) => escapeHtml(point))
          .join("<br />")}`
      : `<strong>Анхаарах зүйл</strong><br />Одоогоор ноцтой эрсдэл ажиглагдсангүй.`,
  ]);

  const text = [
    title,
    intro,
    ...summaryLines,
    "",
    "Сүүлийн дүнгүүд:",
    digest.recentResults.length === 0
      ? "- Энэ 7 хоногт дүн гарсан шалгалт алга."
      : digest.recentResults
          .slice(0, 3)
          .map(
            (result) =>
              `- ${result.examTitle}: ${result.totalScore}/${result.maxScore} (${result.percentage}%)`
          )
          .join("\n"),
    "",
    "Ирэх 7 хоногийн шалгалтууд:",
    digest.upcomingExams.length === 0
      ? "- Ирэх 7 хоногт товлогдсон шалгалт алга."
      : digest.upcomingExams
          .slice(0, 3)
          .map(
            (exam) => `- ${exam.examTitle}: ${formatDateTimeUB(exam.startTime)}`
          )
          .join("\n"),
    "",
    "Анхаарах зүйл:",
    attentionPoints.length === 0
      ? "- Одоогоор ноцтой эрсдэл ажиглагдсангүй."
      : attentionPoints.map((point) => `- ${point}`).join("\n"),
  ].join("\n");

  return { subject, html, text };
}

async function getExamManagerIds(
  admin: SupabaseAdminClient,
  examId: string
) {
  const { data: exam } = await admin
    .from("exams")
    .select("created_by, subject_id")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return [];

  const managerIds = new Set<string>();
  if (exam.created_by) {
    managerIds.add(String(exam.created_by));
  }

  if (!exam.subject_id) {
    return Array.from(managerIds);
  }

  const { data: assignments } = await admin
    .from("exam_assignments")
    .select("group_id")
    .eq("exam_id", examId);

  const groupIds = Array.from(
    new Set((assignments ?? []).map((assignment) => assignment.group_id))
  );

  if (groupIds.length === 0) {
    return Array.from(managerIds);
  }

  const { data: teachingAssignments } = await admin
    .from("teaching_assignments")
    .select("teacher_id")
    .eq("subject_id", exam.subject_id)
    .eq("is_active", true)
    .in("group_id", groupIds);

  for (const row of teachingAssignments ?? []) {
    managerIds.add(String(row.teacher_id));
  }

  return Array.from(managerIds);
}

function toNotificationRow(params: NotificationInsertParams): NotificationRow {
  return {
    user_id: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link ?? null,
    metadata: params.metadata ?? {},
    dedupe_key: params.dedupeKey ?? null,
  };
}

async function writeNotificationRows(rows: NotificationRow[]): Promise<NotificationWriteResult> {
  if (rows.length === 0) {
    return { insertedRows: [] };
  }

  const admin = createAdminClient();
  const keyedRows = Array.from(
    new Map(
      rows
        .filter((row): row is NotificationRow & { dedupe_key: string } => Boolean(row.dedupe_key))
        .map((row) => [String(row.dedupe_key), row])
    ).values()
  );
  const unkeyedRows = rows.filter((row) => !row.dedupe_key);
  const insertedRows: NotificationRow[] = [];

  if (keyedRows.length > 0) {
    const dedupeKeys = keyedRows.map((row) => String(row.dedupe_key));
    const { data: existingRows, error: existingError } = await admin
      .from("notifications")
      .select("dedupe_key")
      .in("dedupe_key", dedupeKeys);

    if (existingError) {
      console.error("Failed to load existing notifications:", existingError.message);
      const { error } = await admin.from("notifications").insert(keyedRows);
      if (error) {
        console.error("Failed to insert keyed notifications:", error.message);
      } else {
        insertedRows.push(...keyedRows);
      }
    } else {
      const existingKeys = new Set(
        (existingRows ?? [])
          .map((row) => row.dedupe_key)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      );

      const missingRows = keyedRows.filter(
        (row) => !existingKeys.has(String(row.dedupe_key))
      );

      if (missingRows.length > 0) {
        const { error } = await admin.from("notifications").insert(missingRows);

        if (error) {
          console.error("Failed to insert keyed notifications:", error.message);
        } else {
          insertedRows.push(...missingRows);
        }
      }
    }
  }

  if (unkeyedRows.length > 0) {
    const { error } = await admin.from("notifications").insert(unkeyedRows);

    if (error) {
      console.error("Failed to insert notifications:", error.message);
    } else {
      insertedRows.push(...unkeyedRows);
    }
  }

  return { insertedRows };
}

async function claimEmailDelivery(
  admin: SupabaseAdminClient,
  params: EmailDeliveryParams
) {
  const now = new Date().toISOString();

  const { data: existingRow, error: existingError } = await admin
    .from("email_deliveries")
    .select("id, status, attempts")
    .eq("dedupe_key", params.dedupeKey)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message } as const;
  }

  let existing = existingRow as
    | { id: string; status: string; attempts: number }
    | null;

  if (!existing) {
    const { error: insertError } = await admin.from("email_deliveries").insert({
      recipient_email: params.recipientEmail,
      recipient_user_id: params.recipientUserId ?? null,
      type: params.type,
      subject: params.subject,
      dedupe_key: params.dedupeKey,
      status: "pending",
      metadata: params.metadata ?? {},
      updated_at: now,
    });

    if (insertError && insertError.code !== "23505") {
      return { error: insertError.message } as const;
    }

    const { data: insertedRow, error: insertedError } = await admin
      .from("email_deliveries")
      .select("id, status, attempts")
      .eq("dedupe_key", params.dedupeKey)
      .maybeSingle();

    if (insertedError) {
      return { error: insertedError.message } as const;
    }

    existing = (insertedRow as
      | { id: string; status: string; attempts: number }
      | null) ?? null;
  }

  if (!existing) {
    return { skipped: true } as const;
  }

  if (existing.status === "sent" || existing.status === "skipped") {
    return { skipped: true } as const;
  }

  if (existing.status === "processing") {
    return { skipped: true } as const;
  }

  if (existing.status === "failed" && Number(existing.attempts ?? 0) >= 3) {
    return { skipped: true } as const;
  }

  const nextAttempts = Number(existing.attempts ?? 0) + 1;
  const { data: claimedRows, error: claimError } = await admin
    .from("email_deliveries")
    .update({
      recipient_email: params.recipientEmail,
      recipient_user_id: params.recipientUserId ?? null,
      type: params.type,
      subject: params.subject,
      status: "processing",
      attempts: nextAttempts,
      metadata: params.metadata ?? {},
      last_error: null,
      updated_at: now,
    })
    .eq("dedupe_key", params.dedupeKey)
    .in("status", ["pending", "failed"])
    .select("id")
    .limit(1);

  if (claimError) {
    return { error: claimError.message } as const;
  }

  if (!claimedRows || claimedRows.length === 0) {
    return { skipped: true } as const;
  }

  return { claimed: true } as const;
}

async function finalizeEmailDelivery(
  admin: SupabaseAdminClient,
  dedupeKey: string,
  payload: {
    status: "sent" | "failed" | "skipped";
    lastError?: string | null;
    providerMessageId?: string | null;
    sentAt?: string | null;
  }
) {
  const updatePayload: Record<string, string | null> = {
    status: payload.status,
    last_error: payload.lastError ?? null,
    provider_message_id: payload.providerMessageId ?? null,
    sent_at: payload.sentAt ?? null,
    updated_at: new Date().toISOString(),
  };

  await admin
    .from("email_deliveries")
    .update(updatePayload)
    .eq("dedupe_key", dedupeKey);
}

async function deliverTrackedEmail(params: EmailDeliveryParams) {
  const admin = createAdminClient();
  const claim = await claimEmailDelivery(admin, params);

  if ("error" in claim) {
    console.error("Failed to claim email delivery:", claim.error);
    return { success: false as const, error: claim.error };
  }

  if ("skipped" in claim) {
    return { success: true as const, skipped: true };
  }

  const result = await sendEmailMessage({
    to: params.recipientEmail,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  if ("skipped" in result && result.skipped) {
    await finalizeEmailDelivery(admin, params.dedupeKey, {
      status: "skipped",
      lastError: result.error,
    });
    return { success: true as const, skipped: true };
  }

  if (!result.success) {
    await finalizeEmailDelivery(admin, params.dedupeKey, {
      status: "failed",
      lastError: result.error,
    });
    return { success: false as const, error: result.error };
  }

  await finalizeEmailDelivery(admin, params.dedupeKey, {
    status: "sent",
    providerMessageId: result.providerId,
    sentAt: new Date().toISOString(),
  });

  return { success: true as const, skipped: false };
}

async function deliverReminderEmails(
  candidate: ExamReminderCandidate,
  reminderType: ExamReminderType
) {
  const effectiveStartStamp = candidate.startTime;
  const results = {
    studentEmailsAttempted: 0,
    studentEmailsSent: 0,
    parentEmailsAttempted: 0,
    parentEmailsSent: 0,
  };

  if (candidate.studentEmail) {
    const content = buildReminderContent(candidate, reminderType, "student");
    results.studentEmailsAttempted += 1;
    const sent = await deliverTrackedEmail({
      recipientEmail: candidate.studentEmail,
      recipientUserId: candidate.studentId,
      type:
        reminderType === "exam_reminder_1day"
          ? "exam_reminder_1day_student"
          : "exam_reminder_1hour_student",
      subject: content.subject,
      html: content.html,
      text: content.text,
      dedupeKey: buildDedupeKey(
        reminderType,
        "student-email",
        candidate.examId,
        candidate.studentId,
        effectiveStartStamp
      ),
      metadata: {
        examId: candidate.examId,
        studentId: candidate.studentId,
        startTime: candidate.startTime,
      },
    });

    if (sent.success && !("skipped" in sent && sent.skipped)) {
      results.studentEmailsSent += 1;
    }
  }

  if (candidate.parentEmail) {
    const content = buildReminderContent(candidate, reminderType, "parent");
    results.parentEmailsAttempted += 1;
    const sent = await deliverTrackedEmail({
      recipientEmail: candidate.parentEmail,
      recipientUserId: candidate.studentId,
      type:
        reminderType === "exam_reminder_1day"
          ? "exam_reminder_1day_parent"
          : "exam_reminder_1hour_parent",
      subject: content.subject,
      html: content.html,
      text: content.text,
      dedupeKey: buildDedupeKey(
        reminderType,
        "parent-email",
        candidate.examId,
        candidate.studentId,
        effectiveStartStamp
      ),
      metadata: {
        examId: candidate.examId,
        studentId: candidate.studentId,
        startTime: candidate.startTime,
      },
    });

    if (sent.success && !("skipped" in sent && sent.skipped)) {
      results.parentEmailsSent += 1;
    }
  }

  return results;
}

// ─── Read ────────────────────────────────────────────────────────────

export async function getNotifications(limit = 20) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as Notification[];
}

export async function getUnreadCount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return count ?? 0;
}

// ─── Update ──────────────────────────────────────────────────────────

export async function markAsRead(notificationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй" };

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  revalidatePath("/student");
  revalidatePath("/educator");
  return { success: true };
}

export async function markAllAsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй" };

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  revalidatePath("/student");
  revalidatePath("/educator");
  return { success: true };
}

// ─── Create (internal helpers, called from other server actions) ─────

export async function createNotification(params: NotificationInsertParams) {
  return writeNotificationRows([toNotificationRow(params)]);
}

export async function createBulkNotifications(
  notifications: NotificationInsertParams[]
) {
  return writeNotificationRows(notifications.map(toNotificationRow));
}

// ─── Notification Triggers ───────────────────────────────────────────

/** Сурагч шалгалт илгээсэн → Холбогдох багш(нар)-д мэдэгдэх */
export async function notifyTeacherOfSubmission(
  examId: string,
  examTitle: string,
  studentName: string,
  sessionId?: string
) {
  const admin = createAdminClient();
  const teacherIds = await getExamManagerIds(admin, examId);

  if (teacherIds.length === 0) return;

  await createBulkNotifications(
    teacherIds.map((teacherId) => ({
      userId: teacherId,
      type: "exam_submitted",
      title: "Шинэ хариулт ирлээ",
      message: `${studentName} "${examTitle}" шалгалтаа илгээлээ.`,
      link: "/educator/grading",
      metadata: { examId, sessionId: sessionId ?? null },
      dedupeKey: sessionId
        ? buildDedupeKey("exam_submitted", examId, sessionId, teacherId)
        : undefined,
    }))
  );
}

/** Багш дүн баталгаажуулсан → Сурагчид мэдэгдэх + email */
export async function notifyStudentOfGrading(
  sessionId: string,
  userId: string,
  examId: string,
  examTitle: string,
  totalScore: number,
  maxScore: number
) {
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const resultLink = `/student/exams/${examId}/result`;

  await createNotification({
    userId,
    type: "exam_graded",
    title: "Шалгалтын дүн гарлаа",
    message: `"${examTitle}" шалгалтын дүн: ${totalScore}/${maxScore} (${percentage}%)`,
    link: resultLink,
    metadata: { examId, sessionId, totalScore, maxScore, percentage },
    dedupeKey: buildDedupeKey("exam_graded", examId, sessionId, userId),
  });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.email) {
    const content = buildGradingContent({
      recipient: "student",
      studentName: profile.full_name ?? "Сурагч",
      examTitle,
      totalScore,
      maxScore,
      percentage,
      link: toAbsoluteUrl(resultLink),
    });

    await deliverTrackedEmail({
      recipientEmail: profile.email,
      recipientUserId: userId,
      type: "exam_graded_student",
      subject: content.subject,
      html: content.html,
      text: content.text,
      dedupeKey: buildDedupeKey("exam_graded_student", examId, sessionId, userId),
      metadata: { examId, sessionId, totalScore, maxScore, percentage },
    });
  }
}

/** Шинэ шалгалт оноогдсон → Сурагчдад in-app notification + email */
export async function notifyStudentsOfNewExam(
  examId: string,
  examTitle: string,
  studentIds: string[],
  details?: { startTime?: string | null; durationMinutes?: number | null }
) {
  if (studentIds.length === 0) return;

  const extraMessage =
    details?.startTime && details?.durationMinutes
      ? ` Эхлэх цаг: ${formatDateTimeUB(details.startTime)}. Үргэлжлэх хугацаа: ${formatDurationMinutes(
          Number(details.durationMinutes ?? 0)
        )}.`
      : "";

  const notifications = studentIds.map((studentId) => ({
    userId: studentId,
    type: "new_exam_assigned" as NotificationType,
    title: "Шинэ шалгалт",
    message: `"${examTitle}" шалгалт танд оноогдлоо.${extraMessage}`,
    link: "/student/exams",
    metadata: {
      examId,
      startTime: details?.startTime ?? null,
      durationMinutes: details?.durationMinutes ?? null,
    },
    dedupeKey: buildDedupeKey("new_exam_assigned", examId, studentId),
  }));

  const notificationResult = await createBulkNotifications(notifications);
  const newlyNotifiedStudentIds = Array.from(
    new Set(notificationResult.insertedRows.map((row) => String(row.user_id)))
  );

  if (newlyNotifiedStudentIds.length === 0) {
    return;
  }

  const admin = createAdminClient();
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", newlyNotifiedStudentIds);

  if (profileError || !profiles || profiles.length === 0) {
    if (profileError) {
      console.error("Failed to load students for new exam email:", profileError.message);
    }
    return;
  }

  const link = toAbsoluteUrl("/student/exams");

  for (let index = 0; index < profiles.length; index += EMAIL_DELIVERY_BATCH_SIZE) {
    const batch = profiles.slice(index, index + EMAIL_DELIVERY_BATCH_SIZE);

    await Promise.all(
      batch.map(async (profile) => {
        if (!profile.email) return;

        const content = buildNewExamAssignedContent({
          studentName: profile.full_name ?? "Сурагч",
          examTitle,
          startTime: details?.startTime ?? null,
          durationMinutes: details?.durationMinutes ?? null,
          link,
        });

        const result = await sendEmailMessage({
          to: profile.email,
          subject: content.subject,
          html: content.html,
          text: content.text,
        });

        if (!result.success) {
          console.error(
            `Failed to send new exam email to student ${profile.id}:`,
            result.error
          );
        }
      })
    );

    if (index + EMAIL_DELIVERY_BATCH_SIZE < profiles.length) {
      await sleep(EMAIL_DELIVERY_BATCH_DELAY_MS);
    }
  }
}

/** Шалгалтын дүн гарсан → Эцэг эхэд email-ээр мэдэгдэх */
export async function notifyParentOfGrading(
  sessionId: string,
  studentId: string,
  studentName: string,
  examTitle: string,
  totalScore: number,
  maxScore: number
) {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("parent_email")
    .eq("id", studentId)
    .maybeSingle();

  if (!profile?.parent_email) return;

  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const content = buildGradingContent({
    recipient: "parent",
    studentName,
    examTitle,
    totalScore,
    maxScore,
    percentage,
    link: toAbsoluteUrl("/student/results"),
  });

  await deliverTrackedEmail({
    recipientEmail: profile.parent_email,
    recipientUserId: studentId,
    type: "exam_graded_parent",
    subject: content.subject,
    html: content.html,
    text: content.text,
    dedupeKey: buildDedupeKey(
      "exam_graded_parent",
      sessionId,
      studentId,
      examTitle
    ),
    metadata: { sessionId, studentId, examTitle, totalScore, maxScore, percentage },
  });
}

/** AI дүгнэлт хийгдсэн → Багшид мэдэгдэх */
export async function notifyTeacherOfAIGrading(
  teacherId: string,
  examTitle: string,
  gradedCount: number,
  sessionId: string
) {
  await createNotification({
    userId: teacherId,
    type: "ai_grading_complete",
    title: "AI дүгнэлт дууслаа",
    message: `"${examTitle}" шалгалтын ${gradedCount} эссэ AI-аар дүгнэгдлээ. Шалгана уу.`,
    link: `/educator/grading/${sessionId}`,
    metadata: { sessionId, gradedCount },
    dedupeKey: buildDedupeKey("ai_grading_complete", teacherId, sessionId),
  });
}

export async function sendExamReminderNotifications(
  candidates: ExamReminderCandidate[],
  reminderType: ExamReminderType
) {
  if (candidates.length === 0) {
    return {
      candidatesProcessed: 0,
      notificationsAttempted: 0,
      studentEmailsAttempted: 0,
      studentEmailsSent: 0,
      parentEmailsAttempted: 0,
      parentEmailsSent: 0,
    };
  }

  await createBulkNotifications(
    candidates.map((candidate) => ({
      userId: candidate.studentId,
      type: reminderType,
      title:
        reminderType === "exam_reminder_1day"
          ? "Маргааш шалгалт байна"
          : "Шалгалт удахгүй эхэлнэ!",
      message:
        reminderType === "exam_reminder_1day"
          ? `"${candidate.examTitle}" шалгалт ${formatDateTimeUB(candidate.startTime)}-д эхэлнэ.`
          : `"${candidate.examTitle}" шалгалт ${formatDateTimeUB(candidate.startTime)}-д эхэлнэ.`,
      link: "/student/exams",
      metadata: {
        examId: candidate.examId,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        durationMinutes: candidate.durationMinutes,
      },
      dedupeKey: buildDedupeKey(
        reminderType,
        "in-app",
        candidate.examId,
        candidate.studentId,
        candidate.startTime
      ),
    }))
  );

  let studentEmailsAttempted = 0;
  let studentEmailsSent = 0;
  let parentEmailsAttempted = 0;
  let parentEmailsSent = 0;

  for (
    let index = 0;
    index < candidates.length;
    index += EMAIL_DELIVERY_BATCH_SIZE
  ) {
    const batch = candidates.slice(index, index + EMAIL_DELIVERY_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((candidate) => deliverReminderEmails(candidate, reminderType))
    );

    for (const result of batchResults) {
      studentEmailsAttempted += result.studentEmailsAttempted;
      studentEmailsSent += result.studentEmailsSent;
      parentEmailsAttempted += result.parentEmailsAttempted;
      parentEmailsSent += result.parentEmailsSent;
    }

    if (index + EMAIL_DELIVERY_BATCH_SIZE < candidates.length) {
      await sleep(EMAIL_DELIVERY_BATCH_DELAY_MS);
    }
  }

  return {
    candidatesProcessed: candidates.length,
    notificationsAttempted: candidates.length,
    studentEmailsAttempted,
    studentEmailsSent,
    parentEmailsAttempted,
    parentEmailsSent,
  };
}

export async function sendWeeklyParentDigest(digest: ParentWeeklyDigest) {
  const hasMeaningfulContent =
    digest.completedCount > 0 ||
    digest.missedCount > 0 ||
    digest.timedOutCount > 0 ||
    digest.upcomingExams.length > 0;

  if (!hasMeaningfulContent) {
    return { success: true, skipped: true };
  }

  const content = buildWeeklyDigestContent(digest);
  return deliverTrackedEmail({
    recipientEmail: digest.parentEmail,
    recipientUserId: digest.studentId,
    type: "weekly_parent_digest",
    subject: content.subject,
    html: content.html,
    text: content.text,
    dedupeKey: buildDedupeKey(
      "weekly_parent_digest",
      digest.studentId,
      digest.digestKey
    ),
    metadata: {
      studentId: digest.studentId,
      completedCount: digest.completedCount,
      missedCount: digest.missedCount,
      timedOutCount: digest.timedOutCount,
      averagePercentage: digest.averagePercentage,
    },
  });
}
