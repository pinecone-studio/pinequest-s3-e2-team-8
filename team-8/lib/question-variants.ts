import { getPromptModel } from "@/lib/ai/config";
import { createClient } from "@/lib/supabase/server";
import type { QuestionType } from "@/types";

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
    normalizedMessage.includes("exam_session_question_variants") ||
    (normalizedMessage.includes("schema cache") &&
      normalizedMessage.includes("questions"))
  );
}

function extractJsonArray(text: string) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("AI хувилбарын JSON хариултыг уншиж чадсангүй.");
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

async function callGeminiForQuestionVariants(
  sessionId: string,
  questions: VariantQuestionBase[]
) {
  const model = getPromptModel();
  const promptPayload = questions.map((question) => ({
    question_id: question.id,
    seed_hint: `${sessionId}:${question.id}`,
    type: question.type,
    content: question.content,
    options: question.options,
    correct_answer: question.correct_answer,
    explanation: question.explanation,
  }));

  const prompt = `Чи шалгалтын асуултын нэг хувилбарыг сурагч бүрт өөр өгөгдөл, нэр, тоо, нөхцөлөөр хувиргадаг туслах AI юм.

Гол дүрэм:
1. question_id-г яг хэвээр нь буцаа.
2. type-г огт өөрчлөхгүй.
3. Асуултын сэдэв, чадвар, хүндрэлийн түвшин, зөв/буруу логикийг хадгал.
4. Зөвхөн гаднах өгөгдөл, тоо, нэр, объект, хүснэгтийн утга, хувьсагч, сонголтын текстийг шинэчил.
5. Шинэ correct_answer нь шинэ options-той 100% таарч байх ёстой.
6. matching төрөл дээр options-ыг [{"left":"...","right":"..."}] хэлбэрээр өг.
7. multiple_response төрөл дээр correct_answer-ыг string array эсвэл JSON array string хэлбэрээр өгч болно.
8. essay төрөл дээр correct_answer-г null өг.
9. JSON array-аас өөр тайлбар, markdown, code block битгий нэм.
10. seed_hint бүрийн дагуу хувилбарууд хоорондоо ялгаатай байг.

Оролт:
${JSON.stringify(promptPayload, null, 2)}

Гаралт:
[
  {
    "question_id": "uuid",
    "type": "multiple_choice",
    "content": "хувиргасан асуулт",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "B",
    "explanation": "товч тайлбар эсвэл null"
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

export async function ensureSessionQuestionVariants(
  supabase: SupabaseServerClient,
  params: {
    sessionId: string;
    userId: string;
    questions: VariantQuestionBase[];
  }
) {
  const enabledQuestions = params.questions.filter((question) =>
    Boolean(question.ai_variant_enabled)
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
      normalizeGeneratedVariant(question, candidateMap.get(question.id)) ?? {
        question_id: question.id,
        type: question.type,
        content: question.content,
        content_html: question.content_html ?? null,
        image_url: question.image_url ?? null,
        options: question.options ?? null,
        correct_answer: question.correct_answer ?? null,
        explanation: question.explanation ?? null,
      };

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
