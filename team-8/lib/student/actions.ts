"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  proctorEventRateLimit,
  redis,
  startExamRateLimit,
  submitExamRateLimit,
} from "@/lib/redis";
import {
  getSnapshotQuestionMap,
  getStoredPublishedExamSnapshot,
} from "@/lib/exam-snapshot";
import {
  deriveStudentExamLifecycle,
  getEffectiveExamAccess,
  type RecipientAccessOverride,
} from "@/lib/exam-session-lifecycle";
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
  subject_id,
  start_time,
  end_time,
  duration_minutes,
  is_published,
  shuffle_questions,
  shuffle_options,
  max_attempts,
  passing_score,
  created_at
`;

type StudentExamBase = {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  max_attempts: number;
  passing_score: number | null;
  created_at: string;
};

type AssignedExamRow = {
  exam_id: string;
  access_start_time: string | null;
  access_end_time: string | null;
  max_attempts_override: number | null;
  excused_at: string | null;
  status_note: string | null;
  exams?: Record<string, unknown> | Record<string, unknown>[] | null;
};

type StudentExamAttemptSummary = {
  status: string | null;
  attemptNumber: number;
};

type StudentExamRecord = Record<string, unknown>;

export type StudentAssignedExam = StudentExamBase & {
  mySessionStatus: string | null;
  myLifecycleStatus: string;
  myLifecycleLabel: string;
  hasRetakeOverride: boolean;
  isExcused: boolean;
  status_note: string | null;
};

function getQuestionCacheKey(examId: string) {
  return `exam:${examId}:questions`;
}

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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
      access_start_time,
      access_end_time,
      max_attempts_override,
      excused_at,
      status_note,
      exams!inner (${STUDENT_EXAM_SELECT})
    `
    )
    .eq("student_id", userId)
    .eq("exams.is_published", true);

  if (examId) {
    query = query.eq("exam_id", examId);
  }

  const { data } = await query;
  return ((data ?? []) as unknown) as AssignedExamRow[];
}

function mergeAssignedExamAccess(
  row: AssignedExamRow,
  latestSession: StudentExamAttemptSummary | null = null
) : StudentAssignedExam | null {
  const exam = getRelationObject(row.exams);
  if (!exam) return null;
  const examRecord = exam as StudentExamBase;

  const examAccess = getEffectiveExamAccess(
    {
      start_time: String(examRecord.start_time),
      end_time: String(examRecord.end_time),
      max_attempts: Number(examRecord.max_attempts ?? 1),
    },
    row as RecipientAccessOverride
  );
  const lifecycle = deriveStudentExamLifecycle({
    exam: {
      start_time: String(examRecord.start_time),
      end_time: String(examRecord.end_time),
      max_attempts: Number(examRecord.max_attempts ?? 1),
    },
    recipient: row,
    latestSessionStatus: latestSession?.status ?? null,
    latestAttemptNumber: latestSession?.attemptNumber ?? 0,
  });

  return {
    ...examRecord,
    start_time: examAccess.effectiveStartTime,
    end_time: examAccess.effectiveEndTime,
    max_attempts: examAccess.effectiveMaxAttempts,
    mySessionStatus: latestSession?.status ?? null,
    myLifecycleStatus: lifecycle.key,
    myLifecycleLabel: lifecycle.label,
    hasRetakeOverride: examAccess.hasRetakeOverride,
    isExcused: examAccess.isExcused,
    status_note: row.status_note ?? null,
  };
}

async function getAssignedPublishedExamRecord(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string
) {
  const rows = await getAssignedPublishedExamRows(supabase, userId, examId);
  const row = rows[0] ?? null;
  if (!getRelationObject(row?.exams)) return null;

  return {
    row,
    exam: mergeAssignedExamAccess(row),
  };
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

function getStudentSafeQuestions<
  T extends { correct_answer?: unknown; passage_id?: string | null }
>(
  questions: T[]
) {
  return questions.map((question) => {
    const safeQuestion = { ...question } as T & {
      options?: unknown;
      type?: unknown;
      explanation?: unknown;
      matching_prompts?: string[];
      matching_choices?: string[];
    };
    delete safeQuestion.correct_answer;
    delete safeQuestion.explanation;

    if (safeQuestion.type === "matching") {
      const matchingPairs = parseMatchingPairs(safeQuestion.options);
      safeQuestion.matching_prompts = matchingPairs.map((pair) => pair.left);
      safeQuestion.matching_choices = matchingPairs.map((pair) => pair.right);
    }

    return safeQuestion;
  });
}

/**
 * Оюутанд оноогдсон шалгалтуудыг авах
 * exam_recipients → exams + хамгийн сүүлийн session status
 */
export async function getStudentExams() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const rows = await getAssignedPublishedExamRows(supabase, user.id);
  const rawExams = rows
    .map((row) => getRelationObject(row.exams))
    .filter((exam): exam is StudentExamRecord => Boolean(exam));

  const uniqueExams = Array.from(
    new Map(rawExams.map((exam) => [String(exam.id), exam])).values()
  );

  if (uniqueExams.length === 0) return [];

  // Хамгийн сүүлийн session status-г нэмэх
  const { data: sessions } = await supabase
    .from("exam_sessions")
    .select("exam_id, status, attempt_number")
    .eq("user_id", user.id)
    .in("exam_id", uniqueExams.map((e) => e.id as string))
    .order("attempt_number", { ascending: false });

  const sessionMap = new Map<string, StudentExamAttemptSummary>();
  for (const s of sessions ?? []) {
    if (!sessionMap.has(s.exam_id as string)) {
      sessionMap.set(s.exam_id as string, {
        status: s.status as string,
        attemptNumber: Number(s.attempt_number ?? 0),
      });
    }
  }

  const rowMap = new Map(rows.map((row) => [row.exam_id, row]));

  return uniqueExams
    .map((exam) =>
      mergeAssignedExamAccess(
        rowMap.get(String(exam.id)) as AssignedExamRow,
        sessionMap.get(String(exam.id)) ?? null
      )
    )
    .filter(
      (
        exam
      ): exam is NonNullable<ReturnType<typeof mergeAssignedExamAccess>> =>
        Boolean(exam)
    )
    .sort(
      (left, right) =>
        new Date(String(left.start_time)).getTime() -
        new Date(String(right.start_time)).getTime()
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

  const assignedExam = await getAssignedPublishedExamRecord(
    supabase,
    user.id,
    examId
  );
  if (!assignedExam?.exam) return null;
  const exam = assignedExam.exam;

  if (assignedExam.row.excused_at) return null;

  // Redis cache шалгах
  const cacheKey = getQuestionCacheKey(examId);
  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed =
      typeof cached === "string"
        ? JSON.parse(cached)
        : cached;
    return {
      exam: {
        ...((parsed as { examBase?: Record<string, unknown> }).examBase ?? {}),
        ...exam,
      },
      questions: (parsed as { questions?: Record<string, unknown>[] })
        .questions ?? [],
    };
  }

  const snapshot = await getStoredPublishedExamSnapshot(supabase, examId);
  if (snapshot) {
    const result = {
      exam: {
        ...exam,
        ...snapshot.exam,
      },
      questions: getStudentSafeQuestions(snapshot.questions),
    };
    const cachePayload = {
      examBase: snapshot.exam,
      questions: result.questions,
    };

    const endTime = new Date(exam.end_time).getTime();
    const now = Date.now();
    const ttlSeconds = Math.max(Math.floor((endTime - now) / 1000), 60);
    await redis.set(cacheKey, JSON.stringify(cachePayload), { ex: ttlSeconds });
    return result;
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  const safeQuestions = getStudentSafeQuestions(
    (questions ?? []) as Array<
      Record<string, unknown> & { passage_id?: string | null }
    >
  );
  const passageAwareQuestions = await attachPassagesToQuestions(
    supabase,
    safeQuestions
  );
  const result = { exam, questions: passageAwareQuestions };
  const cachePayload = {
    examBase: getRelationObject(assignedExam.row.exams) ?? exam,
    questions: passageAwareQuestions,
  };

  // Redis-д cache хийх (шалгалтын хугацаа дуустал)
  const endTime = new Date(exam.end_time).getTime();
  const now = Date.now();
  const ttlSeconds = Math.max(Math.floor((endTime - now) / 1000), 60);
  await redis.set(cacheKey, JSON.stringify(cachePayload), { ex: ttlSeconds });

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

  const assignedExam = await getAssignedPublishedExamRecord(
    supabase,
    user.id,
    examId
  );
  if (!assignedExam?.exam) return { error: "Энэ шалгалт танд оноогдоогүй байна" };
  if (assignedExam.row.excused_at) {
    return { error: "Та энэ шалгалтаас чөлөөлөгдсөн байна" };
  }
  const exam = assignedExam.exam;

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
      return { error: "Шалгалтын оролдлогын эрх дууссан байна", redirectToResult: true };
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

  if (answer === "") {
    if (existingAnswer == null) {
      return { success: true, skipped: true };
    }

    await redis.hdel(redisKey, questionId);
    await redis.expire(redisKey, 7200);
    return { success: true };
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
    .maybeSingle();

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

    const snapshot = await getStoredPublishedExamSnapshot(
      supabase,
      session.exam_id
    );
    const snapshotQuestionMap = getSnapshotQuestionMap(snapshot);

    const [{ data: answers }, { data: questions }] = await Promise.all([
      supabase
        .from("answers")
        .select("id, question_id, answer, score")
        .eq("session_id", sessionId),
      snapshot
        ? Promise.resolve({
            data: snapshot.questions.map((question) => ({
              id: question.id,
              type: question.type,
              points: question.points,
              correct_answer: question.correct_answer,
              options: question.options,
            })),
          })
        : supabase
            .from("questions")
            .select("id, type, points, correct_answer, options")
            .eq("exam_id", session.exam_id),
    ]);

    let totalScore = 0;
    const maxScore = snapshot?.stats.total_points ?? (questions ?? []).reduce(
      (sum, question) => sum + Number(question.points ?? 0),
      0
    );

    for (const ans of answers ?? []) {
      const question =
        snapshotQuestionMap.get(ans.question_id) ??
        (questions ?? []).find((item) => item.id === ans.question_id);
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
    const hasEssayQuestions = snapshot?.stats.has_essay_questions ?? (questions ?? []).some((q) => q.type === "essay");
    const finalStatus = hasEssayQuestions ? "submitted" : "graded";

    const { error: updateError } = await supabase
      .from("exam_sessions")
      .update({
        status: finalStatus,
        submitted_at: new Date().toISOString(),
        total_score: totalScore,
        max_score: maxScore,
      })
      .eq("id", sessionId)
      .eq("status", "in_progress");

    if (updateError) return { error: updateError.message };

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

  const snapshot = await getStoredPublishedExamSnapshot(supabase, examId);
  const snapshotQuestionMap = getSnapshotQuestionMap(snapshot);

  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, status, total_score, max_score, submitted_at, attempt_number, exam_id, exams(title, passing_score)")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .in("status", ["submitted", "graded"])
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    console.error("[getExamResult] session query error:", sessionError.message);
    return null;
  }

  if (!session) return null;

  // Per-question breakdown: хариулт + асуулт мэдээлэл
  const { data: answers } = await supabase
    .from("answers")
    .select(
      "id, question_id, answer, score, is_correct, feedback, questions(id, type, content, content_html, image_url, options, correct_answer, points, order_index, explanation)"
    )
    .eq("session_id", session.id)
    .order("questions(order_index)", { ascending: true });

  const snapshotAwareAnswers = (answers ?? []).map((answer) => {
    const snapshotQuestion = snapshotQuestionMap.get(String(answer.question_id));
    if (!snapshotQuestion) return answer;

    return {
      ...answer,
      questions: snapshotQuestion,
    };
  });

  return { ...session, answers: snapshotAwareAnswers };
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
