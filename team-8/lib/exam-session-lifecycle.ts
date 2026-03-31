export type RecipientAccessOverride = {
  access_start_time?: string | null;
  access_end_time?: string | null;
  max_attempts_override?: number | null;
  excused_at?: string | null;
  status_note?: string | null;
};

type BaseExamAccess = {
  start_time: string;
  end_time: string;
  duration_minutes: number;
  max_attempts: number | null;
};

type StudentLifecycleInput = {
  exam: BaseExamAccess;
  recipient: RecipientAccessOverride;
  latestSessionStatus?: string | null;
  latestAttemptNumber?: number | null;
  latestSessionStartedAt?: string | null;
  nowMs?: number;
};

export type StudentExamLifecycleStatus =
  | "scheduled"
  | "available"
  | "retake_scheduled"
  | "retake_available"
  | "in_progress"
  | "submitted"
  | "graded"
  | "timed_out"
  | "absent"
  | "excused";

export type StudentExamLifecycle = {
  key: StudentExamLifecycleStatus;
  label: string;
  isAvailable: boolean;
  isCompleted: boolean;
  isRetake: boolean;
};

export function getEffectiveExamAccess(
  exam: BaseExamAccess,
  recipient: RecipientAccessOverride
) {
  const effectiveStartTime = recipient.access_start_time ?? exam.start_time;
  const effectiveEndTime = recipient.access_end_time ?? exam.end_time;
  const effectiveMaxAttempts =
    recipient.max_attempts_override ?? Number(exam.max_attempts ?? 1);
  const hasRetakeOverride =
    (recipient.access_start_time !== null && recipient.access_start_time !== undefined) ||
    (recipient.access_end_time !== null && recipient.access_end_time !== undefined) ||
    (recipient.max_attempts_override !== null && recipient.max_attempts_override !== undefined);

  return {
    effectiveStartTime,
    effectiveEndTime,
    effectiveMaxAttempts,
    hasRetakeOverride,
    isExcused: Boolean(recipient.excused_at),
  };
}

export function getSessionDeadlineMs(
  startedAt: string | null | undefined,
  exam: Pick<BaseExamAccess, "end_time" | "duration_minutes">
) {
  if (!startedAt) return null;

  const startedAtMs = new Date(startedAt).getTime();
  const durationMs = Number(exam.duration_minutes ?? 0) * 60 * 1000;
  const endTimeMs = new Date(exam.end_time).getTime();

  if (
    Number.isNaN(startedAtMs) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return null;
  }

  const durationDeadlineMs = startedAtMs + durationMs;
  if (Number.isNaN(endTimeMs)) {
    return durationDeadlineMs;
  }

  return Math.min(durationDeadlineMs, endTimeMs);
}

export function deriveStudentExamLifecycle(
  input: StudentLifecycleInput
): StudentExamLifecycle {
  const nowMs = input.nowMs ?? Date.now();
  const status = input.latestSessionStatus ?? null;
  const {
    effectiveStartTime,
    effectiveEndTime,
    effectiveMaxAttempts,
    hasRetakeOverride,
    isExcused,
  } = getEffectiveExamAccess(input.exam, input.recipient);
  const startMs = new Date(effectiveStartTime).getTime();
  const endMs = new Date(effectiveEndTime).getTime();
  const attemptsUsed = Number(input.latestAttemptNumber ?? 0);
  const hasRemainingAttempts = attemptsUsed < effectiveMaxAttempts;
  const isRetakeFlow = hasRetakeOverride || attemptsUsed > 0;
  const sessionDeadlineMs = getSessionDeadlineMs(
    input.latestSessionStartedAt,
    {
      end_time: effectiveEndTime,
      duration_minutes: input.exam.duration_minutes,
    }
  );
  const isExpiredInProgress =
    status === "in_progress" &&
    sessionDeadlineMs !== null &&
    nowMs >= sessionDeadlineMs;

  if (isExcused) {
    return {
      key: "excused",
      label: "Чөлөөлөгдсөн",
      isAvailable: false,
      isCompleted: true,
      isRetake: false,
    };
  }

  if (status === "in_progress" && !isExpiredInProgress) {
    return {
      key: "in_progress",
      label: "Үргэлжилж байна",
      isAvailable: true,
      isCompleted: false,
      isRetake: hasRetakeOverride,
    };
  }

  if (isExpiredInProgress) {
    return {
      key: "timed_out",
      label: "Хугацаа дууссан",
      isAvailable: false,
      isCompleted: true,
      isRetake: hasRetakeOverride,
    };
  }

  if (isRetakeFlow && hasRemainingAttempts) {
    if (!Number.isNaN(startMs) && nowMs < startMs) {
      return {
        key: "retake_scheduled",
        label: "Дахин оролдлого товлогдсон",
        isAvailable: false,
        isCompleted: false,
        isRetake: true,
      };
    }

    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs <= endMs) {
      return {
        key: "retake_available",
        label: "Дахин оролдох боломжтой",
        isAvailable: true,
        isCompleted: false,
        isRetake: true,
      };
    }
  }

  if (status === "submitted") {
    return {
      key: "submitted",
      label: "Шалгагдаж байна",
      isAvailable: false,
      isCompleted: true,
      isRetake: hasRetakeOverride,
    };
  }

  if (status === "graded") {
    return {
      key: "graded",
      label: "Дүн гарсан",
      isAvailable: false,
      isCompleted: true,
      isRetake: hasRetakeOverride,
    };
  }

  if (status === "timed_out") {
    return {
      key: "timed_out",
      label: "Хугацаа дууссан",
      isAvailable: false,
      isCompleted: true,
      isRetake: hasRetakeOverride,
    };
  }

  if (!Number.isNaN(startMs) && nowMs < startMs) {
    return {
      key: "scheduled",
      label: "Товлогдсон",
      isAvailable: false,
      isCompleted: false,
      isRetake: false,
    };
  }

  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs <= endMs) {
    return {
      key: "available",
      label: "Одоо эхлэх боломжтой",
      isAvailable: true,
      isCompleted: false,
      isRetake: false,
    };
  }

  return {
    key: "absent",
    label: "Өгөөгүй",
    isAvailable: false,
    isCompleted: true,
    isRetake: hasRetakeOverride,
  };
}
