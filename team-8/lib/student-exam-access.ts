import { createClient } from "@/lib/supabase/server";
import {
  deriveResultVisibility,
  type StudentResultLockedReason,
} from "@/lib/exam-result-release";
import {
  deriveStudentExamLifecycle,
  getEffectiveExamAccess,
  type RecipientAccessOverride,
} from "@/lib/exam-session-lifecycle";
import { pickLatestAttempt } from "@/lib/exam-attempt-utils";
import {
  DEFAULT_PROCTORING_SETTINGS,
  type DevicePolicy,
  type EvidenceMode,
  type ProctoringMode,
} from "@/lib/proctoring";

type SupabaseExamAccessClient = Pick<
  Awaited<ReturnType<typeof createClient>>,
  "from"
>;

export const STUDENT_EXAM_SELECT = `
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

export type StudentExamBase = {
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

export type AssignedExamRow = {
  exam_id: string;
  access_start_time: string | null;
  access_end_time: string | null;
  max_attempts_override: number | null;
  excused_at: string | null;
  status_note: string | null;
  exams?: Record<string, unknown> | Record<string, unknown>[] | null;
};

type AssignedExamAccessRow = Omit<AssignedExamRow, "exams">;

export type StudentExamAttemptSummary = {
  status: string | null;
  attemptNumber: number;
  startedAt: string | null;
};

export type StudentAssignedExam = StudentExamBase & {
  mySessionStatus: string | null;
  myLifecycleStatus: string;
  myLifecycleLabel: string;
  hasRetakeOverride: boolean;
  isExcused: boolean;
  status_note: string | null;
  result_release_at: string | null;
  can_view_results: boolean;
  is_result_released: boolean;
  result_locked_reason: StudentResultLockedReason | null;
};

export type StudentExamAccessContext = {
  rows: AssignedExamRow[];
  rowMap: Map<string, AssignedExamRow>;
  latestSessionMap: Map<string, StudentExamAttemptSummary>;
  accessMap: Map<string, StudentAssignedExam>;
};

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeExamIds(options?: {
  examId?: string;
  examIds?: string[];
}) {
  if (options?.examIds && options.examIds.length === 0) {
    return [];
  }

  const rawExamIds = options?.examIds ?? (options?.examId ? [options.examId] : []);
  const examIds = Array.from(
    new Set(
      rawExamIds
        .map((examId) => String(examId ?? "").trim())
        .filter(Boolean),
    ),
  );

  return examIds.length > 0 ? examIds : null;
}

export function normalizeProctoringSettings(
  exam: Partial<StudentExamBase> | Record<string, unknown> | null | undefined,
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

export function toStudentAttemptSummary(
  session:
    | {
        status?: string | null;
        attempt_number?: number | null;
        started_at?: string | null;
      }
    | null
    | undefined,
): StudentExamAttemptSummary | null {
  if (!session) return null;

  return {
    status: (session.status as string | null) ?? null,
    attemptNumber: Number(session.attempt_number ?? 0),
    startedAt: (session.started_at as string | null) ?? null,
  };
}

export function canAttemptExamAgain(lifecycleStatus: string | null | undefined) {
  return ["available", "retake_available", "retake_scheduled"].includes(
    String(lifecycleStatus ?? ""),
  );
}

function buildStudentAssignedExam(
  examRecord: StudentExamBase,
  recipient: RecipientAccessOverride,
  latestSession: StudentExamAttemptSummary | null = null,
  statusNote: string | null = null,
) {
  const examAccess = getEffectiveExamAccess(
    {
      start_time: String(examRecord.start_time),
      end_time: String(examRecord.end_time),
      duration_minutes: Number(examRecord.duration_minutes ?? 0),
      max_attempts: Number(examRecord.max_attempts ?? 1),
    },
    recipient,
  );
  const lifecycle = deriveStudentExamLifecycle({
    exam: {
      start_time: String(examRecord.start_time),
      end_time: String(examRecord.end_time),
      duration_minutes: Number(examRecord.duration_minutes ?? 0),
      max_attempts: Number(examRecord.max_attempts ?? 1),
    },
    recipient,
    latestSessionStatus: latestSession?.status ?? null,
    latestAttemptNumber: latestSession?.attemptNumber ?? 0,
    latestSessionStartedAt: latestSession?.startedAt ?? null,
  });
  const resultVisibility = deriveResultVisibility(
    {
      end_time: examAccess.effectiveEndTime,
      duration_minutes: Number(examRecord.duration_minutes ?? 0),
    },
    {
      canAttemptAgain: canAttemptExamAgain(lifecycle.key),
    },
  );
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
    status_note: statusNote,
    result_release_at: resultVisibility.resultReleaseAt,
    can_view_results: resultVisibility.canViewResults,
    is_result_released: resultVisibility.isReleased,
    result_locked_reason: resultVisibility.lockedReason,
  } satisfies StudentAssignedExam;
}

export function mergeAssignedExamAccess(
  row: AssignedExamRow,
  latestSession: StudentExamAttemptSummary | null = null,
): StudentAssignedExam | null {
  const exam = getRelationObject(row.exams);
  if (!exam) return null;

  return buildStudentAssignedExam(
    exam as StudentExamBase,
    row as RecipientAccessOverride,
    latestSession,
    row.status_note ?? null,
  );
}

export async function getAssignedPublishedExamRows(
  supabase: SupabaseExamAccessClient,
  userId: string,
  options?: {
    examId?: string;
    examIds?: string[];
  },
) {
  const examIds = normalizeExamIds(options);
  if (Array.isArray(examIds) && examIds.length === 0) {
    return [];
  }

  const buildRecipientQuery = (selectClause: string) => {
    let query = supabase
      .from("exam_recipients")
      .select(selectClause)
      .eq("student_id", userId);

    if (examIds && examIds.length === 1) {
      query = query.eq("exam_id", examIds[0]);
    } else if (examIds && examIds.length > 1) {
      query = query.in("exam_id", examIds);
    }

    return query;
  };

  let recipientRows: unknown[] | null = null;
  const recipientRes = await buildRecipientQuery(
    "exam_id, access_start_time, access_end_time, max_attempts_override, excused_at, status_note",
  );

  if (recipientRes.error) {
    const fallbackRes = await buildRecipientQuery("exam_id");
    if (fallbackRes.error) {
      throw new Error(fallbackRes.error.message);
    }

    recipientRows = (fallbackRes.data ?? []).map((row) => ({
      exam_id: String((row as unknown as { exam_id: string }).exam_id),
      access_start_time: null,
      access_end_time: null,
      max_attempts_override: null,
      excused_at: null,
      status_note: null,
    }));
  } else {
    recipientRows = recipientRes.data ?? [];
  }

  const baseRows = (recipientRows ?? []) as AssignedExamAccessRow[];
  if (baseRows.length === 0) return [];

  const hydratedExamIds = Array.from(
    new Set(baseRows.map((row) => String(row.exam_id))),
  );
  const { data: exams } = await supabase
    .from("exams")
    .select(STUDENT_EXAM_SELECT)
    .eq("is_published", true)
    .in("id", hydratedExamIds);

  const examMap = new Map<string, StudentExamBase>(
    ((exams ?? []) as StudentExamBase[]).map((exam) => [String(exam.id), exam]),
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

export async function getAssignedPublishedExamRecord(
  supabase: SupabaseExamAccessClient,
  userId: string,
  examId: string,
) {
  const rows = await getAssignedPublishedExamRows(supabase, userId, { examId });
  const row = rows[0] ?? null;
  if (!getRelationObject(row?.exams)) return null;

  return {
    row,
    exam: mergeAssignedExamAccess(row),
  };
}

export async function loadStudentExamAccessContext(
  supabase: SupabaseExamAccessClient,
  userId: string,
  options?: {
    examId?: string;
    examIds?: string[];
    includeLatestSessions?: boolean;
    latestSessionMap?: Map<string, StudentExamAttemptSummary>;
    sessionStatuses?: string[];
  },
): Promise<StudentExamAccessContext> {
  const rows = await getAssignedPublishedExamRows(supabase, userId, options);
  const rowMap = new Map(rows.map((row) => [String(row.exam_id), row]));
  const latestSessionMap = new Map<string, StudentExamAttemptSummary>(
    options?.latestSessionMap ?? [],
  );

  if (
    rowMap.size > 0 &&
    options?.includeLatestSessions !== false &&
    latestSessionMap.size === 0
  ) {
    let sessionQuery = supabase
      .from("exam_sessions")
      .select("exam_id, status, attempt_number, started_at, submitted_at")
      .eq("user_id", userId)
      .in("exam_id", Array.from(rowMap.keys()));

    const sessionStatuses = options?.sessionStatuses ?? [
      "in_progress",
      "submitted",
      "graded",
      "timed_out",
    ];
    if (sessionStatuses.length > 0) {
      sessionQuery = sessionQuery.in("status", sessionStatuses);
    }

    const { data: sessions } = await sessionQuery.order("attempt_number", {
      ascending: false,
    });

    const groupedSessions = new Map<string, Array<Record<string, unknown>>>();
    for (const session of sessions ?? []) {
      const examId = String(session.exam_id);
      const examSessions = groupedSessions.get(examId) ?? [];
      examSessions.push(session as Record<string, unknown>);
      groupedSessions.set(examId, examSessions);
    }

    for (const [examId, examSessions] of groupedSessions.entries()) {
      const latestSession = pickLatestAttempt(
        examSessions as Array<{
          status?: string | null;
          attempt_number?: number | null;
          submitted_at?: string | null;
          started_at?: string | null;
        }>,
      );
      if (!latestSession) continue;
      const latestSessionSummary = toStudentAttemptSummary(latestSession);
      if (latestSessionSummary) {
        latestSessionMap.set(examId, latestSessionSummary);
      }
    }
  }

  const accessMap = new Map<string, StudentAssignedExam>();
  for (const row of rows) {
    const access = mergeAssignedExamAccess(
      row,
      latestSessionMap.get(String(row.exam_id)) ?? null,
    );
    if (access) {
      accessMap.set(String(row.exam_id), access);
    }
  }

  return {
    rows,
    rowMap,
    latestSessionMap,
    accessMap,
  };
}

export async function getEffectiveExamAccessForStudent(
  supabase: SupabaseExamAccessClient,
  userId: string,
  examId: string,
  latestSession: StudentExamAttemptSummary | null = null,
  context?: Pick<StudentExamAccessContext, "rowMap"> | null,
) {
  const hydratedRow =
    context?.rowMap.get(examId) ??
    (await getAssignedPublishedExamRecord(supabase, userId, examId))?.row ??
    null;

  if (hydratedRow) {
    return mergeAssignedExamAccess(hydratedRow, latestSession);
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
      "access_start_time, access_end_time, max_attempts_override, excused_at, status_note",
    )
    .eq("exam_id", examId)
    .eq("student_id", userId)
    .maybeSingle();

  return buildStudentAssignedExam(
    exam as StudentExamBase,
    (recipient ?? {}) as RecipientAccessOverride,
    latestSession,
    (recipient?.status_note as string | null | undefined) ?? null,
  );
}
