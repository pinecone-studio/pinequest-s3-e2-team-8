"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addQuestion(examId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const type = formData.get("type") as string;
  const content = formData.get("content") as string;
  const points = parseFloat(formData.get("points") as string) || 1;
  const correct_answer = (formData.get("correct_answer") as string) || null;
  const explanation = (formData.get("explanation") as string) || null;

  // Parse options for multiple choice
  let options = null;
  if (type === "multiple_choice") {
    const optionsRaw = formData.get("options") as string;
    try {
      options = JSON.parse(optionsRaw);
    } catch {
      options = null;
    }
  } else if (type === "true_false") {
    options = ["Үнэн", "Худал"];
  }

  // Get current max order_index for this exam
  const { data: existing } = await supabase
    .from("questions")
    .select("order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: false })
    .limit(1);

  const order_index = existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

  const { error } = await supabase.from("questions").insert({
    exam_id: examId,
    type,
    content,
    content_type: "text",
    options,
    correct_answer,
    points,
    order_index,
    explanation,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true };
}

export async function deleteQuestion(questionId: string, examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true };
}

export async function getQuestionsByExam(examId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  return data ?? [];
}

export async function getQuestionBank() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("questions")
    .select("*, exams(title)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}
