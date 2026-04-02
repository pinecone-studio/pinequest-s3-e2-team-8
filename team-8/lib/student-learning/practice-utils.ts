import type {
  QuestionType,
  StudentPracticeQuestion,
  StudentPracticeQuestionForTake,
} from "@/types";

type PracticeQuestionLike = Pick<StudentPracticeQuestionForTake, "id" | "type">;
type PracticeQuestionIdentity = Pick<StudentPracticeQuestionForTake, "id">;

export function createPracticeQuestionSetFingerprint(
  questions: PracticeQuestionIdentity[]
) {
  return questions.map((question) => question.id).join(":");
}

export function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export function parseStoredArray(value: string | undefined) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export function parseMatchingOptions(options: string[] | null | undefined) {
  return (options ?? [])
    .map((option) => {
      const [left, ...rightParts] = String(option).split("|||");
      const right = rightParts.join("|||").trim();
      if (!left || !right) return null;
      return { left: left.trim(), right };
    })
    .filter((item): item is { left: string; right: string } => Boolean(item));
}

export function parseDraftAnswerRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([questionId, answer]) => [
      questionId,
      String(answer ?? ""),
    ])
  );
}

export function normalizeDraftAnswer(questionType: QuestionType | string, answer: string) {
  if (questionType === "multiple_choice") {
    return answer.trim() ? answer : null;
  }

  if (questionType === "essay" || questionType === "fill_blank") {
    return answer.trim() ? answer : null;
  }

  if (questionType === "multiple_response") {
    const nextAnswers = parseStoredArray(answer).filter((item) => item.trim());
    return nextAnswers.length > 0 ? JSON.stringify(nextAnswers) : null;
  }

  if (questionType === "matching") {
    try {
      const parsed = JSON.parse(answer) as Record<string, string>;
      const filteredEntries = Object.entries(parsed).filter(
        ([, value]) => String(value ?? "").trim() !== ""
      );

      return filteredEntries.length > 0
        ? JSON.stringify(Object.fromEntries(filteredEntries))
        : null;
    } catch {
      return null;
    }
  }

  return answer.trim() ? answer : null;
}

export function normalizeDraftAnswersForQuestions(
  questions: PracticeQuestionLike[],
  answers: Record<string, string>
) {
  const normalizedAnswers: Record<string, string> = {};

  for (const question of questions) {
    const normalized = normalizeDraftAnswer(question.type, answers[question.id] ?? "");
    if (normalized !== null) {
      normalizedAnswers[question.id] = normalized;
    }
  }

  return normalizedAnswers;
}

export function isPracticeQuestionAnswered(
  question: Pick<StudentPracticeQuestionForTake, "type">,
  answer: string | undefined
) {
  return normalizeDraftAnswer(question.type, answer ?? "") !== null;
}

export function normalizeTextAnswer(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("mn-MN");
}

export function areArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function gradePracticeQuestion(
  question: StudentPracticeQuestion,
  rawAnswer: string | null | undefined
) {
  if (question.type === "multiple_choice" || question.type === "fill_blank") {
    const isCorrect =
      normalizeTextAnswer(rawAnswer) === normalizeTextAnswer(question.correct_answer);
    return {
      is_correct: isCorrect,
      score: isCorrect ? Number(question.points ?? 0) : 0,
    };
  }

  if (question.type === "multiple_response") {
    const submitted = parseStringArray(rawAnswer)
      .map((item) => normalizeTextAnswer(item))
      .sort();
    const expected = parseStringArray(question.correct_answer)
      .map((item) => normalizeTextAnswer(item))
      .sort();
    const isCorrect = submitted.length > 0 && areArraysEqual(submitted, expected);
    return {
      is_correct: isCorrect,
      score: isCorrect ? Number(question.points ?? 0) : 0,
    };
  }

  if (question.type === "matching") {
    try {
      const parsed = JSON.parse(String(rawAnswer ?? "{}")) as Record<string, string>;
      const expectedPairs = parseMatchingOptions(question.options);
      const isCorrect =
        expectedPairs.length > 0 &&
        expectedPairs.every(
          (pair) => normalizeTextAnswer(parsed[pair.left]) === normalizeTextAnswer(pair.right)
        );
      return {
        is_correct: isCorrect,
        score: isCorrect ? Number(question.points ?? 0) : 0,
      };
    } catch {
      return { is_correct: false, score: 0 };
    }
  }

  return { is_correct: false, score: 0 };
}
