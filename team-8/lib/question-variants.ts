import { getPromptModel } from "@/lib/ai/config";
import { createClient } from "@/lib/supabase/server";
import type { AiQuestionVariantMode, QuestionType } from "@/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const VARIANT_SCHEMA_MISSING_CODES = new Set([
  "42P01",
  "42703",
  "PGRST204",
  "PGRST205",
]);

type VariantQuestionBase = {
  id: string;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  ai_variant_enabled?: boolean | null;
  ai_variant_mode?: AiQuestionVariantMode | null;
};

type GeneratedVariantCandidate = {
  question_id?: unknown;
  type?: unknown;
  content?: unknown;
  options?: unknown;
  correct_answer?: unknown;
  explanation?: unknown;
};

export type StoredQuestionVariant = {
  id?: string;
  session_id?: string;
  question_id: string;
  user_id?: string;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StoredQuestionVariantPreset = {
  id?: string;
  question_id: string;
  slot: number;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  created_at?: string;
  updated_at?: string;
};

export function isQuestionVariantSchemaMissing(
  errorCode?: string | null,
  message?: string | null
) {
  if (errorCode && VARIANT_SCHEMA_MISSING_CODES.has(errorCode)) {
    return true;
  }

  const normalizedMessage = String(message ?? "").toLowerCase();
  if (!normalizedMessage) return false;

  return (
    normalizedMessage.includes("ai_variant_enabled") ||
    normalizedMessage.includes("ai_variant_mode") ||
    normalizedMessage.includes("exam_session_question_variants") ||
    normalizedMessage.includes("question_ai_variant_presets") ||
    (normalizedMessage.includes("schema cache") &&
      normalizedMessage.includes("questions"))
  );
}

function getResolvedVariantMode(
  question: Pick<VariantQuestionBase, "ai_variant_mode">
): AiQuestionVariantMode {
  return question.ai_variant_mode === "two_fixed" ? "two_fixed" : "per_student";
}

function extractJsonArray(text: string) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("AI Ñ…ÑƒÐ²Ð¸Ð»Ð±Ð°Ñ€Ñ‹Ð½ JSON Ñ…Ð°Ñ€Ð¸ÑƒÐ»Ñ‚Ñ‹Ð³ ÑƒÐ½ÑˆÐ¸Ð¶ Ñ‡Ð°Ð´ÑÐ°Ð½Ð³Ò¯Ð¹.");
  }

  return JSON.parse(match[0]) as unknown;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;

  const normalized = Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    )
  );

  return normalized.length > 0 ? normalized : null;
}

function hasUniqueMatchingSides(options: string[]) {
  const leftValues = new Set<string>();
  const rightValues = new Set<string>();

  for (const option of options) {
    const [left, ...rightParts] = option.split("|||");
    const right = rightParts.join("|||");

    if (!left || !right) return false;
    if (leftValues.has(left) || rightValues.has(right)) return false;

    leftValues.add(left);
    rightValues.add(right);
  }

  return true;
}

function normalizeMatchingOptions(value: unknown) {
  if (!Array.isArray(value)) return null;

  const normalized = Array.from(
    new Set(
      value
        .map((item) => {
          if (typeof item === "string") {
            const [left, ...rightParts] = item.split("|||");
            const right = rightParts.join("|||").trim();
            return left?.trim() && right ? `${left.trim()}|||${right}` : null;
          }

          const left = String(
            (item as { left?: unknown } | null | undefined)?.left ?? ""
          ).trim();
          const right = String(
            (item as { right?: unknown } | null | undefined)?.right ?? ""
          ).trim();

          if (!left || !right) return null;
          return `${left}|||${right}`;
        })
        .filter((item): item is string => Boolean(item))
    )
  );

  return normalized.length >= 2 && hasUniqueMatchingSides(normalized)
    ? normalized
    : null;
}

function buildMatchingCorrectAnswer(options: string[]) {
  return JSON.stringify(
    options.map((pair) => {
      const [left, ...rightParts] = pair.split("|||");
      return {
        left,
        right: rightParts.join("|||"),
      };
    })
  );
}

function normalizeMultipleResponseAnswer(value: unknown, options: string[]) {
  let answers: string[] | null = null;

  if (Array.isArray(value)) {
    answers = value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        answers = parsed
          .map((item) => String(item ?? "").trim())
          .filter(Boolean);
      }
    } catch {
      answers = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (!answers || answers.length === 0) return null;

  const uniqueAnswers = Array.from(new Set(answers));
  if (uniqueAnswers.some((answer) => !options.includes(answer))) {
    return null;
  }

  return JSON.stringify(uniqueAnswers);
}

function normalizeGeneratedVariant(
  baseQuestion: VariantQuestionBase,
  candidate: GeneratedVariantCandidate | null | undefined
): StoredQuestionVariant | null {
  if (!candidate) return null;
  if (String(candidate.type ?? "").trim() !== baseQuestion.type) return null;

  const content = String(candidate.content ?? "").trim();
  if (!content) return null;

  const explanation =
    typeof candidate.explanation === "string"
      ? candidate.explanation.trim() || null
      : (baseQuestion.explanation ?? null);

  if (baseQuestion.type === "multiple_choice") {
    const options = normalizeStringArray(candidate.options);
    const correctAnswer = String(candidate.correct_answer ?? "").trim();

    if (!options || options.length < 2 || !correctAnswer) return null;
    if (!options.includes(correctAnswer)) return null;

    return {
      question_id: baseQuestion.id,
      type: baseQuestion.type,
      content,
      content_html: null,
      image_url: baseQuestion.image_url ?? null,
      options,
      correct_answer: correctAnswer,
      explanation,
    };
  }

  if (baseQuestion.type === "multiple_response") {
    const options = normalizeStringArray(candidate.options);
    if (!options || options.length < 2) return null;

    const correctAnswer = normalizeMultipleResponseAnswer(
      candidate.correct_answer,
      options
    );

    if (!correctAnswer) return null;

    return {
      question_id: baseQuestion.id,
      type: baseQuestion.type,
      content,
      content_html: null,
      image_url: baseQuestion.image_url ?? null,
      options,
      correct_answer: correctAnswer,
      explanation,
    };
  }

  if (baseQuestion.type === "fill_blank") {
    const correctAnswer = String(candidate.correct_answer ?? "").trim();
    if (!correctAnswer) return null;

    return {
      question_id: baseQuestion.id,
      type: baseQuestion.type,
      content,
      content_html: null,
      image_url: baseQuestion.image_url ?? null,
      options: null,
      correct_answer: correctAnswer,
      explanation,
    };
  }

  if (baseQuestion.type === "matching") {
    const options = normalizeMatchingOptions(candidate.options);
    if (!options) return null;

    return {
      question_id: baseQuestion.id,
      type: baseQuestion.type,
      content,
      content_html: null,
      image_url: baseQuestion.image_url ?? null,
      options,
      correct_answer: buildMatchingCorrectAnswer(options),
      explanation,
    };
  }

  return {
    question_id: baseQuestion.id,
    type: baseQuestion.type,
    content,
    content_html: null,
    image_url: baseQuestion.image_url ?? null,
    options: null,
    correct_answer: null,
    explanation,
  };
}

function buildFallbackVariant(
  baseQuestion: VariantQuestionBase
): StoredQuestionVariant {
  return {
    question_id: baseQuestion.id,
    type: baseQuestion.type,
    content: baseQuestion.content,
    content_html: baseQuestion.content_html ?? null,
    image_url: baseQuestion.image_url ?? null,
    options: baseQuestion.options ?? null,
    correct_answer: baseQuestion.correct_answer ?? null,
    explanation: baseQuestion.explanation ?? null,
  };
}

async function callGeminiForQuestionVariants(
  seedNamespace: string,
  questions: VariantQuestionBase[]
) {
  const model = getPromptModel();
  const promptPayload = questions.map((question) => ({
    question_id: question.id,
    seed_hint: `${seedNamespace}:${question.id}`,
    type: question.type,
    content: question.content,
    options: question.options,
    correct_answer: question.correct_answer,
    explanation: question.explanation,
  }));

  const prompt = `You generate one alternate version of each exam question for a student session.

Hard requirements:
1. Keep question_id exactly the same.
2. Keep type exactly the same.
3. Do not make the question easier or harder.
4. Preserve the same concept, logic, reasoning path, and difficulty level.
5. Only change surface details such as numbers, names, labels, short scenario data, variable values, or option wording.
6. If the question has options, keep the same number of options.
7. The new correct_answer must match the new content and options exactly.
8. For matching questions, return options as [{"left":"...","right":"..."}].
9. For multiple_response questions, return correct_answer as either a string array or a JSON array string.
10. For essay questions, set correct_answer to null.
11. Return JSON array only. Do not include markdown, explanations outside JSON, or code fences.
12. Use seed_hint so different sessions can get different surface data while the logic and difficulty stay unchanged.

Input:
${JSON.stringify(promptPayload, null, 2)}

Output:
[
  {
    "question_id": "uuid",
    "type": "multiple_choice",
    "content": "rewritten question with different names or numbers",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "B",
    "explanation": "short explanation or null"
  }
]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const parsed = extractJsonArray(text);

  return Array.isArray(parsed)
    ? (parsed as GeneratedVariantCandidate[])
    : [];
}

export async function getSessionQuestionVariantMap(
  supabase: SupabaseServerClient,
  sessionId: string
) {
  const { data, error } = await supabase
    .from("exam_session_question_variants")
    .select(
      "id, session_id, question_id, user_id, type, content, content_html, image_url, options, correct_answer, explanation, created_at, updated_at"
    )
    .eq("session_id", sessionId);

  if (error) {
    if (isQuestionVariantSchemaMissing(error.code, error.message)) {
      return new Map<string, StoredQuestionVariant>();
    }

    throw new Error(error.message);
  }

  return new Map(
    (data ?? []).map((variant) => [
      String(variant.question_id),
      variant as StoredQuestionVariant,
    ])
  );
}

async function upsertSessionVariantRows(
  supabase: SupabaseServerClient,
  existingMap: Map<string, StoredQuestionVariant>,
  rows: Array<{
    session_id: string;
    question_id: string;
    user_id: string;
    type: QuestionType;
    content: string;
    content_html: string | null;
    image_url: string | null;
    options: string[] | null;
    correct_answer: string | null;
    explanation: string | null;
  }>
) {
  if (rows.length === 0) {
    return existingMap;
  }

  const { data, error } = await supabase
    .from("exam_session_question_variants")
    .upsert(rows, {
      onConflict: "session_id,question_id",
    })
    .select(
      "id, session_id, question_id, user_id, type, content, content_html, image_url, options, correct_answer, explanation, created_at, updated_at"
    );

  if (error) {
    if (isQuestionVariantSchemaMissing(error.code, error.message)) {
      return existingMap;
    }

    throw new Error(error.message);
  }

  const merged = new Map(existingMap);
  for (const row of data ?? []) {
    merged.set(String(row.question_id), row as StoredQuestionVariant);
  }

  return merged;
}

export async function getQuestionVariantPresetMap(
  supabase: SupabaseServerClient,
  questionIds: string[]
) {
  if (questionIds.length === 0) {
    return new Map<string, StoredQuestionVariantPreset[]>();
  }

  const { data, error } = await supabase
    .from("question_ai_variant_presets")
    .select(
      "id, question_id, slot, type, content, content_html, image_url, options, correct_answer, explanation, created_at, updated_at"
    )
    .in("question_id", questionIds)
    .order("slot", { ascending: true });

  if (error) {
    if (isQuestionVariantSchemaMissing(error.code, error.message)) {
      return new Map<string, StoredQuestionVariantPreset[]>();
    }

    throw new Error(error.message);
  }

  const presetMap = new Map<string, StoredQuestionVariantPreset[]>();

  for (const preset of data ?? []) {
    const questionId = String(preset.question_id);
    const existing = presetMap.get(questionId) ?? [];
    existing.push(preset as StoredQuestionVariantPreset);
    presetMap.set(questionId, existing);
  }

  return presetMap;
}

export async function deleteQuestionVariantPresets(
  supabase: SupabaseServerClient,
  questionId: string
) {
  const { error } = await supabase
    .from("question_ai_variant_presets")
    .delete()
    .eq("question_id", questionId);

  if (error && !isQuestionVariantSchemaMissing(error.code, error.message)) {
    throw new Error(error.message);
  }
}

export async function ensureQuestionVariantPresets(
  supabase: SupabaseServerClient,
  question: VariantQuestionBase
) {
  if (getResolvedVariantMode(question) !== "two_fixed") {
    await deleteQuestionVariantPresets(supabase, question.id);
    return [];
  }

  const rows = await Promise.all(
    Array.from({ length: 2 }, async (_, index) => {
      const slot = index + 1;
      let normalized: StoredQuestionVariant | null = null;

      try {
        const [candidate] = await callGeminiForQuestionVariants(
          `fixed:${question.id}:slot:${slot}`,
          [question]
        );
        normalized = normalizeGeneratedVariant(question, candidate);
      } catch (error) {
        console.error("[question-variants] preset generation failed", error);
      }

      const variant = normalized ?? buildFallbackVariant(question);

      return {
        question_id: question.id,
        slot,
        type: variant.type,
        content: variant.content,
        content_html: variant.content_html,
        image_url: variant.image_url,
        options: variant.options,
        correct_answer: variant.correct_answer,
        explanation: variant.explanation,
      };
    })
  );

  const { data, error } = await supabase
    .from("question_ai_variant_presets")
    .upsert(rows, {
      onConflict: "question_id,slot",
    })
    .select(
      "id, question_id, slot, type, content, content_html, image_url, options, correct_answer, explanation, created_at, updated_at"
    );

  if (error) {
    if (isQuestionVariantSchemaMissing(error.code, error.message)) {
      throw new Error(error.message);
    }

    throw new Error(error.message);
  }

  return (data ?? []) as StoredQuestionVariantPreset[];
}

export async function ensureSessionVariantsForSession(
  supabase: SupabaseServerClient,
  params: {
    sessionId: string;
    userId: string;
    questions: VariantQuestionBase[];
    variantSlot: number;
    existingMap?: Map<string, StoredQuestionVariant>;
  }
) {
  const existingMap =
    params.existingMap ??
    (await getSessionQuestionVariantMap(supabase, params.sessionId));
  const rows: Array<{
    session_id: string;
    question_id: string;
    user_id: string;
    type: QuestionType;
    content: string;
    content_html: string | null;
    image_url: string | null;
    options: string[] | null;
    correct_answer: string | null;
    explanation: string | null;
  }> = [];

  const fixedQuestions = params.questions.filter(
    (question) =>
      Boolean(question.ai_variant_enabled) &&
      getResolvedVariantMode(question) === "two_fixed" &&
      !existingMap.has(question.id)
  );

  if (fixedQuestions.length > 0) {
    const presetMap = await getQuestionVariantPresetMap(
      supabase,
      fixedQuestions.map((question) => question.id)
    );

    rows.push(
      ...fixedQuestions.map((question) => {
        const presets = presetMap.get(question.id) ?? [];
        const matchedPreset =
          presets.find((preset) => preset.slot === params.variantSlot) ??
          presets[0];
        const variant = matchedPreset ?? buildFallbackVariant(question);

        return {
          session_id: params.sessionId,
          question_id: question.id,
          user_id: params.userId,
          type: variant.type,
          content: variant.content,
          content_html: variant.content_html,
          image_url: variant.image_url,
          options: variant.options,
          correct_answer: variant.correct_answer,
          explanation: variant.explanation,
        };
      })
    );
  }

  const perStudentQuestions = params.questions.filter(
    (question) =>
      Boolean(question.ai_variant_enabled) &&
      getResolvedVariantMode(question) === "per_student" &&
      !existingMap.has(question.id)
  );

  if (perStudentQuestions.length > 0) {
    let candidates: GeneratedVariantCandidate[] = [];

    try {
      candidates = await callGeminiForQuestionVariants(
        params.sessionId,
        perStudentQuestions
      );
    } catch (error) {
      console.error("[question-variants] generation failed", error);
    }

    const candidateMap = new Map(
      candidates.map((candidate) => [
        String(candidate.question_id ?? ""),
        candidate,
      ])
    );

    rows.push(
      ...perStudentQuestions.map((question) => {
        const normalized =
          normalizeGeneratedVariant(question, candidateMap.get(question.id)) ??
          buildFallbackVariant(question);

        return {
          session_id: params.sessionId,
          question_id: question.id,
          user_id: params.userId,
          type: normalized.type,
          content: normalized.content,
          content_html: normalized.content_html,
          image_url: normalized.image_url,
          options: normalized.options,
          correct_answer: normalized.correct_answer,
          explanation: normalized.explanation,
        };
      })
    );
  }

  return upsertSessionVariantRows(supabase, existingMap, rows);
}

export async function ensureSessionFixedQuestionVariants(
  supabase: SupabaseServerClient,
  params: {
    sessionId: string;
    userId: string;
    questions: VariantQuestionBase[];
    variantSlot: number;
  }
) {
  const enabledQuestions = params.questions.filter(
    (question) =>
      Boolean(question.ai_variant_enabled) &&
      getResolvedVariantMode(question) === "two_fixed"
  );

  if (enabledQuestions.length === 0) {
    return new Map<string, StoredQuestionVariant>();
  }

  const existingMap = await getSessionQuestionVariantMap(
    supabase,
    params.sessionId
  );
  const missingQuestions = enabledQuestions.filter(
    (question) => !existingMap.has(question.id)
  );

  if (missingQuestions.length === 0) {
    return existingMap;
  }

  const presetMap = await getQuestionVariantPresetMap(
    supabase,
    missingQuestions.map((question) => question.id)
  );

  const rows = missingQuestions.map((question) => {
    const presets = presetMap.get(question.id) ?? [];
    const matchedPreset =
      presets.find((preset) => preset.slot === params.variantSlot) ?? presets[0];
    const variant = matchedPreset ?? buildFallbackVariant(question);

    return {
      session_id: params.sessionId,
      question_id: question.id,
      user_id: params.userId,
      type: variant.type,
      content: variant.content,
      content_html: variant.content_html,
      image_url: variant.image_url,
      options: variant.options,
      correct_answer: variant.correct_answer,
      explanation: variant.explanation,
    };
  });

  return upsertSessionVariantRows(supabase, existingMap, rows);
}

export async function ensureSessionQuestionVariants(
  supabase: SupabaseServerClient,
  params: {
    sessionId: string;
    userId: string;
    questions: VariantQuestionBase[];
  }
) {
  const enabledQuestions = params.questions.filter(
    (question) =>
      Boolean(question.ai_variant_enabled) &&
      getResolvedVariantMode(question) === "per_student"
  );

  if (enabledQuestions.length === 0) {
    return new Map<string, StoredQuestionVariant>();
  }

  const existingMap = await getSessionQuestionVariantMap(
    supabase,
    params.sessionId
  );
  const missingQuestions = enabledQuestions.filter(
    (question) => !existingMap.has(question.id)
  );

  if (missingQuestions.length === 0) {
    return existingMap;
  }

  let candidates: GeneratedVariantCandidate[] = [];

  try {
    candidates = await callGeminiForQuestionVariants(
      params.sessionId,
      missingQuestions
    );
  } catch (error) {
    console.error("[question-variants] generation failed", error);
  }

  const candidateMap = new Map(
    candidates.map((candidate) => [
      String(candidate.question_id ?? ""),
      candidate,
    ])
  );

  const rows = missingQuestions.map((question) => {
    const normalized =
      normalizeGeneratedVariant(question, candidateMap.get(question.id)) ??
      buildFallbackVariant(question);

    return {
      session_id: params.sessionId,
      question_id: question.id,
      user_id: params.userId,
      type: normalized.type,
      content: normalized.content,
      content_html: normalized.content_html,
      image_url: normalized.image_url,
      options: normalized.options,
      correct_answer: normalized.correct_answer,
      explanation: normalized.explanation,
    };
  });

  return upsertSessionVariantRows(supabase, existingMap, rows);
}

export function applyStoredVariantToQuestion<
  T extends {
    type: QuestionType | string;
    content: string;
    content_html: string | null;
    image_url: string | null;
    options: string[] | null;
    correct_answer?: string | null;
    explanation?: string | null;
  },
>(
  question: T,
  variant: StoredQuestionVariant | null | undefined
) {
  if (!variant) return question;

  return {
    ...question,
    type: variant.type,
    content: variant.content,
    content_html: variant.content_html,
    image_url: variant.image_url,
    options: variant.options,
    correct_answer: variant.correct_answer,
    explanation: variant.explanation,
  } as T;
}

export function getMatchingDisplayPairs(options: unknown) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      const [left, ...rightParts] = String(option).split("|||");
      const right = rightParts.join("|||");
      if (!left || !right) return null;

      return {
        left,
        right,
      };
    })
    .filter(
      (item): item is { left: string; right: string } => Boolean(item)
    );
}
