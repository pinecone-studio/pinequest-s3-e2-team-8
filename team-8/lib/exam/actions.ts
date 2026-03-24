"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createExam(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const duration_minutes = parseInt(formData.get("duration_minutes") as string);
  // datetime-local input өгөгдлийг UB цагаар хадгалах (+08:00)
  const start_time = (formData.get("start_time") as string) + "+08:00";
  const end_time = (formData.get("end_time") as string) + "+08:00";
  const passing_score = parseFloat(formData.get("passing_score") as string) || 60;
  const shuffle_questions = formData.get("shuffle_questions") === "on";

  if (!title || !start_time || !end_time || !duration_minutes) {
    return { error: "Бүх талбарыг бөглөнө үү" };
  }

  const { data, error } = await supabase
    .from("exams")
    .insert({
      title,
      description: description || null,
      created_by: user.id,
      start_time,
      end_time,
      duration_minutes,
      passing_score,
      shuffle_questions,
      is_published: false,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/educator");
  redirect(`/educator/exams/${data.id}/questions`);
}

export async function updateExam(examId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("exams")
    .update({
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      duration_minutes: parseInt(formData.get("duration_minutes") as string),
      start_time: (formData.get("start_time") as string) + "+08:00",
      end_time: (formData.get("end_time") as string) + "+08:00",
      passing_score: parseFloat(formData.get("passing_score") as string) || 60,
      shuffle_questions: formData.get("shuffle_questions") === "on",
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

  const { error } = await supabase
    .from("exams")
    .update({ is_published: true })
    .eq("id", examId)
    .eq("created_by", user.id);

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
    .select("*, questions(count)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getExamById(examId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("exams")
    .select("*, questions(*)")
    .eq("id", examId)
    .single();

  return data;
}
