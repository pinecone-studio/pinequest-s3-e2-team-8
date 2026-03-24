"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncExamRecipients } from "@/lib/exam-recipients";

export async function createExam(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const duration_minutes = parseInt(formData.get("duration_minutes") as string);
  const subject_id = ((formData.get("subject_id") as string) || "").trim() || null;
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

  revalidatePath("/educator");
  redirect(`/educator/exams/${data.id}/questions`);
}

export async function updateExam(examId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: existingExam } = await supabase
    .from("exams")
    .select("id, is_published")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!existingExam) return { error: "Шалгалт олдсонгүй" };
  if (existingExam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтыг өөрчлөх боломжгүй" };
  }

  const start_time = (formData.get("start_time") as string) + "+08:00";
  const end_time = (formData.get("end_time") as string) + "+08:00";

  if (new Date(start_time).getTime() >= new Date(end_time).getTime()) {
    return { error: "Дуусах цаг нь эхлэх цагаасаа хойш байх ёстой" };
  }

  const { error } = await supabase
    .from("exams")
    .update({
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      subject_id: ((formData.get("subject_id") as string) || "").trim() || null,
      duration_minutes: parseInt(formData.get("duration_minutes") as string),
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

  const { count: questionCount } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  if (!questionCount || questionCount <= 0) {
    return { error: "Нийтлэхийн өмнө дор хаяж 1 асуулт нэмнэ үү" };
  }

  const syncResult = await syncExamRecipients(supabase, examId, user.id);
  if (!syncResult.success) {
    return { error: syncResult.error };
  }

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
    .select("*, subjects(name), questions(count)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
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
