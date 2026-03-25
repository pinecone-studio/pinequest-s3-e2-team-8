"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  proctorEventRateLimit,
  redis,
  startExamRateLimit,
  submitExamRateLimit,
} from "@/lib/redis";
import { attachPassagesToQuestions } from "@/lib/question-passages";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ProctorEventType =
  | "tab_hidden"
  | "window_blur"
  | "copy_attempt"
  | "paste_attempt"
  | "context_menu";
type ProctorEventMetadata = Record<
  string,
  string | number | boolean | null
>;

const STUDENT_EXAM_SELECT = `
  id,
  title,
  description,
  start_time,
  end_time,
  duration_minutes,
  is_published,
  shuffle_questions,
  max_attempts,
  passing_score,
  created_at
`;

function getQuestionCacheKey(examId: string) {
  return `exam:${examId}:questions`;
}

function getSessionAnswersCacheKey(sessionId: string, userId: string) {
  return `session:${sessionId}:user:${userId}:answers`;
}

function getSessionMetaCacheKey(sessionId: string, userId: string) {
  return `session:${sessionId}:user:${userId}:meta`;
}

function getStartSessionLockKey(examId: string, userId: string) {
  return `lock:exam-start:${examId}:user:${userId}`;
}

function getSubmitSessionLockKey(sessionId: string) {
  return `lock:exam-submit:${sessionId}`;
}

async function getInProgressSession(
  supabase: SupabaseServerClient,
  examId: string,
  userId: string
) {
  const { data } = await supabase
    .from("exam_sessions")
    .select("*")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

async function getSessionMeta(
  supabase: SupabaseServerClient,
  sessionId: string,
  userId: string
) {
  const cacheKey = getSessionMetaCacheKey(sessionId, userId);
  const cached = await redis.get(cacheKey);

  if (cached) {
    const parsed =
      typeof cached === "string"
        ? JSON.parse(cached)
        : cached;

    return parsed as { id: string; status: string };
  }

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (session) {
    await redis.set(cacheKey, JSON.stringify(session), { ex: 600 });
  }

  return session;
}

async function cacheSessionMeta(sessionId: string, userId: string, status: string) {
  await redis.set(
    getSessionMetaCacheKey(sessionId, userId),
    JSON.stringify({ id: sessionId, status }),
    { ex: 600 }
  );
}

async function getAssignedPublishedExamRows(
  supabase: SupabaseServerClient,
  userId: string,
  examId?: string
) {
  let query = supabase
    .from("exam_recipients")
    .select(
      `
      exam_id,
      exams!inner (${STUDENT_EXAM_SELECT})
    `
    )
    .eq("student_id", userId)
    .eq("exams.is_published", true);

  if (examId) {
    query = query.eq("exam_id", examId);
  }

  const { data } = await query;
  return data ?? [];
}

async function getAssignedPublishedExam(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string
) {
  const rows = await getAssignedPublishedExamRows(supabase, userId, examId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows[0] as any)?.exams ?? null;
}

function getPercentage(totalScore: number, maxScore: number) {
  return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
}

function normalizeTextAnswer(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function parseAnswerArray(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as string[];
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeTextAnswer(item)).filter(Boolean).sort()
      : [];
  } catch {
    return [];
  }
}

function areArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function parseMatchingPairs(options: unknown) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      const [left, right] = String(option).split("|||");
      if (!left || !right) return null;

      return {
        left,
        right: normalizeTextAnswer(right),
      };
    })
    .filter(
      (item): item is { left: string; right: string } => Boolean(item)
    );
}

/**
 * Оюутанд оноогдсон шалгалтуудыг авах
 * exam_recipients → exams
 */
export async function getStudentExams() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const rows = await getAssignedPublishedExamRows(supabase, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exams = rows.map((row: any) => row.exams).filter(Boolean);

  return Array.from(
    new Map(
      exams.map((exam) => [exam.id as string, exam])
    ).values()
  ).sort(
    (a, b) =>
      new Date(a.start_time as string).getTime() -
      new Date(b.start_time as string).getTime()
  );
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

  const exam = await getAssignedPublishedExam(supabase, user.id, examId);
  if (!exam) return null;

  // Redis cache шалгах
  const cacheKey = getQuestionCacheKey(examId);
  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed =
      typeof cached === "string"
        ? JSON.parse(cached)
        : cached;
    return parsed as {
      exam: Record<string, unknown>;
      questions: Record<string, unknown>[];
    };
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  const safeQuestions = (questions ?? []).map((question) => {
    const safeQuestion = { ...question };
    delete safeQuestion.correct_answer;
    return safeQuestion;
  });
  const passageAwareQuestions = await attachPassagesToQuestions(
    supabase,
    safeQuestions
  );
  const result = { exam, questions: passageAwareQuestions };

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

  const startLimit = await startExamRateLimit.limit(
    `start-exam:${user.id}:${examId}`
  );
  if (!startLimit.success) {
    return { error: "Хэт олон эхлүүлэх оролдлого илгээлээ. Түр хүлээгээд дахин оролдоно уу." };
  }

  const exam = await getAssignedPublishedExam(supabase, user.id, examId);
  if (!exam) return { error: "Энэ шалгалт танд оноогдоогүй байна" };

  const now = Date.now();
  const startTime = new Date(exam.start_time as string).getTime();
  const endTime = new Date(exam.end_time as string).getTime();

  if (now < startTime) {
    return { error: "Шалгалт хараахан эхлээгүй байна" };
  }

  if (now > endTime) {
    return { error: "Шалгалтын хугацаа дууссан байна" };
  }

  const existingInProgress = await getInProgressSession(
    supabase,
    examId,
    user.id
  );

  if (existingInProgress) {
    await cacheSessionMeta(existingInProgress.id, user.id, "in_progress");
    return { session: existingInProgress };
  }

  const lockKey = getStartSessionLockKey(examId, user.id);
  const lockAcquired = await redis.set(lockKey, "1", {
    ex: 15,
    nx: true,
  });

  if (!lockAcquired) {
    const lockedSession = await getInProgressSession(supabase, examId, user.id);
    if (lockedSession) {
      return { session: lockedSession };
    }

    return { error: "Шалгалтыг эхлүүлж байна. Дахин оролдоно уу." };
  }

  try {
    // Аль хэдийн session байгаа эсэх шалгах
    const { data: sessions } = await supabase
    .from("exam_sessions")
    .select("*")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .order("attempt_number", { ascending: false });

    const concurrentInProgress = sessions?.find(
      (session) => session.status === "in_progress"
    );

    if (concurrentInProgress) {
      await cacheSessionMeta(concurrentInProgress.id, user.id, "in_progress");
      return { session: concurrentInProgress };
    }

    // Сурагч өөр шалгалт өгч байгаа эсэх шалгах (нэг зэрэг хоёр шалгалт өгч болохгүй)
    const { data: otherActiveSession } = await supabase
      .from("exam_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .neq("exam_id", examId)
      .limit(1)
      .maybeSingle();

    if (otherActiveSession) {
      return { error: "Та одоо өөр шалгалт өгч байна. Эхлээд тэр шалгалтаа дуусгана уу." };
    }

    const nextAttemptNumber =
      (sessions?.[0]?.attempt_number ?? 0) + 1;
    const maxAttempts = Number(exam.max_attempts ?? 1);

    if (nextAttemptNumber > maxAttempts) {
      return { error: "Шалгалтын оролдлогын эрх дууссан байна" };
    }

    const { data: session, error } = await supabase
      .from("exam_sessions")
      .insert({
        exam_id: examId,
        user_id: user.id,
        status: "in_progress",
        attempt_number: nextAttemptNumber,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        const retrySession = await getInProgressSession(
          supabase,
          examId,
          user.id
        );

        if (retrySession) {
          await cacheSessionMeta(retrySession.id, user.id, "in_progress");
          return { session: retrySession };
        }
      }

      return { error: error.message };
    }

    await cacheSessionMeta(session.id, user.id, "in_progress");
    return { session };
  } finally {
    await redis.del(lockKey);
  }
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

  const session = await getSessionMeta(supabase, sessionId, user.id);

  if (!session) return { error: "Session олдсонгүй" };
  if (session.status !== "in_progress") {
    return { error: "Энэ шалгалтын session идэвхгүй байна" };
  }

  // Redis-д түр хадгалах (хурдан)
  const redisKey = getSessionAnswersCacheKey(sessionId, user.id);
  const existingAnswer = await redis.hget<string | null>(redisKey, questionId);
  if ((existingAnswer ?? "") === answer) {
    return { success: true, skipped: true };
  }

  await redis.hset(redisKey, { [questionId]: answer });
  await redis.expire(redisKey, 7200); // 2 цаг
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

  const submitLimit = await submitExamRateLimit.limit(
    `submit-exam:${user.id}:${sessionId}`
  );
  if (!submitLimit.success) {
    return { error: "Хэт олон илгээх оролдлого байна. Түр хүлээгээд дахин оролдоно уу." };
  }

  // Session авах
  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, exam_id, status, total_score, max_score")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { error: "Session олдсонгүй" };

  if (session.status !== "in_progress") {
    await cacheSessionMeta(sessionId, user.id, session.status);
    const totalScore = Number(session.total_score ?? 0);
    const maxScore = Number(session.max_score ?? 0);
    return {
      success: true,
      totalScore,
      maxScore,
      percentage: getPercentage(totalScore, maxScore),
    };
  }

  const lockKey = getSubmitSessionLockKey(sessionId);
  const lockAcquired = await redis.set(lockKey, "1", {
    ex: 30,
    nx: true,
  });

  if (!lockAcquired) {
    const { data: lockedSession } = await supabase
      .from("exam_sessions")
      .select("status, total_score, max_score")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lockedSession && lockedSession.status !== "in_progress") {
      await cacheSessionMeta(sessionId, user.id, lockedSession.status);
      const totalScore = Number(lockedSession.total_score ?? 0);
      const maxScore = Number(lockedSession.max_score ?? 0);
      return {
        success: true,
        totalScore,
        maxScore,
        percentage: getPercentage(totalScore, maxScore),
      };
    }

    return { error: "Шалгалтыг илгээж байна. Түр хүлээгээд дахин оролдоно уу." };
  }

  try {
    // Redis-д хадгалсан хариултуудыг DB руу flush хийх
    const redisKey = getSessionAnswersCacheKey(sessionId, user.id);
    const redisAnswers = await redis.hgetall(redisKey);
    if (redisAnswers && Object.keys(redisAnswers).length > 0) {
      const rows = Object.entries(redisAnswers).map(([questionId, answer]) => ({
        session_id: sessionId,
        question_id: questionId,
        user_id: user.id,
        answer: String(answer),
      }));

      const { error: flushError } = await supabase.from("answers").upsert(rows, {
        onConflict: "session_id,question_id",
      });

      if (flushError) return { error: flushError.message };
    }

    const [{ data: answers }, { data: questions }] = await Promise.all([
      supabase
        .from("answers")
        .select("id, answer, score, questions(type, correct_answer, points, options)")
        .eq("session_id", sessionId),
      supabase
        .from("questions")
        .select("id, type, points")
        .eq("exam_id", session.exam_id),
    ]);

    let totalScore = 0;
    const maxScore = (questions ?? []).reduce(
      (sum, question) => sum + Number(question.points ?? 0),
      0
    );

    for (const ans of answers ?? []) {
      const question = Array.isArray(ans.questions)
        ? ans.questions[0]
        : ans.questions;
      if (!question) continue;

      if (
        question.type === "multiple_choice" ||
        question.type === "fill_blank"
      ) {
        const isCorrect =
          normalizeTextAnswer(ans.answer) ===
          normalizeTextAnswer(question.correct_answer);
        const score = isCorrect ? Number(question.points ?? 0) : 0;
        totalScore += score;

        await supabase
          .from("answers")
          .update({
            is_correct: isCorrect,
            score,
          })
          .eq("id", ans.id);
      } else if (question.type === "multiple_response") {
        const isCorrect = areArraysEqual(
          parseAnswerArray(ans.answer),
          parseAnswerArray(question.correct_answer)
        );
        const score = isCorrect ? Number(question.points ?? 0) : 0;
        totalScore += score;

        await supabase
          .from("answers")
          .update({
            is_correct: isCorrect,
            score,
          })
          .eq("id", ans.id);
      } else if (question.type === "matching") {
        let submittedAnswer: Record<string, string> = {};

        try {
          submittedAnswer = JSON.parse(String(ans.answer ?? "{}")) as Record<
            string,
            string
          >;
        } catch {
          submittedAnswer = {};
        }

        const expectedPairs = parseMatchingPairs(question.options);
        const isCorrect =
          expectedPairs.length > 0 &&
          expectedPairs.every(
            (pair) =>
              normalizeTextAnswer(submittedAnswer[pair.left]) === pair.right
          );
        const score = isCorrect ? Number(question.points ?? 0) : 0;
        totalScore += score;

        await supabase
          .from("answers")
          .update({
            is_correct: isCorrect,
            score,
          })
          .eq("id", ans.id);
      } else {
        totalScore += Number(ans.score ?? 0);
      }
    }

    // Essay асуулт байхгүй бол автоматаар "graded" болгоно
    const hasEssayQuestions = (questions ?? []).some((q) => q.type === "essay");
    const finalStatus = hasEssayQuestions ? "submitted" : "graded";

    await supabase
      .from("exam_sessions")
      .update({
        status: finalStatus,
        submitted_at: new Date().toISOString(),
        total_score: totalScore,
        max_score: maxScore,
      })
      .eq("id", sessionId)
      .eq("status", "in_progress");

    await redis.del(redisKey);
    await cacheSessionMeta(sessionId, user.id, finalStatus);

    revalidatePath("/student");
    revalidatePath("/student/exams");

    return {
      success: true,
      totalScore,
      maxScore,
      percentage: getPercentage(totalScore, maxScore),
    };
  } finally {
    await redis.del(lockKey);
  }
}

/**
 * Шалгалтын үеийн suspicious event-үүдийг логлох
 * Миграци apply хийгдээгүй үед зөөлөн алгасана.
 */
export async function logProctorEvent(
  sessionId: string,
  eventType: ProctorEventType,
  metadata: ProctorEventMetadata = {}
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const limitResult = await proctorEventRateLimit.limit(
    `proctor:${user.id}:${sessionId}:${eventType}`
  );
  if (!limitResult.success) {
    return { success: true, skipped: true };
  }

  const session = await getSessionMeta(supabase, sessionId, user.id);

  if (!session) return { error: "Session олдсонгүй" };

  if (session.status !== "in_progress") {
    return { success: true, skipped: true };
  }

  const { error } = await supabase.from("proctor_events").insert({
    session_id: sessionId,
    user_id: user.id,
    event_type: eventType,
    metadata,
  });

  if (error) {
    if (error.code === "42P01") {
      return { success: true, skipped: true };
    }

    return { error: error.message };
  }

  return { success: true };
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

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("*, exams(title, passing_score)")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .in("status", ["submitted", "graded"])
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return null;

  // Per-question breakdown: хариулт + асуулт мэдээлэл
  const { data: answers } = await supabase
    .from("answers")
    .select(
      "id, answer, score, is_correct, feedback, questions(id, type, content, correct_answer, points, order_index, explanation)"
    )
    .eq("session_id", session.id)
    .order("questions(order_index)", { ascending: true });

  return { ...session, answers: answers ?? [] };
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
  const redisKey = getSessionAnswersCacheKey(sessionId, user.id);
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
