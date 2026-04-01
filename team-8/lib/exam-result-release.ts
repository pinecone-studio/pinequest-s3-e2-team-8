export type ResultReleaseWindow = {
  end_time: string;
  duration_minutes: number | null | undefined;
};

export type StudentResultLockedReason =
  | "release_pending"
  | "retake_pending";

export function getResultReleaseMs(window: ResultReleaseWindow) {
  const endMs = new Date(window.end_time).getTime();
  const durationMs = Number(window.duration_minutes ?? 0) * 60 * 1000;

  if (Number.isNaN(endMs)) {
    return null;
  }

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return endMs;
  }

  return endMs + durationMs;
}

export function getResultReleaseAt(window: ResultReleaseWindow) {
  const releaseMs = getResultReleaseMs(window);
  if (releaseMs === null) {
    return null;
  }

  return new Date(releaseMs).toISOString();
}

export function isResultReleaseOpen(
  window: ResultReleaseWindow,
  nowMs = Date.now(),
) {
  const releaseMs = getResultReleaseMs(window);
  return releaseMs !== null && nowMs >= releaseMs;
}

export function deriveResultVisibility(
  window: ResultReleaseWindow,
  options?: {
    canAttemptAgain?: boolean;
    nowMs?: number;
  },
) {
  const canAttemptAgain = Boolean(options?.canAttemptAgain);
  const isReleased = isResultReleaseOpen(window, options?.nowMs);
  const resultReleaseAt = getResultReleaseAt(window);
  const canViewResults = isReleased && !canAttemptAgain;
  const lockedReason = canViewResults
    ? null
    : canAttemptAgain
      ? ("retake_pending" as const)
      : ("release_pending" as const);

  return {
    resultReleaseAt,
    isReleased,
    canViewResults,
    lockedReason,
  };
}
