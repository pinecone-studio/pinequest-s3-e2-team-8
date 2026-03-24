"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getPendingSubmissions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: myExamIds } = await supabase
    .from("exams")
    .select("id")
    .eq("created_by", user.id);

  if (!myExamIds || myExamIds.length === 0) return [];

  const { data } = await supabase
    .from("exam_sessions")
    .select("*, exams(title), profiles(full_name, email)")
    .in(
      "exam_id",
      myExamIds.map((e) => e.id)
    )
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  return data ?? [];
}

export async function getSessionForGrading(sessionId: string) {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("*, exams(title), profiles(full_name, email)")
    .eq("id", sessionId)
    .single();

  if (!session) return null;

  const { data: answers } = await supabase
    .from("answers")
    .select("*, questions(content, type, correct_answer, points, options)")
    .eq("session_id", sessionId)
    .order("questions(order_index)", { ascending: true });

  return { session, answers: answers ?? [] };
}

export async function gradeAnswer(
  answerId: string,
  score: number,
  feedback: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("answers")
    .update({
      score,
      is_correct: score > 0,
      feedback,
      graded_by: user.id,
      graded_at: new Date().toISOString(),
    })
    .eq("id", answerId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function finalizeGrading(sessionId: string) {
  const supabase = await createClient();

  // Бүх хариултын нийт оноог тооцоол
  const { data: answers } = await supabase
    .from("answers")
    .select("score, questions(points)")
    .eq("session_id", sessionId);

  let totalScore = 0;
  let maxScore = 0;
  for (const a of answers ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (a as any).questions;
    maxScore += q?.points ?? 0;
    totalScore += a.score ?? 0;
  }

  const { error } = await supabase
    .from("exam_sessions")
    .update({
      status: "graded",
      total_score: totalScore,
      max_score: maxScore,
    })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  revalidatePath("/educator/grading");
  return { success: true, totalScore, maxScore };
}
