"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  examBurstRateLimit,
  examSubmitBurstRateLimit,
  proctorEventRateLimit,
  redis,
  startExamRateLimit,
  submitExamRateLimit,
} from "@/lib/redis";
import {
  getProctorEventDedupeKey,
  getSessionAnswerMetaCacheKey,
  getSessionAnswersCacheKey,
  getSessionHeartbeatCacheKey,
  getSessionMetaCacheKey,
  writeExamDraftDeltaToRedis,
} from "@/lib/exam-runtime-cache";
import {
  getSnapshotQuestionMap,
  getStoredPublishedExamSnapshot,
} from "@/lib/exam-snapshot";
import {
  applyStoredVariantToQuestion,
  ensureSessionVariantsForSession,
  getSessionQuestionVariantMap,
  isQuestionVariantSchemaMissing,
  type StoredQuestionVariant,
} from "@/lib/question-variants";
import {
  getSessionDeadlineMs,
} from "@/lib/exam-session-lifecycle";
import { getExamManagementScope } from "@/lib/exam-scope";
import {
  isFinalizedAttemptStatus,
  pickBestAttempt,
  pickLatestAttempt,
} from "@/lib/exam-attempt-utils";
import { enqueueStudentTopicMasteryRefresh } from "@/lib/student-learning/actions";
import { gradeEssayWithAIResult } from "@/lib/ai/essay-grading";
import {
  notifyTeachersOfActionRequiredSubmission,
  notifyTeachersOfEssayReviewRequest,
} from "@/lib/notification/actions";
import {
  publishExamProcessingJob,
} from "@/lib/aws/sqs";
import type {
  ActionRequiredReason,
  ExamProcessingJob,
} from "@/lib/aws/jobs";
import {
  createStudentRuntimeToken,
  verifyStudentRuntimeToken,
} from "@/lib/student-runtime-token";
import {
  getAssignedPublishedExamRecord,
  getEffectiveExamAccessForStudent,
  loadStudentExamAccessContext,
  normalizeProctoringSettings,
  toStudentAttemptSummary,
  canAttemptExamAgain,
  type AssignedExamRow,
  type StudentAssignedExam,
  type StudentExamAttemptSummary,
} from "@/lib/student-exam-access";
import { attachPassagesToQuestions } from "@/lib/question-passages";
import {
  deriveRiskLevel,
  getEffectiveDevicePolicy,
  getProctorEventPolicy,
  type AnswerChangeAnalytics,
  type ProctorDisplayMode,
  type ProctorEventType,
  type ProctorFlagStatus,
  type ProctoringMode,
  type StudentDeviceType,
  shouldAutoFlag,
} from "@/lib/proctoring";
import type {
  AiQuestionVariantMode,
  AnswerReviewStatus,
  AnswerScoreSource,
  QuestionType,
} from "@/types";
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type SupabaseActionClient = Pick<SupabaseServerClient, "from" | "rpc">;
type ProctorEventMetadata = Record<
  string,
  string | number | boolean | null
>;

type StudentQuestionPassage = {
  id: string;
  title: string | null;
  content: string;
  content_html: string | null;
  image_url: string | null;
};

export type StudentSafeQuestion = {
  id: string;
  type: string;
  passage_id?: string | null;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  matching_prompts?: string[];
  matching_choices?: string[];
  ai_variant_enabled?: boolean;
  ai_variant_mode?: AiQuestionVariantMode;
  points: number;
  order_index: number;
  question_passages?: StudentQuestionPassage | null;
};

type PrepareExamTakePayloadResult =
  | { error: string }
  | { redirectTo: string }
  | {
      exam: StudentAssignedExam & Record<string, unknown>;
      questions: StudentSafeQuestion[];
      sessionId: string | null;
      runtimeToken: string | null;
      savedAnswers: Record<string, string>;
      answerAnalytics: Record<string, AnswerChangeAnalytics>;
      initialTimeLeftSeconds: number | null;
      sessionAlreadyStarted: boolean;
    };

type ExamStartGatePayloadResult =
  | { error: string }
  | { redirectTo: string }
  | {
      exam: StudentAssignedExam & Record<string, unknown>;
    };

type StartExamAttemptResult =
  | { error: string }
  | { redirectTo: string }
  | {
      sessionId: string;
      startedAt: string;
      initialTimeLeftSeconds: number | null;
    };

export type { StudentAssignedExam } from "@/lib/student-exam-access";

type StartExamReadinessPayload = {
  isDesktop: boolean;
  deviceType: StudentDeviceType;
  displayMode: ProctorDisplayMode;
  orientation: "portrait" | "landscape";
  isStandalonePwa: boolean;
  platform: string;
  fullscreenReady: boolean;
  cameraReady: boolean;
  identityVerified: boolean;
  brightnessScore: number | null;
  identityHash: string | null;
};

function getQuestionCacheKey(examId: string) {
  return `exam:${examId}:questions`;
}

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getExamAccessCacheKey(examId: string, userId: string) {
  return `exam-access:${examId}:user:${userId}`;
}

function shouldLogStudentPerf(durationMs: number, thresholdMs: number) {
  return (
    process.env.ENABLE_STUDENT_PERF_LOGS === "1" || durationMs >= thresholdMs
  );
}

function logStudentPerf(
  label: string,
  startedAtMs: number,
  thresholdMs: number,
  metadata: Record<string, unknown> = {},
) {
  const durationMs = Date.now() - startedAtMs;
  if (!shouldLogStudentPerf(durationMs, thresholdMs)) {
    return durationMs;
  }

  console.info(`[student-perf] ${label}`, {
    durationMs,
    ...metadata,
  });
  return durationMs;
}

async function resolveExamAccessWithCache(
  supabase: SupabaseServerClient,
  examId: string,
  userId: string
): Promise<{ assignedRow: AssignedExamRow; assignedExamRecord: StudentAssignedExam } | null> {
  try {
    const cached = await redis.get(getExamAccessCacheKey(examId, userId));
    if (cached) {
      const parsed = (typeof cached === "string" ? JSON.parse(cached) : cached) as {
        assignedRow: AssignedExamRow;
        exam: StudentAssignedExam;
      };
      if (parsed?.assignedRow && parsed?.exam) {
        return { assignedRow: parsed.assignedRow, assignedExamRecord: parsed.exam };
      }
    }
  } catch {}

  const accessContext = await loadStudentExamAccessContext(supabase, userId, {
    examId,
    includeLatestSessions: false,
  });
  const assignedRow = accessContext.rowMap.get(examId);
  const assignedExamRecord = accessContext.accessMap.get(examId);
  if (!assignedRow || !assignedExamRecord) return null;
  return { assignedRow, assignedExamRecord };
}

function getStartSessionLockKey(examId: string, userId: string) {
  return `lock:exam-start:${examId}:user:${userId}`;
}

function getSubmitSessionLockKey(sessionId: string, userId: string) {
  return `lock:exam-submit:${sessionId}:user:${userId}`;
}

function getExamPayloadCacheTtlSeconds(
  exam: Pick<StudentAssignedExam, "end_time" | "duration_minutes">
) {
  const closeTimeMs = new Date(exam.end_time).getTime();
  const durationMs = Number(exam.duration_minutes ?? 0) * 60 * 1000;
  const latestUsefulTimeMs =
    Number.isNaN(closeTimeMs) || !Number.isFinite(durationMs) || durationMs <= 0
      ? closeTimeMs
      : closeTimeMs + durationMs;
  const ttlSeconds = Math.max(
    Math.floor((latestUsefulTimeMs - Date.now()) / 1000),
    60
  );

  return ttlSeconds;
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

async function getOwnedSessionById(
  supabase: SupabaseServerClient,
  sessionId: string,
  examId: string,
  userId: string
) {
  const { data } = await supabase
    .from("exam_sessions")
    .select("id, started_at, status")
    .eq("id", sessionId)
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .maybeSingle();

  return data;
}

async function getSessionMeta(
  supabase: SupabaseActionClient,
  sessionId: string,
  userId: string
) {
  type CachedSessionMeta = {
    id: string;
    status: string;
    exam_id: string | null;
    proctoring_mode: ProctoringMode | null;
  };
  const cacheKey = getSessionMetaCacheKey(sessionId, userId);
  const cached = await redis.get(cacheKey);

  if (cached) {
    let parsed: unknown = cached;

    if (typeof cached === "string") {
      try {
        parsed = JSON.parse(cached);
      } catch {
        // Backward compatibility for older cache entries that stored only status.
        parsed = { status: cached };
        await redis.del(cacheKey);
      }
    }

    const parsedRecord =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : ({ status: parsed } as Record<string, unknown>);

    return {
      id: String(parsedRecord.id ?? sessionId),
      status: String(parsedRecord.status ?? ""),
      exam_id:
        typeof parsedRecord.exam_id === "string" ? parsedRecord.exam_id : null,
      proctoring_mode:
        parsedRecord.proctoring_mode === "off" ||
        parsedRecord.proctoring_mode === "standard" ||
        parsedRecord.proctoring_mode === "strict"
          ? parsedRecord.proctoring_mode
          : null,
    } satisfies CachedSessionMeta;
  }

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, status, exam_id, exams(proctoring_mode)")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (session) {
    const cachedSession = {
      id: String(session.id),
      status: String(session.status),
      exam_id: typeof session.exam_id === "string" ? session.exam_id : null,
      proctoring_mode:
        (getRelationObject(
          session.exams as
            | { proctoring_mode: ProctoringMode | null }
            | { proctoring_mode: ProctoringMode | null }[]
            | null,
        )?.proctoring_mode as ProctoringMode | null | undefined) ?? null,
    } satisfies CachedSessionMeta;
    await redis.set(cacheKey, JSON.stringify(cachedSession), { ex: 600 });
    return cachedSession;
  }

  return session;
}

async function cacheSessionMeta(
  sessionId: string,
  userId: string,
  meta: {
    status: string;
    examId?: string | null;
    proctoringMode?: ProctoringMode | null;
  },
) {
  await redis.set(
    getSessionMetaCacheKey(sessionId, userId),
    JSON.stringify({
      id: sessionId,
      status: meta.status,
      exam_id: meta.examId ?? null,
      proctoring_mode: meta.proctoringMode ?? null,
    }),
    { ex: 600 }
  );
}

async function resolveStudentRuntimeActionContext(
  sessionId: string,
  runtimeToken?: string | null,
) {
  const verifiedToken = verifyStudentRuntimeToken(runtimeToken, sessionId);

  if (verifiedToken) {
    try {
      return {
        userId: verifiedToken.userId,
        supabase: createAdminClient() as unknown as SupabaseActionClient,
      };
    } catch {
      // Fall through to the user-scoped client when admin env is unavailable.
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Нэвтрээгүй байна" } as const;
  }

  return {
    userId: user.id,
    supabase,
  };
}

function getInitialTimeLeftSeconds(
  startedAt: string | null | undefined,
  exam: Pick<StudentAssignedExam, "end_time" | "duration_minutes">
) {
  const sessionDeadlineMs = getSessionDeadlineMs(startedAt, {
    end_time: exam.end_time,
    duration_minutes: Number(exam.duration_minutes ?? 0),
  });

  return sessionDeadlineMs === null
    ? null
    : Math.max(Math.floor((sessionDeadlineMs - Date.now()) / 1000), 0);
}

async function getSessionAnswerAnalyticsForUser(
  sessionId: string,
  userId: string
) {
  const analyticsKey = getSessionAnswerMetaCacheKey(sessionId, userId);
  const redisMeta = await redis.hgetall(analyticsKey);
  const analytics: Record<string, AnswerChangeAnalytics> = {};

  for (const [questionId, rawValue] of Object.entries(redisMeta ?? {})) {
    try {
      const parsed = JSON.parse(String(rawValue)) as AnswerChangeAnalytics;
      analytics[questionId] = {
        firstAnsweredAt:
          typeof parsed.firstAnsweredAt === "string"
            ? parsed.firstAnsweredAt
            : null,
        lastChangedAt:
          typeof parsed.lastChangedAt === "string"
            ? parsed.lastChangedAt
            : null,
        changeCount: Number(parsed.changeCount ?? 0),
      };
    } catch {
      analytics[questionId] = {
        firstAnsweredAt: null,
        lastChangedAt: null,
        changeCount: 0,
      };
    }
  }

  return analytics;
}

async function loadStudentExamPayload(
  supabase: SupabaseActionClient,
  examId: string,
  assignedExam: NonNullable<
    Awaited<ReturnType<typeof getAssignedPublishedExamRecord>>
  >
) {
  const exam = assignedExam.exam;
  if (!exam) return null;

  // Redis cache шалгах
  const cacheKey = getQuestionCacheKey(examId);
  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed =
      typeof cached === "string"
        ? JSON.parse(cached)
        : cached;
    const examBase =
      ((parsed as { examBase?: Record<string, unknown> }).examBase ?? {});
    return {
      exam: {
        ...examBase,
        ...exam,
        ...normalizeProctoringSettings(examBase),
      },
      questions:
        ((parsed as { questions?: StudentSafeQuestion[] }).questions ?? []),
    };
  }

  const snapshot = await getStoredPublishedExamSnapshot(
    supabase as SupabaseServerClient,
    examId
  );
  if (snapshot) {
    const result = {
      exam: {
        ...snapshot.exam,
        ...exam,
        ...normalizeProctoringSettings(snapshot.exam),
      },
      questions: getStudentSafeQuestions(snapshot.questions) as StudentSafeQuestion[],
    };
    const cachePayload = {
      examBase: snapshot.exam,
      questions: result.questions,
    };

    const ttlSeconds = getExamPayloadCacheTtlSeconds(exam);
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
  const passageAwareQuestions = (await attachPassagesToQuestions(
    supabase as SupabaseServerClient,
    safeQuestions
  )) as StudentSafeQuestion[];
  const result = { exam, questions: passageAwareQuestions };
  const cachePayload = {
    examBase: getRelationObject(assignedExam.row.exams) ?? exam,
    questions: passageAwareQuestions,
  };

  const ttlSeconds = getExamPayloadCacheTtlSeconds(exam);
  await redis.set(cacheKey, JSON.stringify(cachePayload), { ex: ttlSeconds });

  return result;
}

function applyVariantToStudentSafeQuestion(
  question: StudentSafeQuestion,
  variant: StoredQuestionVariant | null | undefined
) {
  if (!variant) return question;

  const nextQuestion: StudentSafeQuestion = {
    ...question,
    type: variant.type,
    content: variant.content,
    content_html: variant.content_html,
    image_url: variant.image_url,
    ai_variant_enabled: question.ai_variant_enabled,
  };

  if (variant.type === "matching") {
    const matchingPairs = parseMatchingDisplayPairs(variant.options);

    return {
      ...nextQuestion,
      options: null,
      matching_prompts: matchingPairs.map((pair) => pair.left),
      matching_choices: matchingPairs.map((pair) => pair.right),
    };
  }

  return {
    ...nextQuestion,
    options: variant.options,
    matching_prompts: undefined,
    matching_choices: undefined,
  };
}

function isSessionExpiredForExam(
  startedAt: string | null | undefined,
  exam: Pick<StudentAssignedExam, "end_time" | "duration_minutes">,
  nowMs = Date.now()
) {
  const deadlineMs = getSessionDeadlineMs(startedAt, {
    end_time: exam.end_time,
    duration_minutes: exam.duration_minutes,
  });

  return deadlineMs !== null && nowMs >= deadlineMs;
}

function getPercentage(totalScore: number, maxScore: number) {
  return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
}

function isSessionScorePending(session: {
  total_score?: number | null;
  max_score?: number | null;
}) {
  return session.total_score == null || session.max_score == null;
}

function normalizeAnswerScoreSource(value: unknown): AnswerScoreSource {
  if (value === "ai" || value === "teacher" || value === "objective") {
    return value;
  }

  return "objective";
}

function normalizeAnswerReviewStatus(value: unknown): AnswerReviewStatus {
  if (value === "requested" || value === "resolved" || value === "none") {
    return value;
  }

  return "none";
}

function isRecordProctorEventRpcMissing(errorCode?: string | null, message?: string | null) {
  if (errorCode === "42883" || errorCode === "PGRST202" || errorCode === "PGRST204") {
    return true;
  }

  return String(message ?? "").includes("record_proctor_event_atomic");
}

function canRequestEssayReview(input: {
  questionType: string;
  scoreSource: AnswerScoreSource;
  reviewStatus: AnswerReviewStatus;
  canViewResults: boolean;
  gradingPending: boolean;
}) {
  return (
    input.questionType === "essay" &&
    input.scoreSource === "ai" &&
    input.reviewStatus === "none" &&
    input.canViewResults &&
    !input.gradingPending
  );
}

function revalidateStudentResultPaths(examId: string) {
  revalidatePath("/student");
  revalidatePath("/student/exams");
  revalidatePath("/student/results");
  revalidatePath("/student/schedule");
  revalidatePath(`/student/exams/${examId}/result`);
}

function revalidateEducatorReviewPaths(sessionId?: string | null) {
  revalidatePath("/educator/grading");

  if (sessionId) {
    revalidatePath(`/educator/grading/${sessionId}`);
  }
}

function parseMatchingDisplayPairs(options: unknown) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      const [left, ...rightParts] = String(option).split("|||");
      const right = rightParts.join("|||");
      if (!left || !right) return null;

      return { left, right };
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
      const matchingPairs = parseMatchingDisplayPairs(safeQuestion.options);
      safeQuestion.matching_prompts = matchingPairs.map((pair) => pair.left);
      safeQuestion.matching_choices = matchingPairs.map((pair) => pair.right);
      safeQuestion.options = null;
    }

    return safeQuestion;
  });
}

function tryParseJson<T>(value: string | null | undefined) {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeTextAnswer(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeAnswerArray(value: string | null | undefined) {
  const parsed = tryParseJson<unknown>(value);

  if (Array.isArray(parsed)) {
    return parsed
      .map((entry) => normalizeTextAnswer(String(entry ?? "")))
      .filter(Boolean)
      .sort();
  }

  return String(value ?? "")
    .split(",")
    .map((entry) => normalizeTextAnswer(entry))
    .filter(Boolean)
    .sort();
}

function areArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

function isMatchingAnswerCorrect(
  submittedAnswer: string | null | undefined,
  options: string[] | null | undefined
) {
  const parsed = tryParseJson<Record<string, unknown>>(submittedAnswer);
  if (!parsed || Array.isArray(parsed)) return false;

  const matchingPairs = parseMatchingDisplayPairs(options);
  if (matchingPairs.length === 0) return false;

  return matchingPairs.every((pair) => {
    const submittedValue = parsed[pair.left];
    return (
      normalizeTextAnswer(String(submittedValue ?? "")) ===
      normalizeTextAnswer(pair.right)
    );
  });
}

type FinalizeAnswerPayload = {
  question_id: string;
  answer: string;
  first_answered_at: string | null;
  last_changed_at: string | null;
  change_count: number;
};

type FinalizeQuestionRecord = {
  id: string;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  points: number;
  order_index: number;
  ai_variant_enabled: boolean;
  ai_variant_mode: AiQuestionVariantMode;
};

async function loadFinalizeQuestionContext(
  supabase: SupabaseActionClient,
  examId: string
) {
  const snapshot = await getStoredPublishedExamSnapshot(
    supabase as SupabaseServerClient,
    examId
  );

  if (snapshot) {
    return {
      questionMap: getSnapshotQuestionMap(snapshot) as Map<
        string,
        FinalizeQuestionRecord
      >,
      maxScore: Number(snapshot.stats.total_points ?? 0),
      hasEssay: Boolean(snapshot.stats.has_essay_questions),
    };
  }

  const withMode = await supabase
    .from("questions")
    .select(
      "id, type, content, content_html, image_url, options, correct_answer, explanation, points, order_index, ai_variant_enabled, ai_variant_mode"
    )
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  let rows: FinalizeQuestionRecord[] = [];

  if (!withMode.error) {
    rows = (withMode.data ?? []) as FinalizeQuestionRecord[];
  } else if (
    isQuestionVariantSchemaMissing(withMode.error.code, withMode.error.message)
  ) {
    const withFlagOnly = await supabase
      .from("questions")
      .select(
        "id, type, content, content_html, image_url, options, correct_answer, explanation, points, order_index, ai_variant_enabled"
      )
      .eq("exam_id", examId)
      .order("order_index", { ascending: true });

    if (!withFlagOnly.error) {
      rows = (withFlagOnly.data ?? []).map((question) => ({
        ...question,
        ai_variant_mode: "per_student" as AiQuestionVariantMode,
      })) as FinalizeQuestionRecord[];
    } else if (
      isQuestionVariantSchemaMissing(
        withFlagOnly.error.code,
        withFlagOnly.error.message
      )
    ) {
      const fallback = await supabase
        .from("questions")
        .select(
          "id, type, content, content_html, image_url, options, correct_answer, explanation, points, order_index"
        )
        .eq("exam_id", examId)
        .order("order_index", { ascending: true });

      if (fallback.error) {
        return { error: fallback.error.message };
      }

      rows = (fallback.data ?? []).map((question) => ({
        ...question,
        ai_variant_enabled: false,
        ai_variant_mode: "per_student" as AiQuestionVariantMode,
      })) as FinalizeQuestionRecord[];
    } else {
      return { error: withFlagOnly.error.message };
    }
  } else {
    return { error: withMode.error.message };
  }

  return {
    questionMap: new Map(rows.map((question) => [question.id, question])),
    maxScore: rows.reduce(
      (sum, question) => sum + Number(question.points ?? 0),
      0
    ),
    hasEssay: rows.some((question) => question.type === "essay"),
  };
}

function getDeterministicVariantSlot(seed: string, slotCount: number) {
  let hash = 0;

  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return (hash % slotCount) + 1;
}

async function ensureSessionVariantsForExam(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string,
  sessionId: string
) {
  const questionContext = await loadFinalizeQuestionContext(supabase, examId);

  if ("error" in questionContext) {
    console.error(
      "[question-variants] unable to load question context",
      questionContext.error
    );
    return new Map<string, StoredQuestionVariant>();
  }

  try {
    const questions = Array.from(questionContext.questionMap.values()).map(
      (question) => ({
        id: question.id,
        type: question.type,
        content: question.content,
        content_html: question.content_html,
        image_url: question.image_url,
        options: question.options,
        correct_answer: question.correct_answer,
        explanation: question.explanation,
        ai_variant_enabled: Boolean(question.ai_variant_enabled),
        ai_variant_mode: question.ai_variant_mode ?? "per_student",
      })
    );
    const fixedVariantSlot = getDeterministicVariantSlot(
      `${sessionId}:${userId}`,
      2
    );

    return await ensureSessionVariantsForSession(supabase, {
      sessionId,
      userId,
      questions,
      variantSlot: fixedVariantSlot,
    });
  } catch (error) {
    console.error("[question-variants] ensure failed", error);
    return new Map<string, StoredQuestionVariant>();
  }
}

function gradeAnswerForFinalize(
  question: FinalizeQuestionRecord,
  answer: string,
  existingScore: number | null | undefined
) {
  const questionPoints = Number(question.points ?? 0);

  if (question.type === "essay") {
    return {
      isCorrect: null,
      score: Number(existingScore ?? 0),
    };
  }

  if (question.type === "multiple_choice" || question.type === "fill_blank") {
    const isCorrect =
      normalizeTextAnswer(answer) === normalizeTextAnswer(question.correct_answer);
    return { isCorrect, score: isCorrect ? questionPoints : 0 };
  }

  if (question.type === "multiple_response") {
    const isCorrect = areArraysEqual(
      normalizeAnswerArray(answer),
      normalizeAnswerArray(question.correct_answer)
    );
    return { isCorrect, score: isCorrect ? questionPoints : 0 };
  }

  if (question.type === "matching") {
    const isCorrect = isMatchingAnswerCorrect(answer, question.options);
    return { isCorrect, score: isCorrect ? questionPoints : 0 };
  }

  return { isCorrect: false, score: 0 };
}

/**
 * Publish хийх үед Redis cache-д шалгалтын payload-г урьдчилан бэлтгэх (prewarm).
 * Cache stampede-ээс сэргийлнэ: 500 сурагч нэгэн зэрэг ороход Redis-ээс авна.
 */
export async function prewarmExamCache(
  examId: string,
  snapshot: { exam: { end_time: string; duration_minutes: number }; questions: Array<{ correct_answer?: unknown; passage_id?: string | null }> }
) {
  const cacheKey = getQuestionCacheKey(examId);
  const safeQuestions = getStudentSafeQuestions(snapshot.questions as Array<{ correct_answer?: unknown; passage_id?: string | null }>);
  const cachePayload = {
    examBase: snapshot.exam,
    questions: safeQuestions,
  };

  const ttlSeconds = getExamPayloadCacheTtlSeconds({
    end_time: snapshot.exam.end_time,
    duration_minutes: snapshot.exam.duration_minutes,
  });

  await redis.set(cacheKey, JSON.stringify(cachePayload), { ex: ttlSeconds });
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

  const accessContext = await loadStudentExamAccessContext(supabase, user.id);
  if (accessContext.rows.length === 0) return [];

  return accessContext.rows
    .map((row) => accessContext.accessMap.get(String(row.exam_id)) ?? null)
    .filter(
      (
        exam
      ): exam is StudentAssignedExam =>
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

  if (assignedExam.row.excused_at) return null;
  return loadStudentExamPayload(supabase, examId, assignedExam);
}

type FinalizeSessionReason = "submit" | "timeout";

function parseAnswerAnalyticsValue(
  rawAnalytics: string | AnswerChangeAnalytics | null | undefined
) {
  if (!rawAnalytics) {
    return {
      firstAnsweredAt: null,
      lastChangedAt: null,
      changeCount: 0,
    };
  }

  const parsed =
    typeof rawAnalytics === "string"
      ? tryParseJson<AnswerChangeAnalytics>(rawAnalytics)
      : rawAnalytics;

  return {
    firstAnsweredAt:
      typeof parsed?.firstAnsweredAt === "string"
        ? parsed.firstAnsweredAt
        : null,
    lastChangedAt:
      typeof parsed?.lastChangedAt === "string"
        ? parsed.lastChangedAt
        : null,
    changeCount: Number(parsed?.changeCount ?? 0),
  };
}

function buildFinalizeAnswerPayload(
  redisAnswers: Record<string, string> | null,
  redisAnswerMeta: Record<string, string> | null,
  clientAnswers?: Record<string, string>,
  clientAnswerAnalytics: Record<string, AnswerChangeAnalytics> = {},
) {
  const answerMap = new Map<string, string>();
  const analyticsMap = new Map<
    string,
    {
      firstAnsweredAt: string | null;
      lastChangedAt: string | null;
      changeCount: number;
    }
  >();

  if (redisAnswers) {
    for (const [questionId, answer] of Object.entries(redisAnswers)) {
      answerMap.set(questionId, String(answer));
      analyticsMap.set(
        questionId,
        parseAnswerAnalyticsValue(redisAnswerMeta?.[questionId]),
      );
    }
  }

  if (clientAnswers) {
    for (const [questionId, answer] of Object.entries(clientAnswers)) {
      if (answer === "") {
        answerMap.delete(questionId);
        analyticsMap.delete(questionId);
      } else {
        answerMap.set(questionId, String(answer));
        analyticsMap.set(
          questionId,
          parseAnswerAnalyticsValue(clientAnswerAnalytics[questionId]),
        );
      }
    }
  }

  return Array.from(answerMap.entries()).map(([questionId, answer]) => {
    const analytics = analyticsMap.get(questionId) ?? {
      firstAnsweredAt: null,
      lastChangedAt: null,
      changeCount: 0,
    };

    return {
      question_id: questionId,
      answer,
      first_answered_at: analytics.firstAnsweredAt,
      last_changed_at: analytics.lastChangedAt,
      change_count: analytics.changeCount,
    } satisfies FinalizeAnswerPayload;
  });
}

function getClosedSessionStatus(
  reason: FinalizeSessionReason,
  hasEssay: boolean,
) {
  return reason === "timeout" && !hasEssay ? "timed_out" : "submitted";
}

type MaterializeAnswerRow = {
  question_id: string;
  answer: string | null;
  score: number | null;
  feedback: string | null;
  ai_score: number | null;
  ai_feedback: string | null;
  ai_graded_at: string | null;
  graded_by: string | null;
  graded_at: string | null;
  score_source: string | null;
  review_status: string | null;
  review_requested_at: string | null;
  review_reason: string | null;
  review_resolved_at: string | null;
  first_answered_at: string | null;
  last_changed_at: string | null;
  change_count: number | null;
};

type MaterializedAnswerUpdate = {
  session_id: string;
  question_id: string;
  user_id: string;
  answer: string;
  first_answered_at: string | null;
  last_changed_at: string | null;
  change_count: number;
  is_correct: boolean | null;
  score: number;
  feedback: string | null;
  ai_score: number | null;
  ai_feedback: string | null;
  ai_graded_at: string | null;
  score_source: AnswerScoreSource;
  review_status: AnswerReviewStatus;
  review_requested_at: string | null;
  review_reason: string | null;
  review_resolved_at: string | null;
  graded_by: string | null;
  graded_at: string | null;
};

const CONCURRENT_ESSAY_GRADING_LIMIT = 3;

async function buildMaterializedAnswerUpdate(input: {
  sessionId: string;
  userId: string;
  baseQuestion: FinalizeQuestionRecord;
  effectiveQuestion: FinalizeQuestionRecord;
  answerRow: MaterializeAnswerRow;
}) {
  const reviewStatus = normalizeAnswerReviewStatus(input.answerRow.review_status);
  const scoreSource = normalizeAnswerScoreSource(input.answerRow.score_source);
  const answerText = String(input.answerRow.answer ?? "");

  if (input.baseQuestion.type === "essay") {
    if (scoreSource === "teacher" || reviewStatus === "resolved") {
      return {
        session_id: input.sessionId,
        question_id: String(input.answerRow.question_id),
        user_id: input.userId,
        answer: answerText,
        first_answered_at: input.answerRow.first_answered_at,
        last_changed_at: input.answerRow.last_changed_at,
        change_count: Number(input.answerRow.change_count ?? 0),
        is_correct: null,
        score: Number(input.answerRow.score ?? 0),
        feedback: input.answerRow.feedback ?? null,
        ai_score:
          input.answerRow.ai_score == null
            ? null
            : Number(input.answerRow.ai_score),
        ai_feedback: input.answerRow.ai_feedback ?? null,
        ai_graded_at: input.answerRow.ai_graded_at ?? null,
        score_source: "teacher" as const,
        review_status: "resolved" as const,
        review_requested_at: input.answerRow.review_requested_at ?? null,
        review_reason: input.answerRow.review_reason ?? null,
        review_resolved_at: input.answerRow.review_resolved_at ?? null,
        graded_by: input.answerRow.graded_by ?? null,
        graded_at: input.answerRow.graded_at ?? null,
      };
    }

    const aiResult =
      input.answerRow.ai_score != null &&
      input.answerRow.ai_feedback &&
      input.answerRow.ai_graded_at
        ? {
            score: Number(input.answerRow.ai_score),
            feedback: String(input.answerRow.ai_feedback),
          }
        : await gradeEssayWithAIResult({
            questionContent: String(input.effectiveQuestion.content ?? ""),
            studentAnswer: answerText,
            maxPoints: Number(input.baseQuestion.points ?? 0),
          }).catch((error) => {
            console.error("[essay-grading] AI grading failed", error);
            return {
              score: Number(input.answerRow.score ?? 0),
              feedback:
                input.answerRow.ai_feedback ??
                "AI тайлбарыг түр үүсгэж чадсангүй.",
            };
          });

    const aiGradedAt =
      input.answerRow.ai_graded_at ?? new Date().toISOString();

    return {
      session_id: input.sessionId,
      question_id: String(input.answerRow.question_id),
      user_id: input.userId,
      answer: answerText,
      first_answered_at: input.answerRow.first_answered_at,
      last_changed_at: input.answerRow.last_changed_at,
      change_count: Number(input.answerRow.change_count ?? 0),
      is_correct: null,
      score: aiResult.score,
      feedback: null,
      ai_score: aiResult.score,
      ai_feedback: aiResult.feedback,
      ai_graded_at: aiGradedAt,
      score_source: "ai" as const,
      review_status: reviewStatus,
      review_requested_at: input.answerRow.review_requested_at ?? null,
      review_reason: input.answerRow.review_reason ?? null,
      review_resolved_at: input.answerRow.review_resolved_at ?? null,
      graded_by: null,
      graded_at: null,
    };
  }

  const graded = gradeAnswerForFinalize(
    input.effectiveQuestion,
    answerText,
    Number(input.answerRow.score ?? 0),
  );

  return {
    session_id: input.sessionId,
    question_id: String(input.answerRow.question_id),
    user_id: input.userId,
    answer: answerText,
    first_answered_at: input.answerRow.first_answered_at,
    last_changed_at: input.answerRow.last_changed_at,
    change_count: Number(input.answerRow.change_count ?? 0),
    is_correct: graded.isCorrect,
    score: graded.score,
    feedback: null,
    ai_score: null,
    ai_feedback: null,
    ai_graded_at: null,
    score_source: "objective" as const,
    review_status: "none" as const,
    review_requested_at: null,
    review_reason: null,
    review_resolved_at: null,
    graded_by: null,
    graded_at: null,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
) {
  if (items.length === 0) {
    return [] as R[];
  }

  const settledResults = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      try {
        const value = await mapper(items[currentIndex]);
        settledResults[currentIndex] = {
          status: "fulfilled",
          value,
        };
      } catch (error) {
        settledResults[currentIndex] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  const rejected = settledResults.find(
    (result): result is PromiseRejectedResult =>
      Boolean(result) && result.status === "rejected",
  );
  if (rejected) {
    throw rejected.reason;
  }

  return settledResults.map((result) => (result as PromiseFulfilledResult<R>).value);
}

async function scheduleSubmittedSessionProcessing(input: {
  sessionId: string;
  examId: string;
  userId: string;
  reason: "submit" | "timeout";
  actionRequiredReason?: ActionRequiredReason | null;
}) {
  const job: ExamProcessingJob = {
    sessionId: input.sessionId,
    examId: input.examId,
    userId: input.userId,
    reason: input.reason,
    queuedAt: new Date().toISOString(),
    triggeredBy:
      input.reason === "timeout" ? "timeout_finalize" : "student_submit",
    actionRequiredReason: input.actionRequiredReason ?? null,
  };

  try {
    const publishResult = await publishExamProcessingJob(job);
    if (publishResult.queued) {
      return;
    }
  } catch (error) {
    console.error("[exam-processing-queue] Failed to publish exam job", error);
  }

  try {
    after(async () => {
      try {
        await processExamProcessingJob(job, {
          allowRevalidate: true,
        });
      } catch (error) {
        console.error(
          "Failed to process submitted exam session after response",
          error,
        );
      }
    });
  } catch (error) {
    console.error("Failed to schedule submitted exam session processing", error);
  }
}

async function loadExamProcessingNotificationContext(
  examId: string,
  userId: string,
) {
  const admin = createAdminClient();
  const [{ data: examRow }, { data: profileRow }] = await Promise.all([
    admin.from("exams").select("title").eq("id", examId).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);

  return {
    examTitle: String(examRow?.title ?? "Шалгалт"),
    studentName: profileRow?.full_name || "Сурагч",
  };
}

export async function processExamProcessingJob(
  job: ExamProcessingJob,
  options?: {
    allowRevalidate?: boolean;
  },
) {
  const admin = createAdminClient();
  const result = await materializeSessionScoresIfNeeded(admin, {
    sessionId: job.sessionId,
    examId: job.examId,
    userId: job.userId,
    skipSideEffects: true,
  });

  if ("error" in result) {
    throw new Error(result.error);
  }

  if (job.actionRequiredReason) {
    const context = await loadExamProcessingNotificationContext(
      job.examId,
      job.userId,
    );
    await notifyTeachersOfActionRequiredSubmission({
      examId: job.examId,
      examTitle: context.examTitle,
      studentName: context.studentName,
      sessionId: job.sessionId,
      reason: job.actionRequiredReason,
    });
  }

  if (result.finalStatus === "graded" || result.finalStatus === "timed_out") {
    await enqueueStudentTopicMasteryRefresh(job.userId, null).catch((error) => {
      console.error(
        "[exam-processing-queue] Failed to enqueue mastery refresh",
        error,
      );
    });
  }

  if (options?.allowRevalidate !== false) {
    revalidateStudentResultPaths(job.examId);
  }

  return result;
}

async function materializeSessionScoresIfNeeded(
  supabase: SupabaseActionClient,
  {
    sessionId,
    examId,
    userId,
    skipSideEffects = false,
  }: {
    sessionId: string;
    examId: string;
    userId: string;
    skipSideEffects?: boolean;
  },
) {
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, status, total_score, max_score")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionError) return { error: sessionError.message };
  if (!session) return { error: "Session олдсонгүй" };

  if (!["submitted", "timed_out", "graded"].includes(String(session.status))) {
    return {
      success: true as const,
      finalStatus: String(session.status ?? ""),
      totalScore:
        session.total_score == null ? null : Number(session.total_score),
      maxScore: session.max_score == null ? null : Number(session.max_score),
      percentage:
        session.total_score == null || session.max_score == null
          ? null
          : getPercentage(
              Number(session.total_score),
              Number(session.max_score),
            ),
      gradingPending: isSessionScorePending(session),
    };
  }

  if (!isSessionScorePending(session)) {
    const totalScore = Number(session.total_score ?? 0);
    const maxScore = Number(session.max_score ?? 0);

    return {
      success: true as const,
      finalStatus: String(session.status ?? ""),
      totalScore,
      maxScore,
      percentage: getPercentage(totalScore, maxScore),
      gradingPending: false,
    };
  }

  const [questionContext, answerRowsResult, questionVariantMap] =
    await Promise.all([
      loadFinalizeQuestionContext(supabase, examId),
      supabase
        .from("answers")
        .select(
          "question_id, answer, score, feedback, ai_score, ai_feedback, ai_graded_at, graded_by, score_source, review_status, review_requested_at, review_reason, review_resolved_at, graded_at, first_answered_at, last_changed_at, change_count",
        )
        .eq("session_id", sessionId),
      getSessionQuestionVariantMap(supabase as SupabaseServerClient, sessionId),
    ]);

  if ("error" in questionContext) return { error: questionContext.error };
  if (answerRowsResult.error) return { error: answerRowsResult.error.message };

  const answerRows = (answerRowsResult.data ?? []) as MaterializeAnswerRow[];
  const gradedAnswerRows = await mapWithConcurrency<
    MaterializeAnswerRow,
    MaterializedAnswerUpdate | null
  >(
    answerRows,
    CONCURRENT_ESSAY_GRADING_LIMIT,
    async (rawAnswerRow) => {
      const baseQuestion = questionContext.questionMap.get(
        String(rawAnswerRow.question_id),
      );
      if (!baseQuestion) {
        return null;
      }

      const effectiveQuestion = applyStoredVariantToQuestion(
        baseQuestion,
        questionVariantMap.get(String(rawAnswerRow.question_id)),
      );

      return buildMaterializedAnswerUpdate({
        sessionId,
        userId,
        baseQuestion,
        effectiveQuestion,
        answerRow: rawAnswerRow,
      });
    },
  );
  const materializedAnswers = gradedAnswerRows.filter(
    (row): row is MaterializedAnswerUpdate => row !== null,
  );
  const totalScore = materializedAnswers.reduce(
    (sum, row) => sum + Number(row.score ?? 0),
    0,
  );

  if (materializedAnswers.length > 0) {
    const { error: gradedUpsertError } = await supabase.from("answers").upsert(
      materializedAnswers,
      { onConflict: "session_id,question_id" },
    );

    if (gradedUpsertError) return { error: gradedUpsertError.message };
  }

  const nextStatus = session.status === "timed_out" ? "timed_out" : "graded";

  const { error: sessionUpdateError } = await supabase
    .from("exam_sessions")
    .update({
      status: nextStatus,
      total_score: totalScore,
      max_score: questionContext.maxScore,
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (sessionUpdateError) return { error: sessionUpdateError.message };

  if (!skipSideEffects) {
    revalidateStudentResultPaths(examId);

    if (nextStatus === "graded" || nextStatus === "timed_out") {
      enqueueStudentTopicMasteryRefresh(userId, null).catch(() => {});
    }
  }

  return {
    success: true as const,
    finalStatus: nextStatus,
    totalScore,
    maxScore: questionContext.maxScore,
    percentage: getPercentage(totalScore, questionContext.maxScore),
    gradingPending: false,
  };
}

async function materializePendingReleasedSessionsForUser(
  supabase: SupabaseActionClient,
  userId: string,
  options?: {
    examId?: string;
    maxToProcess?: number;
    skipSideEffects?: boolean;
  },
) {
  const examId = options?.examId;
  const safeMaxToProcess = Math.max(
    1,
    Math.min(Number(options?.maxToProcess ?? (examId ? 3 : 2)), 10),
  );
  const candidateLimit = Math.max(safeMaxToProcess * 4, safeMaxToProcess);

  let query = supabase
    .from("exam_sessions")
    .select(
      "id, exam_id, user_id, status, total_score, max_score, attempt_number, started_at, submitted_at",
    )
    .eq("user_id", userId)
    .in("status", ["submitted", "timed_out"])
    .or("total_score.is.null,max_score.is.null");

  if (examId) {
    query = query.eq("exam_id", examId);
  }

  const { data: sessions, error } = await query.order("attempt_number", {
    ascending: false,
  }).limit(candidateLimit);

  if (error) return { error: error.message };

  const sessionsByExam = new Map<string, typeof sessions>();
  for (const session of sessions ?? []) {
    const examSessions = sessionsByExam.get(String(session.exam_id)) ?? [];
    examSessions.push(session);
    sessionsByExam.set(String(session.exam_id), examSessions);
  }

  const latestSessionMap = new Map<string, StudentExamAttemptSummary>();
  const candidateSessions = Array.from(sessionsByExam.entries())
    .map(([currentExamId, examSessions]) => {
      const latestSession = pickLatestAttempt(examSessions ?? []);
      if (!latestSession) return null;
      const latestSessionSummary = toStudentAttemptSummary(latestSession);
      if (latestSessionSummary) {
        latestSessionMap.set(currentExamId, latestSessionSummary);
      }
      return latestSession;
    })
    .filter(
      (
        session,
      ): session is NonNullable<(typeof sessions)[number]> => Boolean(session),
    )
    .sort((left, right) => {
      const leftTime = new Date(
        String(left.submitted_at ?? left.started_at ?? 0),
      ).getTime();
      const rightTime = new Date(
        String(right.submitted_at ?? right.started_at ?? 0),
      ).getTime();
      return rightTime - leftTime;
    });

  const accessContext = await loadStudentExamAccessContext(supabase, userId, {
    examIds: candidateSessions.map((session) => String(session.exam_id)),
    includeLatestSessions: false,
    latestSessionMap,
  });

  let processed = 0;

  for (const session of candidateSessions.slice(0, candidateLimit)) {
    if (processed >= safeMaxToProcess) {
      break;
    }

    const effectiveExam = await getEffectiveExamAccessForStudent(
      supabase,
      userId,
      String(session.exam_id),
      toStudentAttemptSummary(session),
      accessContext,
    );

    if (!effectiveExam?.is_result_released) {
      continue;
    }

    const result = await materializeSessionScoresIfNeeded(supabase, {
      sessionId: String(session.id),
      examId: String(session.exam_id),
      userId,
      skipSideEffects: options?.skipSideEffects ?? false,
    });

    if (!("error" in result)) {
      processed += 1;
    }
  }

  return { success: true as const, processed };
}

export async function processPendingExamResults(batchSize = 10) {
  const admin = createAdminClient();
  const safeBatchSize = Math.max(1, Math.min(Number(batchSize || 0), 25));
  const candidateLimit = Math.max(safeBatchSize * 5, safeBatchSize);
  const { data: sessions, error } = await admin
    .from("exam_sessions")
    .select(
      "id, exam_id, user_id, status, total_score, max_score, attempt_number, started_at, submitted_at",
    )
    .in("status", ["submitted", "timed_out"])
    .or("total_score.is.null,max_score.is.null")
    .order("submitted_at", { ascending: true })
    .limit(candidateLimit);

  if (error) {
    throw new Error(error.message);
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const session of sessions ?? []) {
    if (processed >= safeBatchSize) {
      break;
    }

    processed += 1;
    const result = await processExamProcessingJob(
      {
        sessionId: String(session.id),
        examId: String(session.exam_id),
        userId: String(session.user_id),
        reason: session.status === "timed_out" ? "timeout" : "submit",
        queuedAt: new Date().toISOString(),
        triggeredBy: "manual_recovery",
      },
      {
        allowRevalidate: true,
      },
    ).catch((error) => ({
      error: error instanceof Error ? error.message : "unknown_error",
    }));

    if ("error" in result) {
      failed += 1;
      continue;
    }

    succeeded += 1;
  }

  return {
    claimed: (sessions ?? []).length,
    processed,
    succeeded,
    failed,
  };
}

async function finalizeSessionAttempt(
  supabase: SupabaseActionClient,
  {
    sessionId,
    examId,
    userId,
    reason,
    clientAnswers,
    clientAnswerAnalytics = {},
    skipPostFinalizeSideEffects = false,
  }: {
    sessionId: string;
    examId: string;
    userId: string;
    reason: FinalizeSessionReason;
    clientAnswers?: Record<string, string>;
    clientAnswerAnalytics?: Record<string, AnswerChangeAnalytics>;
    skipPostFinalizeSideEffects?: boolean;
  }
) {
  const finalizeStartedAt = Date.now();
  const redisKey = getSessionAnswersCacheKey(sessionId, userId);
  const analyticsKey = getSessionAnswerMetaCacheKey(sessionId, userId);
  const lockKey = getSubmitSessionLockKey(sessionId, userId);

  // Fetch Redis answers/analytics + acquire lock in parallel
  const fetchPipe = redis.pipeline();
  fetchPipe.hgetall(redisKey);
  fetchPipe.hgetall(analyticsKey);
  const [[redisAnswers, redisAnswerMeta], lockAcquired] = (await Promise.all([
    fetchPipe.exec(),
    redis.set(lockKey, "1", { ex: 30, nx: true }),
  ])) as [[Record<string, string> | null, Record<string, string> | null], string | null];

  const answersPayload = buildFinalizeAnswerPayload(
    redisAnswers,
    redisAnswerMeta,
    clientAnswers,
    clientAnswerAnalytics,
  );

  if (!lockAcquired) {
    const { data: lockedSession } = await supabase
      .from("exam_sessions")
      .select("status, total_score, max_score")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (lockedSession && lockedSession.status !== "in_progress") {
      return {
        success: true as const,
        finalStatus: String(lockedSession.status),
        totalScore:
          lockedSession.total_score == null
            ? null
            : Number(lockedSession.total_score),
        maxScore:
          lockedSession.max_score == null
            ? null
            : Number(lockedSession.max_score),
        percentage:
          lockedSession.total_score == null || lockedSession.max_score == null
            ? null
            : getPercentage(
                Number(lockedSession.total_score),
                Number(lockedSession.max_score),
              ),
        gradingPending: isSessionScorePending(lockedSession),
      };
    }

    return { error: "Шалгалтыг илгээж байна. Дахин оролдоно уу." };
  }

  try {
    // Fetch session + question context in parallel
    const [{ data: session, error: sessionError }, questionContext] =
      await Promise.all([
        supabase
          .from("exam_sessions")
          .select("id, status, total_score, max_score, flag_status")
          .eq("id", sessionId)
          .eq("user_id", userId)
          .maybeSingle(),
        loadFinalizeQuestionContext(supabase, examId),
      ]);

    if (sessionError) return { error: sessionError.message };
    if (!session) return { error: "Session олдсонгүй" };

    if (session.status !== "in_progress") {
      return {
        success: true as const,
        finalStatus: String(session.status),
        totalScore:
          session.total_score == null ? null : Number(session.total_score),
        maxScore: session.max_score == null ? null : Number(session.max_score),
        percentage:
          session.total_score == null || session.max_score == null
            ? null
            : getPercentage(
                Number(session.total_score),
                Number(session.max_score),
              ),
        gradingPending: isSessionScorePending(session),
      };
    }
    if ("error" in questionContext) return { error: questionContext.error };

    if (answersPayload.length > 0) {
      const { error: answerUpsertError } = await supabase.from("answers").upsert(
        answersPayload.map((answer) => ({
          session_id: sessionId,
          question_id: answer.question_id,
          user_id: userId,
          answer: answer.answer,
          first_answered_at: answer.first_answered_at,
          last_changed_at: answer.last_changed_at,
          change_count: answer.change_count,
        })),
        { onConflict: "session_id,question_id" },
      );

      if (answerUpsertError) return { error: answerUpsertError.message };
    }

    const finalStatus = getClosedSessionStatus(reason, questionContext.hasEssay);
    const hasProctorFlag = ["flagged", "escalated"].includes(
      String(session.flag_status ?? "clear"),
    );
    const actionRequiredReason: ActionRequiredReason | null =
      finalStatus === "submitted" && (questionContext.hasEssay || hasProctorFlag)
        ? questionContext.hasEssay
          ? hasProctorFlag
            ? "essay_review_and_proctor_flag"
            : "essay_review"
          : "proctor_flag"
        : null;

    const { error: updateError } = await supabase
      .from("exam_sessions")
      .update({
        status: finalStatus,
        submitted_at: new Date().toISOString(),
        total_score: null,
        max_score: null,
      })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("status", "in_progress");

    if (updateError) return { error: updateError.message };

    const cleanupPipe = redis.pipeline();
    cleanupPipe.del(redisKey);
    cleanupPipe.del(analyticsKey);
    cleanupPipe.set(
      getSessionMetaCacheKey(sessionId, userId),
      JSON.stringify({
        id: sessionId,
        status: finalStatus,
        exam_id: examId,
        proctoring_mode: null,
      }),
      { ex: 600 },
    );
    await cleanupPipe.exec();

    if (!skipPostFinalizeSideEffects) {
      revalidateStudentResultPaths(examId);
      revalidatePath(`/educator/exams/${examId}/results`);
      await scheduleSubmittedSessionProcessing({
        sessionId,
        examId,
        userId,
        reason,
        actionRequiredReason,
      });
    }

    return {
      success: true as const,
      finalStatus,
      totalScore: null,
      maxScore: null,
      percentage: null,
      gradingPending: true,
      actionRequiredReason,
    };
  } finally {
    await redis.del(lockKey);
    logStudentPerf("finalizeSessionAttempt", finalizeStartedAt, 600, {
      examId,
      reason,
      sessionId,
      userId,
    });
  }
}

async function startExamSessionForUser(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string,
  assignedExam?: NonNullable<
    Awaited<ReturnType<typeof getAssignedPublishedExamRecord>>
  >
) {
  const assignedExamRecord = assignedExam?.exam ?? null;

  // Per-user rate limit
  const startLimit = await startExamRateLimit.limit(
    `start-exam:${userId}:${examId}`
  );
  if (!startLimit.success) {
    return { error: "Хэт олон эхлүүлэх оролдлого илгээлээ. Түр хүлээгээд дахин оролдоно уу." };
  }

  // Exam-level burst smoothing: 500 сурагч нэгэн зэрэг дарахад burst-ийг зөөлрүүлнэ
  const burstLimit = await examBurstRateLimit.limit(`exam-burst:${examId}`);
  if (!burstLimit.success) {
    return { error: "Олон сурагч нэгэн зэрэг эхлүүлж байна. 2-3 секунд хүлээгээд дахин оролдоно уу." };
  }

  // Atomic RPC: 6 DB round-trip → 1 call (assignment + time + session checks + INSERT)
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "start_exam_session_atomic",
    { p_exam_id: examId }
  );

  // RPC байхгүй бол fallback руу шилжих
  if (rpcError && (rpcError.code === "42883" || rpcError.message?.includes("does not exist"))) {
    return startExamSessionForUserFallback(supabase, userId, examId, assignedExam);
  }

  if (rpcError) {
    return { error: rpcError.message };
  }

  const result = rpcResult as Record<string, unknown>;

  // Хугацаа дууссан session-г app layer-ээс finalize хийнэ (Redis + grading шаардлагатай)
  if (result.expired_session_id) {
    const finalized = await finalizeSessionAttempt(supabase, {
      sessionId: String(result.expired_session_id),
      examId,
      userId,
      reason: "timeout",
    });

    if ("error" in finalized) {
      return { error: finalized.error };
    }

    // Finalize хийсний дараа дахин RPC дуудаж шинэ session үүсгэх
    const { data: retryResult, error: retryError } = await supabase.rpc(
      "start_exam_session_atomic",
      { p_exam_id: examId }
    );

    if (retryError) return { error: retryError.message };
    const retry = retryResult as Record<string, unknown>;

    if (retry.error) {
      return mapRpcError(retry);
    }

    if (retry.session) {
      const session = retry.session as Record<string, unknown>;
      await cacheSessionMeta(String(session.id), userId, {
        status: String(session.status),
        examId: examId,
        proctoringMode: assignedExamRecord?.proctoring_mode ?? null,
      });
      return { session: session as { id: string; exam_id: string; status: string; started_at: string; attempt_number: number } };
    }

    return { error: "Шалгалтын session үүсгэж чадсангүй" };
  }

  // RPC алдаа буцаасан бол
  if (result.error) {
    // Өөр шалгалтад active session байгаа бол expire шалгах
    if (result.error === "other_exam_active" && result.other_session_id) {
      const otherExam = await getEffectiveExamAccessForStudent(
        supabase,
        userId,
        String(result.other_exam_id)
      );

      if (
        otherExam &&
        isSessionExpiredForExam(
          (result.other_started_at as string) ?? null,
          otherExam,
          Date.now()
        )
      ) {
        const finalized = await finalizeSessionAttempt(supabase, {
          sessionId: String(result.other_session_id),
          examId: String(result.other_exam_id),
          userId,
          reason: "timeout",
        });

        if ("error" in finalized) {
          return { error: finalized.error };
        }

        // Retry after finalizing other exam
        return startExamSessionForUser(supabase, userId, examId, assignedExam);
      }

      return {
        error: "Та одоо өөр шалгалт өгч байна. Эхлээд тэр шалгалтаа дуусгана уу.",
      };
    }

    return mapRpcError(result);
  }

  // Session амжилттай буцсан
  if (result.session) {
    const session = result.session as Record<string, unknown>;
    await cacheSessionMeta(String(session.id), userId, {
      status: String(session.status),
      examId: examId,
      proctoringMode: assignedExamRecord?.proctoring_mode ?? null,
    });
    return { session: session as { id: string; exam_id: string; status: string; started_at: string; attempt_number: number } };
  }

  return { error: "Шалгалтын session үүсгэж чадсангүй" };
}

function mapRpcError(result: Record<string, unknown>) {
  const errorMap: Record<string, string> = {
    not_assigned: "Энэ шалгалт танд оноогдоогүй байна",
    excused: "Та энэ шалгалтаас чөлөөлөгдсөн байна",
    exam_not_found: "Шалгалт олдсонгүй",
    not_started: "Шалгалт хараахан нээгдээгүй байна",
    window_closed: "Шалгалтыг эхлүүлэх нээлттэй цонх хаагдсан байна",
    max_attempts_reached: "Шалгалтын оролдлогын эрх дууссан байна",
    concurrent_creation: "Шалгалтыг эхлүүлж байна. Дахин оролдоно уу.",
  };

  const errorKey = String(result.error);
  if (errorKey === "max_attempts_reached") {
    return { error: errorMap[errorKey], redirectToResult: true };
  }
  return { error: errorMap[errorKey] ?? errorKey };
}

/**
 * Fallback: RPC function deploy хийгдээгүй үед хуучин олон round-trip логик
 */
async function startExamSessionForUserFallback(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string,
  assignedExam?: NonNullable<
    Awaited<ReturnType<typeof getAssignedPublishedExamRecord>>
  >
) {
  const effectiveAssignedExam =
    assignedExam ??
    (await getAssignedPublishedExamRecord(supabase, userId, examId));
  if (!effectiveAssignedExam?.exam) {
    return { error: "Энэ шалгалт танд оноогдоогүй байна" };
  }
  if (effectiveAssignedExam.row.excused_at) {
    return { error: "Та энэ шалгалтаас чөлөөлөгдсөн байна" };
  }
  const exam = effectiveAssignedExam.exam;

  const now = Date.now();
  const startTime = new Date(exam.start_time as string).getTime();
  const endTime = new Date(exam.end_time as string).getTime();

  const existingInProgress = await getInProgressSession(
    supabase,
    examId,
    userId
  );

  if (existingInProgress) {
    if (
      isSessionExpiredForExam(
        existingInProgress.started_at ?? null,
        exam,
        now
      )
    ) {
      const finalized = await finalizeSessionAttempt(supabase, {
        sessionId: existingInProgress.id,
        examId,
        userId,
        reason: "timeout",
      });

      if ("error" in finalized) {
        return { error: finalized.error };
      }
    } else {
      await cacheSessionMeta(existingInProgress.id, userId, {
        status: "in_progress",
        examId,
        proctoringMode: exam.proctoring_mode,
      });
      return { session: existingInProgress };
    }
  }

  if (now < startTime) {
    return { error: "Шалгалт хараахан нээгдээгүй байна" };
  }

  if (now > endTime) {
    return { error: "Шалгалтыг эхлүүлэх нээлттэй цонх хаагдсан байна" };
  }

  const lockKey = getStartSessionLockKey(examId, userId);
  const lockAcquired = await redis.set(lockKey, "1", {
    ex: 15,
    nx: true,
  });

  if (!lockAcquired) {
    const lockedSession = await getInProgressSession(supabase, examId, userId);
    if (lockedSession) {
      return { session: lockedSession };
    }

    return { error: "Шалгалтыг эхлүүлж байна. Дахин оролдоно уу." };
  }

  try {
    const { data: sessions } = await supabase
      .from("exam_sessions")
      .select("*")
      .eq("exam_id", examId)
      .eq("user_id", userId)
      .order("attempt_number", { ascending: false });

    const concurrentInProgress = sessions?.find(
      (session) => session.status === "in_progress"
    );

    if (concurrentInProgress) {
      if (
        isSessionExpiredForExam(
          concurrentInProgress.started_at ?? null,
          exam,
          Date.now()
        )
      ) {
        const finalized = await finalizeSessionAttempt(supabase, {
          sessionId: concurrentInProgress.id,
          examId,
          userId,
          reason: "timeout",
        });

        if ("error" in finalized) {
          return { error: finalized.error };
        }
      } else {
        await cacheSessionMeta(concurrentInProgress.id, userId, {
          status: "in_progress",
          examId,
          proctoringMode: exam.proctoring_mode,
        });
        return { session: concurrentInProgress };
      }
    }

    const { data: otherActiveSession } = await supabase
      .from("exam_sessions")
      .select("id, exam_id, started_at")
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .neq("exam_id", examId)
      .limit(1)
      .maybeSingle();

    if (otherActiveSession) {
      const otherExam = await getEffectiveExamAccessForStudent(
        supabase,
        userId,
        otherActiveSession.exam_id
      );

      if (
        otherExam &&
        isSessionExpiredForExam(
          otherActiveSession.started_at ?? null,
          otherExam,
          Date.now()
        )
      ) {
        const finalized = await finalizeSessionAttempt(supabase, {
          sessionId: otherActiveSession.id,
          examId: otherActiveSession.exam_id,
          userId,
          reason: "timeout",
        });

        if ("error" in finalized) {
          return { error: finalized.error };
        }
      } else {
        return {
          error:
            "Та одоо өөр шалгалт өгч байна. Эхлээд тэр шалгалтаа дуусгана уу.",
        };
      }
    }

    const nextAttemptNumber = (sessions?.[0]?.attempt_number ?? 0) + 1;
    const maxAttempts = Number(exam.max_attempts ?? 1);

    if (nextAttemptNumber > maxAttempts) {
      return { error: "Шалгалтын оролдлогын эрх дууссан байна", redirectToResult: true };
    }

    const { data: session, error } = await supabase
      .from("exam_sessions")
      .insert({
        exam_id: examId,
        user_id: userId,
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
          userId
        );

        if (retrySession) {
          await cacheSessionMeta(retrySession.id, userId, {
            status: "in_progress",
            examId,
            proctoringMode: exam.proctoring_mode,
          });
          return { session: retrySession };
        }
      }

      return { error: error.message };
    }

    await cacheSessionMeta(session.id, userId, {
      status: "in_progress",
      examId,
      proctoringMode: exam.proctoring_mode,
    });
    return { session };
  } finally {
    await redis.del(lockKey);
  }
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
  return startExamSessionForUser(supabase, user.id, examId);
}

async function buildPreparedSessionState(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string,
  examPayload: Awaited<ReturnType<typeof loadStudentExamPayload>>,
  session: {
    id: string;
    started_at: string;
    status: string;
  } | null,
  options?: {
    skipSavedStateReads?: boolean;
  }
) {
  if (!examPayload) {
    return {
      sessionId: null,
      savedAnswers: {},
      answerAnalytics: {},
      initialTimeLeftSeconds: null,
      displayQuestions: [] as StudentSafeQuestion[],
      sessionAlreadyStarted: false,
    };
  }

  if (!session) {
    return {
      sessionId: null,
      savedAnswers: {},
      answerAnalytics: {},
      initialTimeLeftSeconds: null,
      displayQuestions: examPayload.questions,
      sessionAlreadyStarted: false,
    };
  }

  const initialTimeLeftSeconds = getInitialTimeLeftSeconds(
    session.started_at,
    examPayload.exam
  );

  if (initialTimeLeftSeconds !== null && initialTimeLeftSeconds <= 0) {
    if (session.status === "in_progress") {
      const finalized = await finalizeSessionAttempt(supabase, {
        sessionId: session.id,
        examId,
        userId,
        reason: "timeout",
      });

      if ("error" in finalized) {
        return {
          redirectTo: `/student/exams?error=${encodeURIComponent(finalized.error ?? "timeout_failed")}`,
        } as const;
      }
    }

    return {
      redirectTo: `/student/exams/${examId}/result`,
    } as const;
  }

  if (session.status === "in_progress") {
    const ensuredVariantMap = await ensureSessionVariantsForExam(
      supabase,
      userId,
      examId,
      session.id,
    );
    const displayQuestions = examPayload.questions.map((question) =>
      applyVariantToStudentSafeQuestion(
        question,
        ensuredVariantMap.get(question.id)
      )
    );

    if (options?.skipSavedStateReads) {
      return {
        sessionId: session.id,
        savedAnswers: {},
        answerAnalytics: {},
        initialTimeLeftSeconds,
        displayQuestions,
        sessionAlreadyStarted: false,
      };
    }

    const [savedAnswers, answerAnalytics] = await Promise.all([
      getSessionAnswersForUser(supabase, session.id, userId),
      getSessionAnswerAnalyticsForUser(session.id, userId),
    ]);

    return {
      sessionId: session.id,
      savedAnswers,
      answerAnalytics,
      initialTimeLeftSeconds,
      displayQuestions,
      sessionAlreadyStarted: true,
    };
  }

  const questionVariantMap = await getSessionQuestionVariantMap(
    supabase,
    session.id
  );
  const displayQuestions = examPayload.questions.map((question) =>
    applyVariantToStudentSafeQuestion(
      question,
      questionVariantMap.get(question.id)
    )
  );

  if (options?.skipSavedStateReads) {
    return {
      sessionId: session.id,
      savedAnswers: {},
      answerAnalytics: {},
      initialTimeLeftSeconds,
      displayQuestions,
      sessionAlreadyStarted: false,
    };
  }

  const [savedAnswers, answerAnalytics] = await Promise.all([
    getSessionAnswersForUser(supabase, session.id, userId),
    getSessionAnswerAnalyticsForUser(session.id, userId),
  ]);

  return {
    sessionId: session.id,
    savedAnswers,
    answerAnalytics,
    initialTimeLeftSeconds,
    displayQuestions,
    sessionAlreadyStarted: true,
  };
}

async function validateExamReadiness(
  exam: StudentAssignedExam,
  readiness: StartExamReadinessPayload
) {
  const effectiveDevicePolicy = getEffectiveDevicePolicy(exam);
  const shouldEnforceFullscreen =
    exam.require_fullscreen &&
    !(
      readiness.deviceType === "mobile" &&
      exam.proctoring_mode === "standard"
    );

  if (
    effectiveDevicePolicy === "desktop_only" &&
    readiness.deviceType !== "desktop"
  ) {
    return "Энэ шалгалтыг зөвхөн desktop эсвэл laptop төхөөрөмж дээр эхлүүлнэ үү.";
  }

  if (shouldEnforceFullscreen && !readiness.fullscreenReady) {
    return "Fullscreen горимыг идэвхжүүлсний дараа шалгалтыг эхлүүлнэ үү.";
  }

  if (exam.require_camera && !readiness.cameraReady) {
    return "Камер бэлэн болоогүй байна. Камерын зөвшөөрлөө шалгаад дахин оролдоно уу.";
  }

  if (exam.identity_verification && !readiness.identityVerified) {
    return "Identity verification амжилтгүй болсон тул шалгалтыг эхлүүлэх боломжгүй.";
  }

  return null;
}

export async function getExamStartGatePayload(
  examId: string
): Promise<ExamStartGatePayloadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const accessContext = await loadStudentExamAccessContext(supabase, user.id, {
    examId,
    includeLatestSessions: false,
  });
  const assignedRow = accessContext.rowMap.get(examId);
  const exam = accessContext.accessMap.get(examId);

  if (!assignedRow || !exam) {
    return { redirectTo: "/student/exams?error=exam_not_found" };
  }
  if (assignedRow.excused_at) {
    return { redirectTo: "/student/exams?error=exam_not_found" };
  }

  const inProgressSession = await getInProgressSession(supabase, examId, user.id);
  if (inProgressSession?.id) {
    return {
      redirectTo: `/student/exams/${examId}/take/run?session=${encodeURIComponent(String(inProgressSession.id))}`,
    };
  }

  const now = Date.now();
  const startTime = new Date(exam.start_time as string).getTime();
  if (now < startTime) {
    return {
      redirectTo: `/student/exams?error=time_window&exam=${encodeURIComponent(exam.title)}`,
    };
  }

  // Cache access context + warm question cache in background (non-blocking)
  after(async () => {
    try {
      await redis.set(
        getExamAccessCacheKey(examId, user.id),
        JSON.stringify({ assignedRow, exam }),
        { ex: 30 }
      );
    } catch {}
    try {
      const admin = createAdminClient() as unknown as SupabaseActionClient;
      await loadStudentExamPayload(admin, examId, { row: assignedRow, exam });
    } catch {}
  });

  return {
    exam: exam as StudentAssignedExam & Record<string, unknown>,
  };
}

export async function startExamAttempt(
  examId: string,
  readiness: StartExamReadinessPayload
): Promise<StartExamAttemptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" } as const;

  const examAccess = await resolveExamAccessWithCache(supabase, examId, user.id);
  if (!examAccess) {
    return { error: "Шалгалт олдсонгүй" } as const;
  }
  const { assignedRow, assignedExamRecord } = examAccess;
  const assignedExam = { row: assignedRow, exam: assignedExamRecord };

  const readinessError = await validateExamReadiness(
    assignedExam.exam,
    readiness,
  );
  if (readinessError) {
    return { error: readinessError } as const;
  }

  const sessionResult = await startExamSessionForUser(
    supabase,
    user.id,
    examId,
    assignedExam
  );

  if ("error" in sessionResult) {
    return {
      error:
        sessionResult.error ?? "Шалгалтын session эхлүүлж чадсангүй.",
    };
  }

  if (!sessionResult.session) {
    return { error: "Шалгалтын session эхлүүлж чадсангүй." } as const;
  }

  return {
    sessionId: String(sessionResult.session.id),
    startedAt: String(sessionResult.session.started_at),
    initialTimeLeftSeconds: getInitialTimeLeftSeconds(
      String(sessionResult.session.started_at),
      assignedExam.exam
    ),
  };
}

export async function persistExamStartTelemetry(
  sessionId: string,
  readiness: StartExamReadinessPayload,
  runtimeToken?: string | null,
) {
  const resolved = await resolveStudentRuntimeActionContext(
    sessionId,
    runtimeToken,
  );
  if ("error" in resolved) return resolved;

  const { supabase, userId } = resolved;

  const session = await getSessionMeta(supabase, sessionId, userId);
  if (!session) return { error: "Session олдсонгүй" };
  if (session.status !== "in_progress") {
    return { success: true, skipped: true };
  }
  const sessionProctoringMode =
    session.proctoring_mode ??
    (
      session.exam_id
        ? (
            await getAssignedPublishedExamRecord(
              supabase,
              userId,
              String(session.exam_id),
            )
          )?.exam?.proctoring_mode ?? null
        : null
    );
  const browserBaselineRisk =
    sessionProctoringMode === "standard" &&
    readiness.deviceType === "mobile" &&
    !readiness.isStandalonePwa
      ? 4
      : 0;

  const { error: updateError } = await supabase
    .from("exam_sessions")
    .update({
      identity_verified_at: readiness.identityVerified
        ? new Date().toISOString()
        : null,
      device_type: readiness.deviceType,
      display_mode: readiness.displayMode,
      platform: readiness.platform,
      risk_score: browserBaselineRisk,
      risk_level: deriveRiskLevel(browserBaselineRisk),
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (updateError) return { error: updateError.message };

  if (readiness.identityVerified) {
    const logResult = await logProctorEvent(sessionId, "identity_verified", {
      brightness_score:
        typeof readiness.brightnessScore === "number"
          ? readiness.brightnessScore
          : null,
    }, {
      runtimeToken,
    });
    if ("error" in logResult) {
      return { error: logResult.error };
    }
  }

  return { success: true };
}

async function getSessionAnswersForUser(
  supabase: SupabaseServerClient,
  sessionId: string,
  userId: string
) {
  const redisKey = getSessionAnswersCacheKey(sessionId, userId);
  const redisAnswers = await redis.hgetall(redisKey);
  if (redisAnswers && Object.keys(redisAnswers).length > 0) {
    return redisAnswers as Record<string, string>;
  }

  const { data: answers } = await supabase
    .from("answers")
    .select("question_id, answer")
    .eq("session_id", sessionId)
    .eq("user_id", userId);

  const result: Record<string, string> = {};
  for (const answerRow of answers ?? []) {
    if (answerRow.answer) result[answerRow.question_id] = answerRow.answer;
  }
  return result;
}

export async function prepareExamTakePayload(
  examId: string,
  options?: {
    sessionId?: string | null;
    skipSavedStateReads?: boolean;
    expectedStartedAt?: string | null;
  }
): Promise<PrepareExamTakePayloadResult> {
  const prepareStartedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" } as const;
  try {
    const examAccess = await resolveExamAccessWithCache(supabase, examId, user.id);
    if (!examAccess) {
      return { redirectTo: "/student/exams?error=exam_not_found" } as const;
    }
    const { assignedRow, assignedExamRecord } = examAccess;
    if (assignedRow.excused_at) {
      return { redirectTo: "/student/exams?error=exam_not_found" } as const;
    }
    const assignedExam = { row: assignedRow, exam: assignedExamRecord };

    const exam = assignedExam.exam;
    const now = Date.now();
    const startTime = new Date(exam.start_time as string).getTime();

    if (now < startTime) {
      return {
        redirectTo: `/student/exams?error=time_window&exam=${encodeURIComponent(exam.title)}`,
      } as const;
    }

    const examPayload = await loadStudentExamPayload(supabase, examId, assignedExam);

    if (
      !examPayload ||
      !Array.isArray(examPayload.questions) ||
      examPayload.questions.length === 0
    ) {
      return { redirectTo: "/student/exams?error=questions_not_ready" } as const;
    }

    const hintedSessionId = options?.sessionId?.trim();
    const hintedSession = hintedSessionId
      ? await getOwnedSessionById(supabase, hintedSessionId, examId, user.id)
      : null;
    const inProgressSession =
      hintedSession ?? (await getInProgressSession(supabase, examId, user.id));
    const canSkipSavedStateReads = Boolean(
      options?.skipSavedStateReads &&
        options?.expectedStartedAt &&
        inProgressSession?.started_at &&
        String(inProgressSession.started_at) === String(options.expectedStartedAt) &&
        Date.now() - new Date(String(options.expectedStartedAt)).getTime() < 15000
    );
    const preparedState = await buildPreparedSessionState(
      supabase,
      user.id,
      examId,
      examPayload,
      inProgressSession
        ? {
            id: String(inProgressSession.id),
            started_at: String(inProgressSession.started_at),
            status: String(inProgressSession.status),
          }
        : null,
      {
        skipSavedStateReads: canSkipSavedStateReads,
      }
    );

    if (
      "redirectTo" in preparedState &&
      typeof preparedState.redirectTo === "string"
    ) {
      return preparedState;
    }

    return {
      exam: examPayload.exam as StudentAssignedExam & Record<string, unknown>,
      questions: preparedState.displayQuestions,
      sessionId: preparedState.sessionId,
      runtimeToken: preparedState.sessionId
        ? createStudentRuntimeToken({
            sessionId: preparedState.sessionId,
            userId: user.id,
            expiresAtMs:
              preparedState.initialTimeLeftSeconds != null
                ? Date.now() +
                  Math.max(
                    preparedState.initialTimeLeftSeconds * 1000 + 30 * 60 * 1000,
                    30 * 60 * 1000,
                  )
                : null,
          })
        : null,
      savedAnswers: preparedState.savedAnswers,
      answerAnalytics: preparedState.answerAnalytics,
      initialTimeLeftSeconds: preparedState.initialTimeLeftSeconds,
      sessionAlreadyStarted: preparedState.sessionAlreadyStarted,
    } satisfies PrepareExamTakePayloadResult;
  } finally {
    logStudentPerf("prepareExamTakePayload", prepareStartedAt, 400, {
      examId,
      hintedSessionId: options?.sessionId ?? null,
      skipSavedStateReads: Boolean(options?.skipSavedStateReads),
    });
  }
}

/**
 * Олон хариултыг нэг дор Redis-д хадгалах — batched checkpoint
 */
export async function saveAnswersBatch(
  sessionId: string,
  answers: Record<string, string>,
  answerAnalytics: Record<string, AnswerChangeAnalytics> = {}
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  return saveAnswersBatchForUserClient(
    supabase,
    user.id,
    sessionId,
    answers,
    answerAnalytics
  );
}

export async function saveAnswersBatchForUserClient(
  supabase: SupabaseActionClient,
  userId: string,
  sessionId: string,
  answers: Record<string, string>,
  answerAnalytics: Record<string, AnswerChangeAnalytics> = {}
) {
  const checkpointStartedAt = Date.now();
  try {
    const session = await getSessionMeta(supabase, sessionId, userId);
    if (!session) return { error: "Session олдсонгүй" };
    if (session.status !== "in_progress") {
      return { error: "Энэ шалгалтын session идэвхгүй байна" };
    }

    await writeExamDraftDeltaToRedis({
      sessionId,
      userId,
      answers,
      answerAnalytics,
    });

    return { success: true };
  } finally {
    logStudentPerf("saveAnswersBatch", checkpointStartedAt, 250, {
      analyticsCount: Object.keys(answerAnalytics).length,
      answerCount: Object.keys(answers).length,
      sessionId,
      userId,
    });
  }
}

/**
 * Шалгалт дуусгах — close session immediately, grade later
 */
export async function submitExam(
  sessionId: string,
  clientAnswers?: Record<string, string>,
  clientAnswerAnalytics: Record<string, AnswerChangeAnalytics> = {}
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  return submitExamForUserClient(
    supabase,
    user.id,
    sessionId,
    clientAnswers,
    clientAnswerAnalytics
  );
}

export async function submitExamForUserClient(
  supabase: SupabaseActionClient,
  userId: string,
  sessionId: string,
  clientAnswers?: Record<string, string>,
  clientAnswerAnalytics: Record<string, AnswerChangeAnalytics> = {},
  options?: {
    skipPostFinalizeSideEffects?: boolean;
  }
) {
  const submitStartedAt = Date.now();
  try {
    const submitLimit = await submitExamRateLimit.limit(
      `submit-exam:${userId}:${sessionId}`
    );
    if (!submitLimit.success) {
      return {
        error:
          "Хэт олон илгээх оролдлого байна. Түр хүлээгээд дахин оролдоно уу.",
      };
    }

    // Session авах
    const { data: session } = await supabase
      .from("exam_sessions")
      .select("id, exam_id, status, total_score, max_score")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!session) return { error: "Session олдсонгүй" };

    if (session.status !== "in_progress") {
      await cacheSessionMeta(sessionId, userId, {
        status: String(session.status),
        examId: String(session.exam_id),
      });
      const totalScore = Number(session.total_score ?? 0);
      const maxScore = Number(session.max_score ?? 0);
      return {
        success: true,
        totalScore,
        maxScore,
        percentage: getPercentage(totalScore, maxScore),
      };
    }

    const examSubmitBurst = await examSubmitBurstRateLimit.limit(
      `exam-submit:${String(session.exam_id)}`
    );
    if (!examSubmitBurst.success) {
      return {
        error:
          "Олон сурагч нэгэн зэрэг илгээж байна. 1-3 секунд хүлээгээд дахин оролдоно уу.",
      };
    }

    // Submit дээр client-ээс ирсэн delta-г authoritative гэж үзнэ.
    // Ингэснээр өмнө эхэлсэн autosave удааширсан үед submit түүнд түгжигдэхгүй.
    return finalizeSessionAttempt(supabase, {
      sessionId,
      examId: session.exam_id,
      userId,
      reason: "submit",
      clientAnswers,
      clientAnswerAnalytics,
      skipPostFinalizeSideEffects:
        options?.skipPostFinalizeSideEffects ?? false,
    });
  } finally {
    logStudentPerf("submitExam", submitStartedAt, 500, {
      answerCount: Object.keys(clientAnswers ?? {}).length,
      sessionId,
      userId,
    });
  }
}

/**
 * Шалгалтын үеийн suspicious event-үүдийг логлох
 * Миграци apply хийгдээгүй үед зөөлөн алгасана.
 */
export async function logProctorEvent(
  sessionId: string,
  eventType: ProctorEventType,
  metadata: ProctorEventMetadata = {},
  options?: {
    runtimeToken?: string | null;
  },
) {
  const resolved = await resolveStudentRuntimeActionContext(
    sessionId,
    options?.runtimeToken,
  );
  if ("error" in resolved) return resolved;

  const { supabase, userId } = resolved;

  const shouldBypassDedupe =
    eventType === "challenge_failed" ||
    eventType === "challenge_passed" ||
    eventType === "challenge_required" ||
    eventType === "identity_failed" ||
    eventType === "identity_verified" ||
    eventType === "spot_check_failed" ||
    eventType === "spot_check_passed" ||
    eventType === "spot_check_required";

  if (!shouldBypassDedupe) {
    const dedupeAccepted = await redis.set(
      getProctorEventDedupeKey(sessionId, eventType, metadata),
      "1",
      {
        ex: 5,
        nx: true,
      },
    );
    if (!dedupeAccepted) {
      return { success: true, skipped: true };
    }
  }

  const limitResult = await proctorEventRateLimit.limit(
    `proctor:${userId}:${sessionId}:${eventType}`
  );
  if (!limitResult.success) {
    return { success: true, skipped: true };
  }

  const session = await getSessionMeta(supabase, sessionId, userId);

  if (!session) return { error: "Session олдсонгүй" };

  if (session.status !== "in_progress") {
    return { success: true, skipped: true };
  }

  const policy = getProctorEventPolicy(eventType, {
    deviceType:
      typeof metadata.device_type === "string"
        ? (metadata.device_type as StudentDeviceType)
        : null,
    displayMode:
      typeof metadata.display_mode === "string"
        ? (metadata.display_mode as ProctorDisplayMode)
        : null,
    proctoringMode:
      typeof metadata.proctoring_mode === "string"
        ? (metadata.proctoring_mode as ProctoringMode)
        : null,
  });
  const snapshotUrl =
    typeof metadata.snapshot_url === "string" ? metadata.snapshot_url : null;
  const source =
    typeof metadata.source === "string" ? metadata.source : "client";
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "record_proctor_event_atomic",
    {
      p_session_id: sessionId,
      p_event_type: eventType,
      p_metadata: metadata,
      p_severity: policy.severity,
      p_source: source,
      p_snapshot_url: snapshotUrl,
      p_derived_risk_delta: policy.riskDelta,
    },
  );

  if (!rpcError) {
    const result = (rpcResult ?? {}) as Record<string, unknown>;
    if (result.error) {
      return { error: String(result.error) };
    }
    if (result.skipped) {
      return { success: true, skipped: true };
    }

    return {
      success: true,
      riskDelta: policy.riskDelta,
      severity: policy.severity,
    };
  }

  if (rpcError.code === "42P01") {
    return { success: true, skipped: true };
  }

  if (!isRecordProctorEventRpcMissing(rpcError.code, rpcError.message)) {
    return { error: rpcError.message };
  }

  const { error } = await supabase.from("proctor_events").insert({
    session_id: sessionId,
    user_id: userId,
    event_type: eventType,
    metadata,
    severity: policy.severity,
    source,
    snapshot_url: snapshotUrl,
    derived_risk_delta: policy.riskDelta,
  });

  if (error) {
    if (error.code === "42P01") {
      return { success: true, skipped: true };
    }

    return { error: error.message };
  }

  const { data: currentSession } = await supabase
    .from("exam_sessions")
    .select(
      "risk_score, challenge_count, spot_check_count, flag_status, last_heartbeat_at"
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (currentSession) {
    const nextRiskScore =
      Number(currentSession.risk_score ?? 0) + Number(policy.riskDelta ?? 0);
    const nextRiskLevel = deriveRiskLevel(nextRiskScore);
    const nextFlagStatus: ProctorFlagStatus =
      shouldAutoFlag(nextRiskScore) ||
      eventType === "challenge_failed" ||
      eventType === "spot_check_failed" ||
      eventType === "identity_failed"
        ? "flagged"
        : ((currentSession.flag_status as ProctorFlagStatus | null) ?? "clear");

    const updates: Record<string, unknown> = {
      risk_score: nextRiskScore,
      risk_level: nextRiskLevel,
      flag_status: nextFlagStatus,
      last_heartbeat_at:
        eventType === "heartbeat_lost"
          ? currentSession.last_heartbeat_at
          : new Date().toISOString(),
    };

    if (eventType === "identity_verified") {
      updates.identity_verified_at = new Date().toISOString();
    }

    if (snapshotUrl) {
      updates.last_snapshot_at = new Date().toISOString();
    }

    if (eventType === "challenge_required" || eventType === "challenge_failed") {
      updates.challenge_count = Number(currentSession.challenge_count ?? 0) + 1;
    }

    if (
      eventType === "spot_check_required" ||
      eventType === "spot_check_passed" ||
      eventType === "spot_check_failed"
    ) {
      updates.last_spot_check_at = new Date().toISOString();
    }

    if (eventType === "spot_check_required") {
      updates.spot_check_count = Number(currentSession.spot_check_count ?? 0) + 1;
    }

    await supabase
      .from("exam_sessions")
      .update(updates)
      .eq("id", sessionId)
      .eq("user_id", userId);
  }

  return {
    success: true,
    riskDelta: policy.riskDelta,
    severity: policy.severity,
  };
}

export async function recordExamHeartbeat(
  sessionId: string,
  runtimeToken?: string | null,
) {
  const heartbeatStartedAt = Date.now();
  try {
    const verifiedToken = verifyStudentRuntimeToken(runtimeToken, sessionId);

    if (!verifiedToken) {
      const resolved = await resolveStudentRuntimeActionContext(
        sessionId,
        runtimeToken,
      );
      if ("error" in resolved) return resolved;

      const { supabase, userId } = resolved;

      const session = await getSessionMeta(supabase, sessionId, userId);
      if (!session) return { error: "Session олдсонгүй" };
      if (session.status !== "in_progress") {
        return { success: true, skipped: true };
      }
    }

    await redis.set(
      getSessionHeartbeatCacheKey(sessionId),
      new Date().toISOString(),
      {
        ex: 45,
      },
    );

    return { success: true };
  } finally {
    logStudentPerf("recordExamHeartbeat", heartbeatStartedAt, 150, {
      sessionId,
      usedRuntimeToken: Boolean(runtimeToken),
    });
  }
}

export async function getIdentityEnrollment() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("exam_identity_enrollments")
    .select("reference_image_data, reference_hash, updated_at")
    .eq("student_id", user.id)
    .maybeSingle();

  return data
    ? {
        referenceImageData: String(data.reference_image_data),
        referenceHash: String(data.reference_hash),
        updatedAt: String(data.updated_at),
      }
    : null;
}

export async function upsertIdentityEnrollment(
  referenceImageData: string,
  referenceHash: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("exam_identity_enrollments")
    .upsert(
      {
        student_id: user.id,
        reference_image_data: referenceImageData,
        reference_hash: referenceHash,
      },
      { onConflict: "student_id" }
    );

  if (error) return { error: error.message };
  return { success: true };
}

export async function updateSessionFlagStatus(
  sessionId: string,
  nextStatus: ProctorFlagStatus,
  reviewNote: string | null = null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, exam_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session олдсонгүй" };

  const scope = await getExamManagementScope(supabase, session.exam_id, user.id);
  if (!scope.canManage) return { error: "Энэ session-ийг шинэчлэх эрхгүй байна" };

  const { error } = await supabase
    .from("exam_sessions")
    .update({
      flag_status: nextStatus,
      review_note: reviewNote,
    })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  revalidatePath(`/educator/grading/${sessionId}`);
  revalidatePath(`/educator/exams/${session.exam_id}/results`);
  return { success: true };
}

export async function requestEssayReview(
  answerId: string,
  reason?: string | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: answer } = await supabase
    .from("answers")
    .select(
      "id, session_id, question_id, score_source, review_status, exam_sessions!inner(id, exam_id, user_id, status, total_score, max_score, attempt_number, started_at, submitted_at), questions!inner(type)",
    )
    .eq("id", answerId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!answer) {
    return { error: "Review request илгээх хариулт олдсонгүй" };
  }

  const session = getRelationObject(
    answer.exam_sessions as
      | {
          id: string;
          exam_id: string;
          user_id: string;
          status: string;
          total_score: number | null;
          max_score: number | null;
          attempt_number: number | null;
          started_at: string | null;
          submitted_at: string | null;
        }
      | {
          id: string;
          exam_id: string;
          user_id: string;
          status: string;
          total_score: number | null;
          max_score: number | null;
          attempt_number: number | null;
          started_at: string | null;
          submitted_at: string | null;
        }[]
      | null,
  );
  const question = getRelationObject(
    answer.questions as { type: string } | { type: string }[] | null,
  );

  if (!session || !question || question.type !== "essay") {
    return { error: "Зөвхөн essay хариултад report request илгээнэ" };
  }

  const reviewStatus = normalizeAnswerReviewStatus(answer.review_status);
  if (reviewStatus !== "none") {
    return { error: "Энэ essay-д review request аль хэдийн үүссэн байна" };
  }

  if (normalizeAnswerScoreSource(answer.score_source) !== "ai") {
    return { error: "Зөвхөн AI үнэлсэн essay-д report request илгээнэ" };
  }

  const effectiveExam = await getEffectiveExamAccessForStudent(
    supabase,
    user.id,
    String(session.exam_id),
    toStudentAttemptSummary(session),
  );
  if (!effectiveExam?.can_view_results) {
    return { error: "Үр дүн харах боломж нээгдсэний дараа report илгээнэ" };
  }
  if (isSessionScorePending(session)) {
    return { error: "Үр дүн боловсруулагдаж дууссаны дараа report илгээнэ" };
  }

  const admin = createAdminClient();
  const trimmedReason = String(reason ?? "").trim();
  const { data: updatedAnswer, error: updateError } = await admin
    .from("answers")
    .update({
      review_status: "requested",
      review_requested_at: new Date().toISOString(),
      review_reason: trimmedReason.length > 0 ? trimmedReason : null,
      review_resolved_at: null,
    })
    .eq("id", answerId)
    .eq("user_id", user.id)
    .eq("review_status", "none")
    .eq("score_source", "ai")
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { error: updateError.message };
  }
  if (!updatedAnswer) {
    return { error: "Review request үүсгэх боломжгүй байна. Дахин оролдоно уу." };
  }

  const [{ data: examRow }, { data: profileRow }] = await Promise.all([
    admin.from("exams").select("title").eq("id", session.exam_id).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  if (examRow) {
    notifyTeachersOfEssayReviewRequest({
      examId: String(session.exam_id),
      examTitle: String(examRow.title),
      studentName: profileRow?.full_name || "Сурагч",
      sessionId: String(session.id),
      answerId,
    }).catch(() => {});
  }

  revalidateStudentResultPaths(String(session.exam_id));
  revalidateEducatorReviewPaths(String(session.id));

  return { success: true };
}

/**
 * Шалгалтын үр дүнг DB-ээс авах (URL param биш)
 */
export async function getExamResult(examId: string) {
  const getExamResultStartedAt = Date.now();
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const sessionSelect =
      "id, status, started_at, total_score, max_score, submitted_at, attempt_number, exam_id, exams(title, passing_score)";
    const { data: initialSessions, error: sessionError } = await supabase
      .from("exam_sessions")
      .select(sessionSelect)
      .eq("exam_id", examId)
      .eq("user_id", user.id)
      .in("status", ["in_progress", "submitted", "graded", "timed_out"])
      .order("attempt_number", { ascending: false });

    if (sessionError) {
      console.error("[getExamResult] session query error:", sessionError.message);
      return null;
    }

    let sessions = initialSessions ?? [];
    let latestSession = pickLatestAttempt(sessions);
    if (!latestSession) return null;

    if (latestSession.status === "in_progress") {
      const exam = await getEffectiveExamAccessForStudent(
        supabase,
        user.id,
        examId,
        toStudentAttemptSummary(latestSession),
      );
      if (!exam) return null;

      if (!isSessionExpiredForExam(latestSession.started_at ?? null, exam)) {
        return null;
      }

      const finalized = await finalizeSessionAttempt(supabase, {
        sessionId: latestSession.id,
        examId,
        userId: user.id,
        reason: "timeout",
        skipPostFinalizeSideEffects: true,
      });

      if ("error" in finalized) {
        console.error("[getExamResult] finalize timeout error:", finalized.error);
        return null;
      }

      const { data: refreshedSessions, error: refreshedSessionError } =
        await supabase
          .from("exam_sessions")
          .select(sessionSelect)
          .eq("exam_id", examId)
          .eq("user_id", user.id)
          .in("status", ["in_progress", "submitted", "graded", "timed_out"])
          .order("attempt_number", { ascending: false });

      if (refreshedSessionError) {
        console.error(
          "[getExamResult] refreshed session query error:",
          refreshedSessionError.message
        );
        return null;
      }

      sessions = refreshedSessions ?? [];
      latestSession = pickLatestAttempt(sessions);
      if (!latestSession) return null;
    }

    const effectiveExam = await getEffectiveExamAccessForStudent(
      supabase,
      user.id,
      examId,
      toStudentAttemptSummary(latestSession),
    );
    if (!effectiveExam) {
      return null;
    }

    if (effectiveExam.is_result_released) {
      const latestPendingReleasedSession = pickLatestAttempt(
        sessions.filter(
          (session) =>
            isFinalizedAttemptStatus(String(session.status ?? "")) &&
            isSessionScorePending(session),
        ),
      );

      const materialized = latestPendingReleasedSession
        ? await materializeSessionScoresIfNeeded(admin, {
            sessionId: String(latestPendingReleasedSession.id),
            examId,
            userId: user.id,
            skipSideEffects: true,
          })
        : null;

      if (materialized && "error" in materialized) {
        console.error(
          "[getExamResult] materialize released session error:",
          materialized.error,
        );
        // Refresh sessions even on error — a prior run may have already set total_score
        const { data: refreshedAfterError } = await supabase
          .from("exam_sessions")
          .select(sessionSelect)
          .eq("exam_id", examId)
          .eq("user_id", user.id)
          .in("status", ["in_progress", "submitted", "graded", "timed_out"])
          .order("attempt_number", { ascending: false });
        if (refreshedAfterError) {
          sessions = refreshedAfterError;
          latestSession = pickLatestAttempt(sessions) ?? latestSession;
        }
      } else if (materialized && !materialized.gradingPending) {
        const { data: refreshedSessions, error: refreshedSessionError } =
          await supabase
            .from("exam_sessions")
            .select(sessionSelect)
            .eq("exam_id", examId)
            .eq("user_id", user.id)
            .in("status", ["in_progress", "submitted", "graded", "timed_out"])
            .order("attempt_number", { ascending: false });

        if (refreshedSessionError) {
          console.error(
            "[getExamResult] refreshed session query error:",
            refreshedSessionError.message,
          );
          return null;
        }

        sessions = refreshedSessions ?? [];
        latestSession = pickLatestAttempt(sessions);
        if (!latestSession) return null;
      }
    }

    const finalizedSessions = sessions.filter((session) =>
      isFinalizedAttemptStatus(String(session.status ?? ""))
    );
    const bestSession = pickBestAttempt(finalizedSessions);
    if (!bestSession) {
      return null;
    }

    const canViewDetailedFeedback = Boolean(effectiveExam.can_view_results);

    if (!canViewDetailedFeedback) {
      return {
        ...bestSession,
        answers: [],
        best_attempt_number: Number(bestSession.attempt_number ?? 0),
        latest_attempt_number: Number(latestSession.attempt_number ?? 0),
        can_view_detailed_feedback: false,
        can_attempt_again: canAttemptExamAgain(effectiveExam.myLifecycleStatus),
        can_view_results: false,
        result_release_at: effectiveExam.result_release_at,
        grading_pending: isSessionScorePending(bestSession),
        has_pending_review: false,
        result_locked_reason: effectiveExam.result_locked_reason,
      };
    }

    const snapshot = await getStoredPublishedExamSnapshot(supabase, examId);
    const snapshotQuestionMap = getSnapshotQuestionMap(snapshot);

    const [{ data: answers }, { data: questions }, questionVariantMap] =
      await Promise.all([
        supabase
          .from("answers")
          .select(
            "id, question_id, answer, score, is_correct, feedback, ai_score, ai_feedback, score_source, review_status, review_requested_at, review_reason, review_resolved_at, questions(id, type, content, content_html, image_url, options, correct_answer, points, order_index, explanation)"
          )
          .eq("session_id", bestSession.id)
          .order("questions(order_index)", { ascending: true }),
        snapshot
          ? Promise.resolve({
              data: snapshot.questions.map((question) => ({
                id: question.id,
                type: question.type,
                content: question.content,
                content_html: question.content_html,
                image_url: question.image_url,
                options: question.options,
                correct_answer: question.correct_answer,
                points: question.points,
                order_index: question.order_index,
                explanation: question.explanation,
              })),
            })
          : supabase
              .from("questions")
              .select(
                "id, type, content, content_html, image_url, options, correct_answer, points, order_index, explanation"
              )
              .eq("exam_id", examId)
              .order("order_index", { ascending: true }),
        getSessionQuestionVariantMap(supabase, bestSession.id),
      ]);

    const answerMap = new Map<
      string,
      {
        id: string;
        question_id: string;
        answer: string | null;
        score: number | null;
        is_correct: boolean | null;
        feedback: string | null;
        ai_score: number | null;
        ai_feedback: string | null;
        score_source: AnswerScoreSource;
        review_status: AnswerReviewStatus;
        review_requested_at: string | null;
        review_reason: string | null;
        review_resolved_at: string | null;
        can_request_review: boolean;
        questions: Record<string, unknown> | null;
      }
    >();

    for (const answer of answers ?? []) {
      const questionId = String(answer.question_id);
      const snapshotQuestion = snapshotQuestionMap.get(questionId);
      const baseQuestion =
        ((snapshotQuestion as unknown) as Record<string, unknown> | null) ??
        (getRelationObject(
          answer.questions as
            | Record<string, unknown>
            | Record<string, unknown>[]
            | null
        ) as Record<string, unknown> | null);
      const questionWithVariant = baseQuestion
        ? (applyStoredVariantToQuestion(
            baseQuestion as {
              type: string;
              content: string;
              content_html: string | null;
              image_url: string | null;
              options: string[] | null;
              correct_answer?: string | null;
              explanation?: string | null;
            },
            questionVariantMap.get(questionId)
          ) as unknown as Record<string, unknown>)
        : null;

      answerMap.set(questionId, {
        id: String(answer.id),
        question_id: questionId,
        answer: (answer.answer as string | null) ?? null,
        score: (answer.score as number | null) ?? null,
        is_correct: (answer.is_correct as boolean | null) ?? null,
        feedback: (answer.feedback as string | null) ?? null,
        ai_score: (answer.ai_score as number | null) ?? null,
        ai_feedback: (answer.ai_feedback as string | null) ?? null,
        score_source: normalizeAnswerScoreSource(answer.score_source),
        review_status: normalizeAnswerReviewStatus(answer.review_status),
        review_requested_at:
          (answer.review_requested_at as string | null) ?? null,
        review_reason: (answer.review_reason as string | null) ?? null,
        review_resolved_at:
          (answer.review_resolved_at as string | null) ?? null,
        can_request_review: canRequestEssayReview({
          questionType: String(questionWithVariant?.type ?? ""),
          scoreSource: normalizeAnswerScoreSource(answer.score_source),
          reviewStatus: normalizeAnswerReviewStatus(answer.review_status),
          canViewResults: canViewDetailedFeedback,
          gradingPending: isSessionScorePending(bestSession),
        }),
        questions: questionWithVariant,
      });
    }

    const fullBreakdown = (questions ?? []).map((question) => {
      const questionId = String(question.id);
      const existingAnswer = answerMap.get(questionId);

      if (existingAnswer) {
        return existingAnswer;
      }

      return {
        id: `missing:${questionId}`,
        question_id: questionId,
        answer: null,
        score: 0,
        is_correct: null,
        feedback: null,
        ai_score: null,
        ai_feedback: null,
        score_source: "objective" as const,
        review_status: "none" as const,
        review_requested_at: null,
        review_reason: null,
        review_resolved_at: null,
        can_request_review: false,
        questions: applyStoredVariantToQuestion(
          ((((snapshotQuestionMap.get(questionId) ?? null) as unknown) as
            | Record<string, unknown>
            | null) ?? ((question as unknown) as Record<string, unknown>)) as {
            type: string;
            content: string;
            content_html: string | null;
            image_url: string | null;
            options: string[] | null;
            correct_answer?: string | null;
            explanation?: string | null;
          },
          questionVariantMap.get(questionId)
        ) as unknown as Record<string, unknown>,
      };
    });

    const hasPendingReview = fullBreakdown.some(
      (answer) => answer.review_status === "requested",
    );

    return {
      ...bestSession,
      answers: fullBreakdown,
      best_attempt_number: Number(bestSession.attempt_number ?? 0),
      latest_attempt_number: Number(latestSession.attempt_number ?? 0),
      can_view_detailed_feedback: true,
      can_attempt_again: false,
      can_view_results: true,
      result_release_at: effectiveExam.result_release_at,
      grading_pending: isSessionScorePending(bestSession),
      has_pending_review: hasPendingReview,
      result_locked_reason: null,
    };
  } finally {
    logStudentPerf("getExamResult", getExamResultStartedAt, 300, {
      examId,
      userId: user.id,
    });
  }
}

/**
 * Оюутны шалгалтын үр дүн авах
 */
export async function getStudentResults() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const materialized = await materializePendingReleasedSessionsForUser(
    admin,
    user.id,
    {
      maxToProcess: 2,
      skipSideEffects: true,
    },
  );
  if ("error" in materialized) {
    console.error(
      "[getStudentResults] materialize released sessions error:",
      materialized.error,
    );
  }

  const { data } = await supabase
    .from("exam_sessions")
    .select(
      "id, exam_id, status, total_score, max_score, submitted_at, started_at, attempt_number, exams(title, passing_score)"
    )
    .eq("user_id", user.id)
    .in("status", ["submitted", "graded", "timed_out"])
    .order("submitted_at", { ascending: false });

  const sessions = data ?? [];
  const sessionsByExam = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const examSessions = sessionsByExam.get(String(session.exam_id)) ?? [];
    examSessions.push(session);
    sessionsByExam.set(String(session.exam_id), examSessions);
  }

  const latestSessionMap = new Map<string, StudentExamAttemptSummary>();
  for (const [examId, examSessions] of sessionsByExam.entries()) {
    const latestSession = pickLatestAttempt(examSessions);
    if (!latestSession) continue;
    const latestSessionSummary = toStudentAttemptSummary(latestSession);
    if (latestSessionSummary) {
      latestSessionMap.set(examId, latestSessionSummary);
    }
  }

  const accessContext = await loadStudentExamAccessContext(supabase, user.id, {
    examIds: Array.from(sessionsByExam.keys()),
    includeLatestSessions: false,
    latestSessionMap,
  });

  const results = await Promise.all(
    Array.from(sessionsByExam.values()).map(async (examSessions) => {
      const bestSession = pickBestAttempt(examSessions);
      if (!bestSession) return null;
      const latestSessionSummary = toStudentAttemptSummary(
        pickLatestAttempt(examSessions),
      );

      const effectiveExam =
        accessContext.accessMap.get(String(bestSession.exam_id)) ??
        (await getEffectiveExamAccessForStudent(
          supabase,
          user.id,
          String(bestSession.exam_id),
          latestSessionSummary,
          accessContext,
        ));

      return {
        ...bestSession,
        can_view_results: Boolean(effectiveExam?.can_view_results),
        result_release_at: effectiveExam?.result_release_at ?? null,
        grading_pending: isSessionScorePending(bestSession),
        result_locked_reason: effectiveExam?.result_locked_reason ?? null,
      };
    }),
  );

  return results
    .filter((session): session is NonNullable<typeof session> => Boolean(session))
    .sort((left, right) => {
      const leftTime = new Date(
        String(left.submitted_at ?? left.started_at ?? 0)
      ).getTime();
      const rightTime = new Date(
        String(right.submitted_at ?? right.started_at ?? 0)
      ).getTime();

      return rightTime - leftTime;
    });
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
  return getSessionAnswersForUser(supabase, sessionId, user.id);
}
