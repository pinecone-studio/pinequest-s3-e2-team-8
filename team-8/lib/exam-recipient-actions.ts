"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageExam } from "@/lib/exam-scope";

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function revalidateExamParticipantPaths(examId: string) {
  revalidatePath(`/educator/exams/${examId}/results`);
  revalidatePath("/educator");
  revalidatePath("/student");
  revalidatePath("/student/exams");
  revalidatePath("/student/schedule");
  revalidatePath("/student/results");
}

export async function setRecipientExcused(
  examId: string,
  studentId: string,
  shouldExcuse: boolean
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Нэвтрээгүй байна" };

  const canManage = await canManageExam(supabase, examId, user.id);
  if (!canManage) return { error: "Энэ шалгалтын оролцогчийг удирдах эрх алга" };

  const updatePayload = shouldExcuse
    ? {
        excused_at: new Date().toISOString(),
        excused_by: user.id,
        access_start_time: null,
        access_end_time: null,
        max_attempts_override: null,
        status_note: "Чөлөөлсөн",
      }
    : {
        excused_at: null,
        excused_by: null,
        status_note: null,
      };

  const { error } = await supabase
    .from("exam_recipients")
    .update(updatePayload)
    .eq("exam_id", examId)
    .eq("student_id", studentId);

  if (error) return { error: error.message };

  revalidateExamParticipantPaths(examId);
  return { success: true };
}

export async function grantRecipientRetake(
  examId: string,
  studentId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Нэвтрээгүй байна" };

  const canManage = await canManageExam(supabase, examId, user.id);
  if (!canManage) return { error: "Энэ шалгалтын оролцогчийг удирдах эрх алга" };

  const [{ data: exam }, { data: sessions }] = await Promise.all([
    supabase
      .from("exams")
      .select("id, end_time, max_attempts")
      .eq("id", examId)
      .maybeSingle(),
    supabase
      .from("exam_sessions")
      .select("attempt_number")
      .eq("exam_id", examId)
      .eq("user_id", studentId)
      .order("attempt_number", { ascending: false }),
  ]);

  if (!exam) return { error: "Шалгалт олдсонгүй" };

  const now = new Date();
  const baseStart = new Date(exam.end_time);
  const retakeStart = now > baseStart ? now : baseStart;
  const retakeEnd = addHours(retakeStart, 24);
  const highestAttempt = sessions?.[0]?.attempt_number ?? 0;
  const nextAttemptLimit = Math.max(
    highestAttempt + 1,
    Number(exam.max_attempts ?? 1)
  );

  const { error } = await supabase
    .from("exam_recipients")
    .update({
      access_start_time: retakeStart.toISOString(),
      access_end_time: retakeEnd.toISOString(),
      max_attempts_override: nextAttemptLimit,
      excused_at: null,
      excused_by: null,
      status_note: "Нөхөн шалгалтын эрх олгосон",
    })
    .eq("exam_id", examId)
    .eq("student_id", studentId);

  if (error) return { error: error.message };

  revalidateExamParticipantPaths(examId);
  return { success: true };
}

export async function clearRecipientRetake(
  examId: string,
  studentId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Нэвтрээгүй байна" };

  const canManage = await canManageExam(supabase, examId, user.id);
  if (!canManage) return { error: "Энэ шалгалтын оролцогчийг удирдах эрх алга" };

  const { error } = await supabase
    .from("exam_recipients")
    .update({
      access_start_time: null,
      access_end_time: null,
      max_attempts_override: null,
      status_note: null,
    })
    .eq("exam_id", examId)
    .eq("student_id", studentId);

  if (error) return { error: error.message };

  revalidateExamParticipantPaths(examId);
  return { success: true };
}
