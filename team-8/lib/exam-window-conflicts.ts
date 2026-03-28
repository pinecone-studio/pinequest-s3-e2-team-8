type FlexibleExamWindow = {
  start_time: string;
  end_time: string;
  duration_minutes: number | null | undefined;
};

function getDurationMs(durationMinutes: number | null | undefined) {
  const durationMs = Number(durationMinutes ?? 0) * 60 * 1000;
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null;
}

function canScheduleFirstBeforeSecond(
  first: FlexibleExamWindow,
  second: FlexibleExamWindow
) {
  const firstEarliestStartMs = new Date(first.start_time).getTime();
  const firstLatestStartMs = new Date(first.end_time).getTime();
  const secondEarliestStartMs = new Date(second.start_time).getTime();
  const secondLatestStartMs = new Date(second.end_time).getTime();
  const firstDurationMs = getDurationMs(first.duration_minutes);

  if (
    Number.isNaN(firstEarliestStartMs) ||
    Number.isNaN(firstLatestStartMs) ||
    Number.isNaN(secondEarliestStartMs) ||
    Number.isNaN(secondLatestStartMs) ||
    firstDurationMs === null
  ) {
    return false;
  }

  const secondStartMs = Math.max(
    secondEarliestStartMs,
    firstEarliestStartMs + firstDurationMs
  );

  return (
    firstEarliestStartMs <= firstLatestStartMs &&
    secondEarliestStartMs <= secondLatestStartMs &&
    secondStartMs <= secondLatestStartMs
  );
}

export function hasUnavoidableExamWindowConflict(
  first: FlexibleExamWindow,
  second: FlexibleExamWindow
) {
  const firstBeforeSecond = canScheduleFirstBeforeSecond(first, second);
  const secondBeforeFirst = canScheduleFirstBeforeSecond(second, first);

  return !(firstBeforeSecond || secondBeforeFirst);
}
