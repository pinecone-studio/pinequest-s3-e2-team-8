export const SUBJECT_SUMMARY_TOPIC_KEY = "__subject__";
export const OFFICIAL_MASTERY_WEIGHT = 0.75;
export const PRACTICE_MASTERY_WEIGHT = 0.25;
export const MIN_TOPIC_CONFIDENCE = 0.65;
export const DEFAULT_PRACTICE_QUESTION_COUNT = 10;

export function normalizeTopicKey(input: string | null | undefined) {
  return String(input ?? "")
    .trim()
    .toLocaleLowerCase("mn-MN")
    .replace(/\s+/g, " ");
}

export function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export function getPercentage(correct: number, total: number) {
  if (!Number.isFinite(total) || total <= 0) return null;
  return roundToTwo((correct / total) * 100);
}

export function getBlendedMasteryScore({
  officialCorrect,
  officialTotal,
  practiceCorrect,
  practiceTotal,
}: {
  officialCorrect: number;
  officialTotal: number;
  practiceCorrect: number;
  practiceTotal: number;
}) {
  const officialPct = getPercentage(officialCorrect, officialTotal);
  const practicePct = getPercentage(practiceCorrect, practiceTotal);

  if (officialPct === null && practicePct === null) return 0;
  if (officialPct === null) return practicePct ?? 0;
  if (practicePct === null) return officialPct;

  return roundToTwo(
    officialPct * OFFICIAL_MASTERY_WEIGHT +
      practicePct * PRACTICE_MASTERY_WEIGHT
  );
}

export function shouldIncludeTopicInProjection({
  topicLabel,
  topicSource,
  topicConfidence,
}: {
  topicLabel: string | null | undefined;
  topicSource: string | null | undefined;
  topicConfidence: number | null | undefined;
}) {
  if (!String(topicLabel ?? "").trim()) return false;

  if (topicSource === "ai_inferred") {
    return Number(topicConfidence ?? 0) >= MIN_TOPIC_CONFIDENCE;
  }

  return true;
}

export function pickTopItems<T>(
  items: T[],
  scoreGetter: (item: T) => number,
  limit: number
) {
  return items
    .slice()
    .sort((left, right) => scoreGetter(left) - scoreGetter(right))
    .slice(0, limit);
}
