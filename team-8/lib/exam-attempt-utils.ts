type AttemptLike = {
  status?: string | null;
  attempt_number?: number | null;
  total_score?: number | null;
  max_score?: number | null;
  submitted_at?: string | null;
  started_at?: string | null;
};

export const FINALIZED_ATTEMPT_STATUSES = [
  "submitted",
  "graded",
  "timed_out",
] as const;

export function isFinalizedAttemptStatus(status: string | null | undefined) {
  return FINALIZED_ATTEMPT_STATUSES.includes(
    (status ?? "") as (typeof FINALIZED_ATTEMPT_STATUSES)[number]
  );
}

export function getAttemptPercentage(attempt: AttemptLike) {
  const totalScore = Number(attempt.total_score ?? 0);
  const maxScore = Number(attempt.max_score ?? 0);

  return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
}

function getAttemptTimestampMs(attempt: AttemptLike) {
  const rawTimestamp = attempt.submitted_at ?? attempt.started_at ?? null;
  if (!rawTimestamp) return Number.NEGATIVE_INFINITY;

  const timestamp = new Date(rawTimestamp).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getAttemptNumber(attempt: AttemptLike) {
  return Number(attempt.attempt_number ?? 0);
}

export function pickLatestAttempt<T extends AttemptLike>(attempts: T[]) {
  return attempts.reduce<T | null>((latest, attempt) => {
    if (!latest) return attempt;

    const latestAttemptNumber = getAttemptNumber(latest);
    const attemptNumber = getAttemptNumber(attempt);
    if (attemptNumber !== latestAttemptNumber) {
      return attemptNumber > latestAttemptNumber ? attempt : latest;
    }

    return getAttemptTimestampMs(attempt) >= getAttemptTimestampMs(latest)
      ? attempt
      : latest;
  }, null);
}

export function pickBestAttempt<T extends AttemptLike>(attempts: T[]) {
  return attempts.reduce<T | null>((best, attempt) => {
    if (!best) return attempt;

    const bestPercentage = getAttemptPercentage(best);
    const attemptPercentage = getAttemptPercentage(attempt);
    if (attemptPercentage !== bestPercentage) {
      return attemptPercentage > bestPercentage ? attempt : best;
    }

    const bestTimestamp = getAttemptTimestampMs(best);
    const attemptTimestamp = getAttemptTimestampMs(attempt);
    if (attemptTimestamp !== bestTimestamp) {
      return attemptTimestamp > bestTimestamp ? attempt : best;
    }

    return getAttemptNumber(attempt) >= getAttemptNumber(best) ? attempt : best;
  }, null);
}
