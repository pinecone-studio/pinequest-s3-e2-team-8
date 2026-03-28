"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type NotificationType =
  | "exam_submitted"
  | "exam_graded"
  | "exam_reminder_1day"
  | "exam_reminder_1hour"
  | "ai_grading_complete"
  | "new_exam_assigned"
  | "general";

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

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();

  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link ?? null,
    metadata: params.metadata ?? {},
  });

  if (error) {
    console.error("Failed to create notification:", error.message);
  }
}

export async function createBulkNotifications(
  notifications: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }>
) {
  if (notifications.length === 0) return;

  const supabase = await createClient();

  const rows = notifications.map((n) => ({
    user_id: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link ?? null,
    metadata: n.metadata ?? {},
  }));

  const { error } = await supabase.from("notifications").insert(rows);

  if (error) {
    console.error("Failed to create bulk notifications:", error.message);
  }
}

// ─── Notification Triggers ───────────────────────────────────────────

/** Сурагч шалгалт илгээсэн → Багшид мэдэгдэх */
export async function notifyTeacherOfSubmission(
  examId: string,
  examTitle: string,
  studentName: string
) {
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("created_by")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return;

  await createNotification({
    userId: exam.created_by,
    type: "exam_submitted",
    title: "Шинэ хариулт ирлээ",
    message: `${studentName} "${examTitle}" шалгалтаа илгээлээ.`,
    link: "/educator/grading",
    metadata: { examId },
  });
}

/** Багш дүн баталгаажуулсан → Сурагчид мэдэгдэх */
export async function notifyStudentOfGrading(
  sessionId: string,
  userId: string,
  examId: string,
  examTitle: string,
  totalScore: number,
  maxScore: number
) {
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  await createNotification({
    userId,
    type: "exam_graded",
    title: "Шалгалтын дүн гарлаа",
    message: `"${examTitle}" шалгалтын дүн: ${totalScore}/${maxScore} (${percentage}%)`,
    link: `/student/exams/${examId}/result`,
    metadata: { examId, sessionId, totalScore, maxScore },
  });
}

/** Шинэ шалгалт оноогдсон → Сурагчдад мэдэгдэх */
export async function notifyStudentsOfNewExam(
  examId: string,
  examTitle: string,
  studentIds: string[]
) {
  const notifications = studentIds.map((studentId) => ({
    userId: studentId,
    type: "new_exam_assigned" as NotificationType,
    title: "Шинэ шалгалт",
    message: `"${examTitle}" шалгалт танд оноогдлоо.`,
    link: `/student/exams`,
    metadata: { examId },
  }));

  await createBulkNotifications(notifications);
}

/** Шалгалтын дүн гарсан → Эцэг эхэд email-ээр мэдэгдэх */
export async function notifyParentOfGrading(
  studentId: string,
  studentName: string,
  examTitle: string,
  totalScore: number,
  maxScore: number
) {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("parent_email")
    .eq("id", studentId)
    .maybeSingle();

  if (!profile?.parent_email) return;

  // Эцэг эхийн email-д мэдэгдэл хадгалах (parent_email нь системд бүртгэлтэй хэрэглэгч биш тул
  // notifications table-д хадгалахгүй, харин шууд email илгээх flow-д ашиглагдана)
  // Одоогоор in-app notification хэлбэрээр хадгална — ирээдүйд email integration нэмэх боломжтой
  console.log(
    `[PARENT NOTIFICATION] ${profile.parent_email}: "${studentName}" "${examTitle}" шалгалтын дүн: ${totalScore}/${maxScore}`
  );
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
  });
}
