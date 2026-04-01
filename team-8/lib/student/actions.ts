"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  examBurstRateLimit,
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
  applyStoredVariantToQuestion,
  ensureSessionFixedQuestionVariants,
  ensureSessionQuestionVariants,
  getSessionQuestionVariantMap,
  isQuestionVariantSchemaMissing,
  type StoredQuestionVariant,
} from "@/lib/question-variants";
import {
  deriveStudentExamLifecycle,
  getEffectiveExamAccess,
  getSessionDeadlineMs,
  type RecipientAccessOverride,
} from "@/lib/exam-session-lifecycle";
import { notifyTeacherOfSubmission } from "@/lib/notification/actions";
import { getExamManagementScope } from "@/lib/exam-scope";
import {
  isFinalizedAttemptStatus,
  pickBestAttempt,
  pickLatestAttempt,
} from "@/lib/exam-attempt-utils";
import { enqueueStudentTopicMasteryRefresh } from "@/lib/student-learning/actions";
import { attachPassagesToQuestions } from "@/lib/question-passages";
import {
  DEFAULT_PROCTORING_SETTINGS,
  deriveRiskLevel,
  getEffectiveDevicePolicy,
  getProctorEventPolicy,
  type AnswerChangeAnalytics,
  type DevicePolicy,
  type EvidenceMode,
  type ProctorDisplayMode,
  type ProctorEventType,
  type ProctorFlagStatus,
  type ProctoringMode,
  type StudentDeviceType,
  shouldAutoFlag,
  isStrictProctoredExam,
} from "@/lib/proctoring";
import type { AiQuestionVariantMode, QuestionType } from "@/types";
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type SupabaseActionClient = Pick<SupabaseServerClient, "from" | "rpc">;
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
  proctoring_mode,
  device_policy,
  require_fullscreen,
  require_camera,
  identity_verification,
  evidence_mode,
  post_exam_similarity_enabled,
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
  proctoring_mode: ProctoringMode;
  device_policy: DevicePolicy;
  require_fullscreen: boolean;
  require_camera: boolean;
  identity_verification: boolean;
  evidence_mode: EvidenceMode;
  post_exam_similarity_enabled: boolean;
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

type AssignedExamAccessRow = Omit<AssignedExamRow, "exams">;

type StudentExamAttemptSummary = {
  status: string | null;
  attemptNumber: number;
  startedAt: string | null;
};

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

export type StudentAssignedExam = StudentExamBase & {
  mySessionStatus: string | null;
  myLifecycleStatus: string;
  myLifecycleLabel: string;
  hasRetakeOverride: boolean;
  isExcused: boolean;
  status_note: string | null;
};

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

function normalizeProctoringSettings(
  exam: Partial<StudentExamBase> | Record<string, unknown> | null | undefined
) {
  return {
    proctoring_mode:
      (exam?.proctoring_mode as ProctoringMode | undefined) ??
      DEFAULT_PROCTORING_SETTINGS.proctoring_mode,
    device_policy:
      (exam?.device_policy as DevicePolicy | undefined) ??
      DEFAULT_PROCTORING_SETTINGS.device_policy,
    require_fullscreen:
      typeof exam?.require_fullscreen === "boolean"
        ? exam.require_fullscreen
        : DEFAULT_PROCTORING_SETTINGS.require_fullscreen,
    require_camera:
      typeof exam?.require_camera === "boolean"
        ? exam.require_camera
        : DEFAULT_PROCTORING_SETTINGS.require_camera,
    identity_verification:
      typeof exam?.identity_verification === "boolean"
        ? exam.identity_verification
        : DEFAULT_PROCTORING_SETTINGS.identity_verification,
    evidence_mode:
      (exam?.evidence_mode as EvidenceMode | undefined) ??
      DEFAULT_PROCTORING_SETTINGS.evidence_mode,
    post_exam_similarity_enabled:
      typeof exam?.post_exam_similarity_enabled === "boolean"
        ? exam.post_exam_similarity_enabled
        : DEFAULT_PROCTORING_SETTINGS.post_exam_similarity_enabled,
  };
}

function getSessionAnswersCacheKey(sessionId: string, userId: string) {
  return `session:${sessionId}:user:${userId}:answers`;
}

function getSessionAnswerMetaCacheKey(sessionId: string, userId: string) {
  return `session:${sessionId}:user:${userId}:answer-meta`;
}

function getSessionMetaCacheKey(sessionId: string, userId: string) {
  return `session:${sessionId}:user:${userId}:meta`;
}

function getSessionHeartbeatCacheKey(sessionId: string) {
  return `heartbeat:session:${sessionId}`;
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

async function getAssignedPublishedExamRows(
  supabase: SupabaseActionClient,
  userId: string,
  examId?: string
) {
  let recipientQuery = supabase
    .from("exam_recipients")
    .select(
      "exam_id, access_start_time, access_end_time, max_attempts_override, excused_at, status_note"
    )
    .eq("student_id", userId);

  if (examId) {
    recipientQuery = recipientQuery.eq("exam_id", examId);
  }

  const { data: recipientRows } = await recipientQuery;
  const baseRows = ((recipientRows ?? []) as unknown) as AssignedExamAccessRow[];
  if (baseRows.length === 0) return [];

  const examIds = [...new Set(baseRows.map((row) => row.exam_id))];
  const { data: exams } = await supabase
    .from("exams")
    .select(STUDENT_EXAM_SELECT)
    .eq("is_published", true)
    .in("id", examIds);

  const examMap = new Map<string, StudentExamBase>(
    ((exams ?? []) as StudentExamBase[]).map((exam) => [String(exam.id), exam])
  );

  const hydratedRows: AssignedExamRow[] = [];
  for (const row of baseRows) {
    const exam = examMap.get(String(row.exam_id));
    if (!exam) continue;
    hydratedRows.push({
      ...row,
      exams: exam,
    });
  }

  return hydratedRows;
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
      duration_minutes: Number(examRecord.duration_minutes ?? 0),
      max_attempts: Number(examRecord.max_attempts ?? 1),
    },
    row as RecipientAccessOverride
  );
  const lifecycle = deriveStudentExamLifecycle({
    exam: {
      start_time: String(examRecord.start_time),
      end_time: String(examRecord.end_time),
      duration_minutes: Number(examRecord.duration_minutes ?? 0),
      max_attempts: Number(examRecord.max_attempts ?? 1),
    },
    recipient: row,
    latestSessionStatus: latestSession?.status ?? null,
    latestAttemptNumber: latestSession?.attemptNumber ?? 0,
    latestSessionStartedAt: latestSession?.startedAt ?? null,
  });
  const proctoringSettings = normalizeProctoringSettings(examRecord);

  return {
    ...examRecord,
    start_time: examAccess.effectiveStartTime,
    end_time: examAccess.effectiveEndTime,
    max_attempts: examAccess.effectiveMaxAttempts,
    ...proctoringSettings,
    mySessionStatus: latestSession?.status ?? null,
    myLifecycleStatus: lifecycle.key,
    myLifecycleLabel: lifecycle.label,
    hasRetakeOverride: examAccess.hasRetakeOverride,
    isExcused: examAccess.isExcused,
    status_note: row.status_note ?? null,
  };
}

async function getAssignedPublishedExamRecord(
  supabase: SupabaseActionClient,
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

async function getEffectiveExamAccessForStudent(
  supabase: SupabaseActionClient,
  userId: string,
  examId: string
) {
  const assignedExam = await getAssignedPublishedExamRecord(
    supabase,
    userId,
    examId
  );
  if (assignedExam?.exam) {
    return assignedExam.exam;
  }

  const { data: exam } = await supabase
    .from("exams")
    .select(STUDENT_EXAM_SELECT)
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return null;

  const { data: recipient } = await supabase
    .from("exam_recipients")
    .select(
      "access_start_time, access_end_time, max_attempts_override, excused_at, status_note"
    )
    .eq("exam_id", examId)
    .eq("student_id", userId)
    .maybeSingle();

  const access = getEffectiveExamAccess(
    {
      start_time: String(exam.start_time),
      end_time: String(exam.end_time),
      duration_minutes: Number(exam.duration_minutes ?? 0),
      max_attempts: Number(exam.max_attempts ?? 1),
    },
    (recipient ?? {}) as RecipientAccessOverride
  );

  return {
    ...(exam as StudentExamBase),
    start_time: access.effectiveStartTime,
    end_time: access.effectiveEndTime,
    max_attempts: access.effectiveMaxAttempts,
    ...normalizeProctoringSettings(exam as Partial<StudentExamBase>),
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

function toStudentAttemptSummary(
  session:
    | {
        status?: string | null;
        attempt_number?: number | null;
        started_at?: string | null;
      }
    | null
    | undefined
): StudentExamAttemptSummary | null {
  if (!session) return null;

  return {
    status: (session.status as string | null) ?? null,
    attemptNumber: Number(session.attempt_number ?? 0),
    startedAt: (session.started_at as string | null) ?? null,
  };
}

function canAttemptExamAgain(lifecycleStatus: string | null | undefined) {
  return ["available", "retake_available", "retake_scheduled"].includes(
    String(lifecycleStatus ?? "")
  );
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

function isFinalizeExamSessionAtomicMissing(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}) {
  const normalized = `${String(error.message ?? "")} ${String(
    error.details ?? ""
  )}`.toLowerCase();

  return (
    error.code === "42883" ||
    (normalized.includes("finalize_exam_session_atomic") &&
      (normalized.includes("could not find the function") ||
        normalized.includes("does not exist") ||
        normalized.includes("schema cache")))
  );
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
    return;
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

    await ensureSessionFixedQuestionVariants(supabase, {
      sessionId,
      userId,
      questions,
      variantSlot: fixedVariantSlot,
    });

    await ensureSessionQuestionVariants(supabase, {
      sessionId,
      userId,
      questions,
    });
  } catch (error) {
    console.error("[question-variants] ensure failed", error);
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

  const rows = await getAssignedPublishedExamRows(supabase, user.id);
  if (rows.length === 0) return [];

  // Хамгийн сүүлийн session status-г нэмэх
  const { data: sessions } = await supabase
    .from("exam_sessions")
    .select("exam_id, status, attempt_number, started_at")
    .eq("user_id", user.id)
    .in("exam_id", rows.map((row) => row.exam_id))
    .order("attempt_number", { ascending: false });

  const sessionMap = new Map<string, StudentExamAttemptSummary>();
  for (const s of sessions ?? []) {
    if (!sessionMap.has(s.exam_id as string)) {
      sessionMap.set(s.exam_id as string, {
        status: s.status as string,
        attemptNumber: Number(s.attempt_number ?? 0),
        startedAt: (s.started_at as string | null) ?? null,
      });
    }
  }

  return rows
    .map((row) =>
      mergeAssignedExamAccess(row, sessionMap.get(String(row.exam_id)) ?? null)
    )
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

async function finalizeSessionAttemptFallback(
  supabase: SupabaseActionClient,
  {
    sessionId,
    examId,
    userId,
    reason,
    answersPayload,
  }: {
    sessionId: string;
    examId: string;
    userId: string;
    reason: FinalizeSessionReason;
    answersPayload: FinalizeAnswerPayload[];
  }
) {
  const lockKey = getSubmitSessionLockKey(sessionId, userId);
  const lockAcquired = await redis.set(lockKey, "1", {
    ex: 30,
    nx: true,
  });

  if (!lockAcquired) {
    const { data: lockedSession } = await supabase
      .from("exam_sessions")
      .select("status, total_score, max_score")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (lockedSession && lockedSession.status !== "in_progress") {
      const totalScore = Number(lockedSession.total_score ?? 0);
      const maxScore = Number(lockedSession.max_score ?? 0);
      return {
        success: true as const,
        finalStatus: String(lockedSession.status),
        totalScore,
        maxScore,
        percentage: getPercentage(totalScore, maxScore),
      };
    }

    return { error: "Шалгалтыг илгээж байна. Дахин оролдоно уу." };
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from("exam_sessions")
      .select("id, status, total_score, max_score")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (sessionError) return { error: sessionError.message };
    if (!session) return { error: "Session олдсонгүй" };

    if (session.status !== "in_progress") {
      const totalScore = Number(session.total_score ?? 0);
      const maxScore = Number(session.max_score ?? 0);
      return {
        success: true as const,
        finalStatus: String(session.status),
        totalScore,
        maxScore,
        percentage: getPercentage(totalScore, maxScore),
      };
    }

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
        { onConflict: "session_id,question_id" }
      );

      if (answerUpsertError) return { error: answerUpsertError.message };
    }

    const [questionContext, answerRowsResult, questionVariantMap] =
      await Promise.all([
        loadFinalizeQuestionContext(supabase, examId),
        supabase
          .from("answers")
          .select(
            "question_id, answer, score, first_answered_at, last_changed_at, change_count"
          )
          .eq("session_id", sessionId),
        getSessionQuestionVariantMap(supabase as SupabaseServerClient, sessionId),
      ]);

    if ("error" in questionContext) return { error: questionContext.error };
    if (answerRowsResult.error) return { error: answerRowsResult.error.message };

    let totalScore = 0;
    const gradedAnswerRows = (answerRowsResult.data ?? [])
      .map((answerRow) => {
        const baseQuestion = questionContext.questionMap.get(
          String(answerRow.question_id)
        );
        if (!baseQuestion) return null;

        const effectiveQuestion = applyStoredVariantToQuestion(
          baseQuestion,
          questionVariantMap.get(String(answerRow.question_id))
        );
        const graded = gradeAnswerForFinalize(
          effectiveQuestion,
          String(answerRow.answer ?? ""),
          Number(answerRow.score ?? 0)
        );

        totalScore += graded.score;

        return {
          session_id: sessionId,
          question_id: String(answerRow.question_id),
          user_id: userId,
          answer: String(answerRow.answer ?? ""),
          first_answered_at: answerRow.first_answered_at,
          last_changed_at: answerRow.last_changed_at,
          change_count: Number(answerRow.change_count ?? 0),
          is_correct: graded.isCorrect,
          score: graded.score,
        };
      })
      .filter(
        (
          row
        ): row is {
          session_id: string;
          question_id: string;
          user_id: string;
          answer: string;
          first_answered_at: string | null;
          last_changed_at: string | null;
          change_count: number;
          is_correct: boolean | null;
          score: number;
        } => Boolean(row)
      );

    if (gradedAnswerRows.length > 0) {
      const { error: gradedUpsertError } = await supabase.from("answers").upsert(
        gradedAnswerRows,
        { onConflict: "session_id,question_id" }
      );

      if (gradedUpsertError) return { error: gradedUpsertError.message };
    }

    const finalStatus = questionContext.hasEssay
      ? "submitted"
      : reason === "timeout"
        ? "timed_out"
        : "graded";

    const { error: sessionUpdateError } = await supabase
      .from("exam_sessions")
      .update({
        status: finalStatus,
        submitted_at: new Date().toISOString(),
        total_score: totalScore,
        max_score: questionContext.maxScore,
      })
      .eq("id", sessionId)
      .eq("status", "in_progress");

    if (sessionUpdateError) return { error: sessionUpdateError.message };

    return {
      success: true as const,
      finalStatus,
      totalScore,
      maxScore: questionContext.maxScore,
      percentage: getPercentage(totalScore, questionContext.maxScore),
    };
  } finally {
    await redis.del(lockKey);
  }
}

async function finalizeSessionAttempt(
  supabase: SupabaseActionClient,
  {
    sessionId,
    examId,
    userId,
    reason,
    skipPostFinalizeSideEffects = false,
  }: {
    sessionId: string;
    examId: string;
    userId: string;
    reason: FinalizeSessionReason;
    skipPostFinalizeSideEffects?: boolean;
  }
) {
  // 1. Redis-аас хариултуудыг pipeline-аар авах
  const redisKey = getSessionAnswersCacheKey(sessionId, userId);
  const analyticsKey = getSessionAnswerMetaCacheKey(sessionId, userId);

  const fetchPipe = redis.pipeline();
  fetchPipe.hgetall(redisKey);
  fetchPipe.hgetall(analyticsKey);
  const [redisAnswers, redisAnswerMeta] = (await fetchPipe.exec()) as [
    Record<string, string> | null,
    Record<string, string> | null,
  ];

  // 2. Хариултуудыг JSONB array болгох (RPC-д дамжуулахад бэлэн)
  const answersPayload: FinalizeAnswerPayload[] = [];

  if (redisAnswers && Object.keys(redisAnswers).length > 0) {
    for (const [questionId, answer] of Object.entries(redisAnswers)) {
      let firstAnsweredAt: string | null = null;
      let lastChangedAt: string | null = null;
      let changeCount = 0;

      const rawAnalytics = redisAnswerMeta?.[questionId];
      if (typeof rawAnalytics === "string") {
        try {
          const parsed = JSON.parse(rawAnalytics) as AnswerChangeAnalytics;
          firstAnsweredAt =
            typeof parsed.firstAnsweredAt === "string"
              ? parsed.firstAnsweredAt
              : null;
          lastChangedAt =
            typeof parsed.lastChangedAt === "string"
              ? parsed.lastChangedAt
              : null;
          changeCount = Number(parsed.changeCount ?? 0);
        } catch {
          // ignore parse errors
        }
      }

      answersPayload.push({
        question_id: questionId,
        answer: String(answer),
        first_answered_at: firstAnsweredAt,
        last_changed_at: lastChangedAt,
        change_count: changeCount,
      });
    }
  }

  // 3. Нэг RPC дуудлагаар бүх зүйлийг хийх (lock + flush + grade + update)
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "finalize_exam_session_atomic",
    {
      p_session_id: sessionId,
      p_user_id: userId,
      p_answers: answersPayload,
      p_reason: reason === "timeout" ? "timed_out" : "submitted",
    }
  );

  if (rpcError) {
    if (isFinalizeExamSessionAtomicMissing(rpcError)) {
      const fallbackResult = await finalizeSessionAttemptFallback(supabase, {
        sessionId,
        examId,
        userId,
        reason,
        answersPayload,
      });

      if ("error" in fallbackResult) return fallbackResult;

      const cleanupPipe = redis.pipeline();
      cleanupPipe.del(redisKey);
      cleanupPipe.del(analyticsKey);
      cleanupPipe.set(
        getSessionMetaCacheKey(sessionId, userId),
        JSON.stringify({ id: sessionId, status: fallbackResult.finalStatus }),
        { ex: 600 }
      );
      await cleanupPipe.exec();

      if (skipPostFinalizeSideEffects) {
        return fallbackResult;
      }

      revalidatePath("/student");
      revalidatePath("/student/exams");
      revalidatePath("/student/results");
      revalidatePath("/student/schedule");
      revalidatePath("/student/learning");
      revalidatePath(`/student/exams/${examId}/result`);

      if (
        fallbackResult.finalStatus === "submitted" ||
        fallbackResult.finalStatus === "graded"
      ) {
        const [{ data: examRow }, { data: profileRow }] = await Promise.all([
          supabase.from("exams").select("title").eq("id", examId).maybeSingle(),
          supabase
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .maybeSingle(),
        ]);
        if (examRow) {
          notifyTeacherOfSubmission(
            examId,
            examRow.title,
            profileRow?.full_name || "Сурагч",
            sessionId
          ).catch(() => {});
        }
      }

      if (
        fallbackResult.finalStatus === "graded" ||
        fallbackResult.finalStatus === "timed_out"
      ) {
        enqueueStudentTopicMasteryRefresh(userId, null).catch(() => {});
      }

      return fallbackResult;
    }

    return { error: rpcError.message };
  }

  const result = rpcResult as {
    success: boolean;
    already_finalized?: boolean;
    error?: string;
    final_status: string;
    total_score: number;
    max_score: number;
  };

  if (!result.success) return { error: result.error ?? "Finalize амжилтгүй" };

  const totalScore = Number(result.total_score ?? 0);
  const maxScore = Number(result.max_score ?? 0);
  const finalStatus = result.final_status;

  // 4. Redis cleanup (pipeline)
  const cleanupPipe = redis.pipeline();
  cleanupPipe.del(redisKey);
  cleanupPipe.del(analyticsKey);
  cleanupPipe.set(
    getSessionMetaCacheKey(sessionId, userId),
    JSON.stringify({ id: sessionId, status: finalStatus }),
    { ex: 600 }
  );
  await cleanupPipe.exec();

  if (skipPostFinalizeSideEffects) {
    return {
      success: true as const,
      finalStatus,
      totalScore,
      maxScore,
      percentage: getPercentage(totalScore, maxScore),
    };
  }

  // 5. Side effects (fire-and-forget)
  revalidatePath("/student");
  revalidatePath("/student/exams");
  revalidatePath("/student/results");
  revalidatePath("/student/schedule");
  revalidatePath("/student/learning");
  revalidatePath(`/student/exams/${examId}/result`);

  if (finalStatus === "submitted" || finalStatus === "graded") {
    const [{ data: examRow }, { data: profileRow }] = await Promise.all([
      supabase.from("exams").select("title").eq("id", examId).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    if (examRow) {
      notifyTeacherOfSubmission(
        examId,
        examRow.title,
        profileRow?.full_name || "Сурагч",
        sessionId
      ).catch(() => {});
    }
  }

  if (finalStatus === "graded" || finalStatus === "timed_out") {
    enqueueStudentTopicMasteryRefresh(userId, null).catch(() => {});
  }

  return {
    success: true as const,
    finalStatus,
    totalScore,
    maxScore,
    percentage: getPercentage(totalScore, maxScore),
  };
}

async function startExamSessionForUser(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string,
  assignedExam?: NonNullable<
    Awaited<ReturnType<typeof getAssignedPublishedExamRecord>>
  >
) {
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
      await cacheSessionMeta(String(session.id), userId, String(session.status));
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
    await cacheSessionMeta(String(session.id), userId, String(session.status));
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
      await cacheSessionMeta(existingInProgress.id, userId, "in_progress");
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
        await cacheSessionMeta(concurrentInProgress.id, userId, "in_progress");
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
          await cacheSessionMeta(retrySession.id, userId, "in_progress");
          return { session: retrySession };
        }
      }

      return { error: error.message };
    }

    await cacheSessionMeta(session.id, userId, "in_progress");
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
    await ensureSessionVariantsForExam(supabase, userId, examId, session.id);
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

function getSebRequestHash(headerStore: Awaited<ReturnType<typeof headers>>) {
  return (
    headerStore.get("x-safeexambrowser-requesthash") ??
    headerStore.get("x-safeexambrowser-browserexamkeyhash") ??
    headerStore.get("x-safeexambrowser-configkeyhash")
  );
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

  if (isStrictProctoredExam(exam)) {
    const headerStore = await headers();
    const sebRequestHash = getSebRequestHash(headerStore);
    const userAgent = headerStore.get("user-agent") ?? "";
    if (!sebRequestHash && !userAgent.includes("SEB")) {
      return "Strict proctoring шалгалтыг зөвхөн Safe Exam Browser-оор эхлүүлнэ.";
    }
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

  const assignedExam = await getAssignedPublishedExamRecord(
    supabase,
    user.id,
    examId
  );
  if (!assignedExam?.exam) {
    return { redirectTo: "/student/exams?error=exam_not_found" };
  }
  if (assignedExam.row.excused_at) {
    return { redirectTo: "/student/exams?error=exam_not_found" };
  }

  const inProgressSession = await getInProgressSession(supabase, examId, user.id);
  if (inProgressSession?.id) {
    return {
      redirectTo: `/student/exams/${examId}/take/run?session=${encodeURIComponent(String(inProgressSession.id))}`,
    };
  }

  const exam = assignedExam.exam;
  const now = Date.now();
  const startTime = new Date(exam.start_time as string).getTime();
  if (now < startTime) {
    return {
      redirectTo: `/student/exams?error=time_window&exam=${encodeURIComponent(exam.title)}`,
    };
  }

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

  const assignedExam = await getAssignedPublishedExamRecord(
    supabase,
    user.id,
    examId
  );
  if (!assignedExam?.exam) {
    return { error: "Шалгалт олдсонгүй" } as const;
  }

  const readinessError = await validateExamReadiness(assignedExam.exam, readiness);
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
  readiness: StartExamReadinessPayload
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const session = await getSessionMeta(supabase, sessionId, user.id);
  if (!session) return { error: "Session олдсонгүй" };
  if (session.status !== "in_progress") {
    return { success: true, skipped: true };
  }

  const { data: examSession, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("exam_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError) return { error: sessionError.message };
  if (!examSession?.exam_id) return { error: "Session олдсонгүй" };

  const assignedExam = await getAssignedPublishedExamRecord(
    supabase,
    user.id,
    String(examSession.exam_id)
  );
  const browserBaselineRisk =
    assignedExam?.exam?.proctoring_mode === "standard" &&
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
    .eq("user_id", user.id);

  if (updateError) return { error: updateError.message };

  if (readiness.identityVerified) {
    const logResult = await logProctorEvent(sessionId, "identity_verified", {
      brightness_score:
        typeof readiness.brightnessScore === "number"
          ? readiness.brightnessScore
          : null,
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" } as const;

  const assignedExam = await getAssignedPublishedExamRecord(
    supabase,
    user.id,
    examId
  );
  if (!assignedExam?.exam) {
    return { redirectTo: "/student/exams?error=exam_not_found" } as const;
  }
  if (assignedExam.row.excused_at) {
    return { redirectTo: "/student/exams?error=exam_not_found" } as const;
  }

  const exam = assignedExam.exam;
  const now = Date.now();
  const startTime = new Date(exam.start_time as string).getTime();

  if (now < startTime) {
    return {
      redirectTo: `/student/exams?error=time_window&exam=${encodeURIComponent(exam.title)}`,
    } as const;
  }

  const examPayload = await loadStudentExamPayload(supabase, examId, assignedExam);

  if (!examPayload || !Array.isArray(examPayload.questions) || examPayload.questions.length === 0) {
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

  if ("redirectTo" in preparedState && typeof preparedState.redirectTo === "string") {
    return preparedState;
  }

  return {
    exam: examPayload.exam as StudentAssignedExam & Record<string, unknown>,
    questions: preparedState.displayQuestions,
    sessionId: preparedState.sessionId,
    savedAnswers: preparedState.savedAnswers,
    answerAnalytics: preparedState.answerAnalytics,
    initialTimeLeftSeconds: preparedState.initialTimeLeftSeconds,
    sessionAlreadyStarted: preparedState.sessionAlreadyStarted,
  } satisfies PrepareExamTakePayloadResult;
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
  const session = await getSessionMeta(supabase, sessionId, userId);
  if (!session) return { error: "Session олдсонгүй" };
  if (session.status !== "in_progress") {
    return { error: "Энэ шалгалтын session идэвхгүй байна" };
  }

  const redisKey = getSessionAnswersCacheKey(sessionId, userId);
  const analyticsKey = getSessionAnswerMetaCacheKey(sessionId, userId);

  const toSet: Record<string, string> = {};
  const toDelete: string[] = [];
  const analyticsToSet: Record<string, string> = {};

  for (const [questionId, answer] of Object.entries(answers)) {
    if (answer === "") {
      toDelete.push(questionId);
    } else {
      toSet[questionId] = answer;
    }
  }

  for (const [questionId, analytics] of Object.entries(answerAnalytics)) {
    analyticsToSet[questionId] = JSON.stringify(analytics);
  }

  const pipeline = redis.pipeline();
  let hasRedisMutations = false;

  if (Object.keys(toSet).length > 0) {
    pipeline.hset(redisKey, toSet);
    hasRedisMutations = true;
  }
  if (Object.keys(analyticsToSet).length > 0) {
    pipeline.hset(analyticsKey, analyticsToSet);
    pipeline.expire(analyticsKey, 7200);
    hasRedisMutations = true;
  }
  for (const qId of toDelete) {
    pipeline.hdel(redisKey, qId);
    hasRedisMutations = true;
  }
  if (hasRedisMutations) {
    pipeline.expire(redisKey, 7200);
    await pipeline.exec();
  }

  return { success: true };
}

/**
 * Шалгалт дуусгах — Auto-grade + submit
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
  const submitLimit = await submitExamRateLimit.limit(
    `submit-exam:${userId}:${sessionId}`
  );
  if (!submitLimit.success) {
    return { error: "Хэт олон илгээх оролдлого байна. Түр хүлээгээд дахин оролдоно уу." };
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
    await cacheSessionMeta(sessionId, userId, session.status);
    const totalScore = Number(session.total_score ?? 0);
    const maxScore = Number(session.max_score ?? 0);
    return {
      success: true,
      totalScore,
      maxScore,
      percentage: getPercentage(totalScore, maxScore),
    };
  }

  // Canonical submit source нь Redis draft.
  // Submit дээр зөвхөн unsaved delta ирсэн үед л fallback flush хийнэ.
  if (clientAnswers && Object.keys(clientAnswers).length > 0) {
    const batchResult = await saveAnswersBatchForUserClient(
      supabase,
      userId,
      sessionId,
      clientAnswers,
      clientAnswerAnalytics
    );
    if ("error" in batchResult) {
      return batchResult;
    }
  }

  return finalizeSessionAttempt(supabase, {
    sessionId,
    examId: session.exam_id,
    userId,
    reason: "submit",
    skipPostFinalizeSideEffects:
      options?.skipPostFinalizeSideEffects ?? false,
  });
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
  const { error } = await supabase.from("proctor_events").insert({
    session_id: sessionId,
    user_id: user.id,
    event_type: eventType,
    metadata,
    severity: policy.severity,
    source:
      typeof metadata.source === "string" ? metadata.source : "client",
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
    .eq("user_id", user.id)
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
      .eq("user_id", user.id);
  }

  return {
    success: true,
    riskDelta: policy.riskDelta,
    severity: policy.severity,
  };
}

export async function recordExamHeartbeat(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const session = await getSessionMeta(supabase, sessionId, user.id);
  if (!session) return { error: "Session олдсонгүй" };
  if (session.status !== "in_progress") {
    return { success: true, skipped: true };
  }

  await redis.set(getSessionHeartbeatCacheKey(sessionId), new Date().toISOString(), {
    ex: 45,
  });

  return { success: true };
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

/**
 * Шалгалтын үр дүнг DB-ээс авах (URL param биш)
 */
export async function getExamResult(examId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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
    const exam = await getEffectiveExamAccessForStudent(supabase, user.id, examId);
    if (!exam) return null;

    if (!isSessionExpiredForExam(latestSession.started_at ?? null, exam)) {
      return null;
    }

    const finalized = await finalizeSessionAttempt(supabase, {
      sessionId: latestSession.id,
      examId,
      userId: user.id,
      reason: "timeout",
    });

    if ("error" in finalized) {
      console.error("[getExamResult] finalize timeout error:", finalized.error);
      return null;
    }

    const { data: refreshedSessions, error: refreshedSessionError } = await supabase
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

  const finalizedSessions = sessions.filter((session) =>
    isFinalizedAttemptStatus(String(session.status ?? ""))
  );
  const bestSession = pickBestAttempt(finalizedSessions);
  if (!bestSession) {
    return null;
  }

  const assignedExam = await getAssignedPublishedExamRecord(
    supabase,
    user.id,
    examId
  );
  const effectiveExam = assignedExam?.row
    ? mergeAssignedExamAccess(
        assignedExam.row,
        toStudentAttemptSummary(latestSession)
      )
    : null;
  const canViewDetailedFeedback = !canAttemptExamAgain(
    effectiveExam?.myLifecycleStatus ?? null
  );

  if (!canViewDetailedFeedback) {
    return {
      ...bestSession,
      answers: [],
      best_attempt_number: Number(bestSession.attempt_number ?? 0),
      latest_attempt_number: Number(latestSession.attempt_number ?? 0),
      can_view_detailed_feedback: false,
      can_attempt_again: true,
    };
  }

  const snapshot = await getStoredPublishedExamSnapshot(supabase, examId);
  const snapshotQuestionMap = getSnapshotQuestionMap(snapshot);

  const [{ data: answers }, { data: questions }, questionVariantMap] =
    await Promise.all([
    supabase
      .from("answers")
      .select(
        "id, question_id, answer, score, is_correct, feedback, questions(id, type, content, content_html, image_url, options, correct_answer, points, order_index, explanation)"
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

  return {
    ...bestSession,
    answers: fullBreakdown,
    best_attempt_number: Number(bestSession.attempt_number ?? 0),
    latest_attempt_number: Number(latestSession.attempt_number ?? 0),
    can_view_detailed_feedback: true,
    can_attempt_again: false,
  };
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

  return Array.from(sessionsByExam.values())
    .map((examSessions) => pickBestAttempt(examSessions))
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
