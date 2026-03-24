"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redis } from "@/lib/redis";

/**
 * Оюутанд оноогдсон шалгалтуудыг авах
 * exam_assignments → student_group_members → exams
 */
export async function getStudentExams() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("exam_assignments")
    .select(
      `
      exam_id,
      exams!inner (
        id, title, description, start_time, end_time,
        duration_minutes, is_published, shuffle_questions,
        passing_score, created_at
      ),
      student_groups!inner (
        name,
        student_group_members!inner (student_id)
      )
    `
    )
    .eq("student_groups.student_group_members.student_id", user.id)
    .eq("exams.is_published", true);

  if (!data || data.length === 0) {
    // Fallback: бүх published шалгалтуудыг харуулах (бүлэг оноогоогүй бол)
    const { data: allExams } = await supabase
      .from("exams")
      .select("*")
      .eq("is_published", true)
      .order("start_time", { ascending: true });
    return allExams ?? [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((d: any) => d.exams);
}

/**
 * Шалгалтын мэдээлэл + асуултуудыг авах (Redis cache-тэй)
 */
export async function getExamForStudent(examId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Redis cache шалгах
  const cacheKey = `exam:${examId}:questions`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return cached as {
      exam: Record<string, unknown>;
      questions: Record<string, unknown>[];
    };
  }

  // DB-ээс авах
  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .eq("is_published", true)
    .single();

  if (!exam) return null;

  const { data: questions } = await supabase
    .from("questions")
    .select("id, type, content, image_url, options, points, order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  // correct_answer-г оюутанд ХАРУУЛАХГҮЙ!
  const result = { exam, questions: questions ?? [] };

  // Redis-д cache хийх (шалгалтын хугацаа дуустал)
  const endTime = new Date(exam.end_time).getTime();
  const now = Date.now();
  const ttlSeconds = Math.max(Math.floor((endTime - now) / 1000), 60);
  await redis.set(cacheKey, JSON.stringify(result), { ex: ttlSeconds });

  return result;
}

/**
 * Шалгалт эхлэх — exam_session үүсгэх
 */
export async function startExamSession(examId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  // Аль хэдийн session байгаа эсэх шалгах
  const { data: existing } = await supabase
    .from("exam_sessions")
    .select("*")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .in("status", ["in_progress"])
    .maybeSingle();

  if (existing) {
    return { session: existing };
  }

  // Шинэ session үүсгэх
  const { data: session, error } = await supabase
    .from("exam_sessions")
    .insert({
      exam_id: examId,
      user_id: user.id,
      status: "in_progress",
      attempt_number: 1,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  return { session };
}

/**
 * Хариулт хадгалах — Redis-д түр хадгалж, дараа нь DB руу batch
 */
export async function saveAnswer(
  sessionId: string,
  questionId: string,
  answer: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  // Redis-д түр хадгалах (хурдан)
  const redisKey = `session:${sessionId}:answers`;
  await redis.hset(redisKey, { [questionId]: answer });
  await redis.expire(redisKey, 7200); // 2 цаг

  // DB руу бас бичих (upsert)
  const { error } = await supabase.from("answers").upsert(
    {
      session_id: sessionId,
      question_id: questionId,
      user_id: user.id,
      answer,
    },
    { onConflict: "session_id,question_id" }
  );

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Шалгалт дуусгах — Auto-grade + submit
 */
export async function submitExam(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  // Session авах
  const { data: session } = await supabase
    .from("exam_sessions")
    .select("*, exams(id)")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { error: "Session олдсонгүй" };

  // Redis-д хадгалсан хариултуудыг DB руу flush хийх
  const redisKey = `session:${sessionId}:answers`;
  const redisAnswers = await redis.hgetall(redisKey);
  if (redisAnswers && Object.keys(redisAnswers).length > 0) {
    for (const [questionId, answer] of Object.entries(redisAnswers)) {
      await supabase.from("answers").upsert(
        {
          session_id: sessionId,
          question_id: questionId,
          user_id: user.id,
          answer: answer as string,
        },
        { onConflict: "session_id,question_id" }
      );
    }
  }

  // Бүх хариултуудыг авах
  const { data: answers } = await supabase
    .from("answers")
    .select("*, questions(*)")
    .eq("session_id", sessionId);

  let totalScore = 0;
  let maxScore = 0;

  // Auto-grade: multiple_choice, true_false
  for (const ans of answers ?? []) {
    const question = ans.questions;
    if (!question) continue;

    maxScore += question.points;

    if (question.type === "multiple_choice" || question.type === "true_false") {
      const isCorrect =
        ans.answer?.trim().toLowerCase() ===
        question.correct_answer?.trim().toLowerCase();
      const score = isCorrect ? question.points : 0;
      totalScore += score;

      await supabase
        .from("answers")
        .update({
          is_correct: isCorrect,
          score,
        })
        .eq("id", ans.id);
    }
    // essay, fill_blank — багш гараар шалгана
  }

  // Session-г submitted болгох
  await supabase
    .from("exam_sessions")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      total_score: totalScore,
      max_score: maxScore,
    })
    .eq("id", sessionId);

  // Redis cache цэвэрлэх
  await redis.del(redisKey);

  revalidatePath("/student");
  revalidatePath("/student/exams");

  return {
    success: true,
    totalScore,
    maxScore,
    percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
  };
}

/**
 * Шалгалтын үр дүнг DB-ээс авах (URL param биш)
 */
export async function getExamResult(examId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("exam_sessions")
    .select("*, exams(title, passing_score)")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .in("status", ["submitted", "graded"])
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Оюутны шалгалтын үр дүн авах
 */
export async function getStudentResults() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("exam_sessions")
    .select("*, exams(title, passing_score)")
    .eq("user_id", user.id)
    .in("status", ["submitted", "graded"])
    .order("submitted_at", { ascending: false });

  return data ?? [];
}

/**
 * Session-д хадгалсан хариултуудыг авах (resume хийхэд)
 */
export async function getSessionAnswers(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  // Эхлээд Redis-ээс шалгах
  const redisKey = `session:${sessionId}:answers`;
  const redisAnswers = await redis.hgetall(redisKey);
  if (redisAnswers && Object.keys(redisAnswers).length > 0) {
    return redisAnswers as Record<string, string>;
  }

  // Redis-д байхгүй бол DB-ээс
  const { data: answers } = await supabase
    .from("answers")
    .select("question_id, answer")
    .eq("session_id", sessionId)
    .eq("user_id", user.id);

  const result: Record<string, string> = {};
  for (const a of answers ?? []) {
    if (a.answer) result[a.question_id] = a.answer;
  }
  return result;
}
