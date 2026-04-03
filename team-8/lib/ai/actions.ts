"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getModel } from "@/lib/ai/config";
import { redis } from "@/lib/redis";
import { validateQuestionImportDraft } from "@/lib/question/import";
import { getAllowedSubjectIds } from "@/lib/teacher/permissions";
import type { QuestionImportDraft, QuestionType } from "@/types";

// ─── AI Question Generator ──────────────────────────────────────────

export interface AIGenerateQuestionsInput {
  examId: string;
  subjectName: string;
  gradeLevel: number;
  subtopic: string;
  difficultyLevel: number;
  questionCount: number;
  questionTypes: QuestionType[];
  sampleContext: string;
}

interface GeneratedQuestion {
  type: QuestionType;
  content: string;
  options: string[] | null;
  correct_answer: string | null;
  points: number;
  explanation: string | null;
}

interface RawGeneratedQuestion {
  type?: unknown;
  content?: unknown;
  options?: unknown;
  correct_answer?: unknown;
  points?: unknown;
  explanation?: unknown;
}

type QuestionGenerationPromptInput = Omit<AIGenerateQuestionsInput, "examId"> & {
  additionalInstructions?: string;
};

export interface GeneratePrivateBankQuestionDraftsInput {
  subjectId: string;
  gradeLevel: number | null;
  questionType: QuestionType;
  questionCount: number;
  prompt: string;
}

function buildQuestionGenerationPrompt(input: QuestionGenerationPromptInput) {
  const difficultyLabels: Record<number, string> = {
    1: "Хөнгөн (суурь мэдлэг шалгах)",
    2: "Дунд (хэрэглээ, задлан шинжлэх)",
    3: "Хүнд (нийлмэл бодлого, дүгнэлт хийх)",
  };

  const typeInstructions: Record<string, string> = {
    multiple_choice:
      'Сонгох: "options" дотор 4 сонголт, "correct_answer" нь options-ийн нэгтэй тэнцүү',
    multiple_response:
      'Олон зөв: "options" дотор 4-5 сонголт, "correct_answer" нь JSON array (жишээ: \'["A","C"]\')',
    fill_blank:
      'Нөхөх: "options" null, "correct_answer" нь зөв хариулт string',
    essay:
      'Задгай: "options" null, "correct_answer" null',
    matching:
      'Холбох: "options" нь ["зүүн1|||баруун1","зүүн2|||баруун2"] хэлбэртэй, "correct_answer" null',
  };

  const selectedTypeInstructions = input.questionTypes
    .map((t) => typeInstructions[t])
    .join("\n");

  return `Чи Монгол хэлээр шалгалтын асуулт боловсруулдаг AI багш юм.

Хичээл: ${input.subjectName}
${input.gradeLevel ? `Анги: ${input.gradeLevel}-р анги` : "Анги: Ерөнхий"}
${input.subtopic ? `Дэд сэдэв: ${input.subtopic}` : ""}
Түвшин: ${difficultyLabels[input.difficultyLevel] || "Дунд"}
Үүсгэх асуултын тоо: ${input.questionCount}

Дараах төрлүүдийг ашигла:
${selectedTypeInstructions}

${input.sampleContext ? `Жишиг шалгалтын агуулгаас суралц:\n${input.sampleContext}\n\nДээрх жишиг асуултуудтай ижил хэв маяг, агуулга, хүндрэлийн түвшинг баримтлан ШИНЭ асуултууд үүсгэ. Жишиг асуултуудыг шууд хуулахгүй.` : ""}
${input.additionalInstructions ? `\nНэмэлт заавар:\n${input.additionalInstructions}\n` : ""}

Заавал дараах JSON array форматаар хариул (өөр текст бүү бич):
[
  {
    "type": "question_type",
    "content": "Асуултын текст (Монгол хэлээр)",
    "options": ["сонголт1", "сонголт2", "сонголт3", "сонголт4"] эсвэл null,
    "correct_answer": "зөв хариулт" эсвэл null,
    "points": ${input.difficultyLevel === 3 ? 3 : input.difficultyLevel === 2 ? 2 : 1},
    "explanation": "Хариултын тайлбар"
  }
]`;
}

async function callGeminiForQuestionGeneration(
  input: QuestionGenerationPromptInput
): Promise<GeneratedQuestion[]> {
  const model = getModel();
  const prompt = buildQuestionGenerationPrompt(input);

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const parsed = extractGeneratedQuestionArray(text);
  return parsed
    .map((question) => normalizeGeneratedQuestion(question))
    .filter((question): question is GeneratedQuestion => {
      if (!question) return false;
      return input.questionTypes.includes(question.type);
    });
}

function normalizeAliasKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeGeneratedQuestionType(value: unknown): QuestionType | null {
  if (typeof value !== "string") return null;

  switch (normalizeAliasKey(value)) {
    case "multiple_choice":
    case "multiplechoice":
    case "single_choice":
    case "single":
    case "mcq":
      return "multiple_choice";
    case "multiple_response":
    case "multipleresponse":
    case "multiple_select":
    case "multi_select":
    case "checkbox":
      return "multiple_response";
    case "fill_blank":
    case "fillblank":
    case "blank":
    case "short_answer":
      return "fill_blank";
    case "essay":
    case "open":
    case "open_ended":
      return "essay";
    case "matching":
    case "match":
    case "pairing":
      return "matching";
    default:
      return null;
  }
}

function extractGeneratedQuestionArray(text: string): RawGeneratedQuestion[] {
  const trimmed = text.trim();

  const tryParseCandidate = (candidate: string): RawGeneratedQuestion[] | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;

      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is RawGeneratedQuestion =>
            typeof item === "object" && item !== null
        );
      }

      if (parsed && typeof parsed === "object") {
        const nested = (parsed as Record<string, unknown>).questions;
        if (Array.isArray(nested)) {
          return nested.filter(
            (item): item is RawGeneratedQuestion =>
              typeof item === "object" && item !== null
          );
        }
      }
    } catch {}

    return null;
  };

  const exact = tryParseCandidate(trimmed);
  if (exact) return exact;

  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const arrayCandidate = tryParseCandidate(jsonMatch[0]);
    if (arrayCandidate) return arrayCandidate;
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const objectCandidate = tryParseCandidate(objectMatch[0]);
    if (objectCandidate) return objectCandidate;
  }

  throw new Error("AI хариултыг задлах боломжгүй байна");
}

function toTrimmedString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function splitStringTokens(value: string, allowPipeDelimiter: boolean) {
  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => toTrimmedString(item))
        .filter(Boolean);
    }
  } catch {}

  const lineTokens = trimmed
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (lineTokens.length > 1) return lineTokens;

  const delimiterPattern = allowPipeDelimiter ? /[|;,]/ : /[;,]/;
  return trimmed
    .split(delimiterPattern)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOptions(value: unknown, type: QuestionType) {
  if (type === "essay" || type === "fill_blank") return null;

  if (type === "matching") {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            const left = toTrimmedString((item as Record<string, unknown>).left);
            const right = toTrimmedString((item as Record<string, unknown>).right);
            if (left && right) return `${left}|||${right}`;
          }
          return "";
        })
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return splitStringTokens(value, false).filter((item) => item.includes("|||"));
    }

    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toTrimmedString(item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return splitStringTokens(value, true);
  }

  return [];
}

function optionTokenToValue(token: string, options: string[]) {
  const normalizedToken = token.trim();
  if (!normalizedToken) return "";

  const exact = options.find(
    (option) => option.trim().toLowerCase() === normalizedToken.toLowerCase()
  );
  if (exact) return exact;

  if (/^\d+$/.test(normalizedToken)) {
    const index = Number(normalizedToken) - 1;
    if (index >= 0 && index < options.length) {
      return options[index];
    }
  }

  if (/^[A-Z]$/i.test(normalizedToken)) {
    const index = normalizedToken.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < options.length) {
      return options[index];
    }
  }

  return normalizedToken;
}

function normalizeCorrectAnswer(
  value: unknown,
  type: QuestionType,
  options: string[] | null
) {
  if (type === "essay" || type === "matching") return null;

  if (type === "fill_blank") {
    return toTrimmedString(value) || null;
  }

  const safeOptions = options ?? [];

  if (type === "multiple_choice") {
    if (Array.isArray(value)) {
      const first = value.map((item) => toTrimmedString(item)).find(Boolean);
      return first ? optionTokenToValue(first, safeOptions) : null;
    }

    const raw = toTrimmedString(value);
    return raw ? optionTokenToValue(raw, safeOptions) : null;
  }

  const tokens = Array.isArray(value)
    ? value.map((item) => toTrimmedString(item)).filter(Boolean)
    : splitStringTokens(toTrimmedString(value), true);

  const normalized = tokens
    .map((token) => optionTokenToValue(token, safeOptions))
    .filter(Boolean);

  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function normalizeGeneratedQuestion(
  question: RawGeneratedQuestion
): GeneratedQuestion | null {
  const type = normalizeGeneratedQuestionType(question.type);
  const content = toTrimmedString(question.content);
  if (!type || !content) return null;

  const options = normalizeOptions(question.options, type);
  const correctAnswer = normalizeCorrectAnswer(question.correct_answer, type, options);
  const parsedPoints =
    typeof question.points === "number"
      ? question.points
      : Number.parseFloat(toTrimmedString(question.points));

  return {
    type,
    content,
    options,
    correct_answer: correctAnswer,
    points: Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : 1,
    explanation: toTrimmedString(question.explanation) || null,
  };
}

function parseMultipleResponseAnswer(rawCorrectAnswer: string | null) {
  if (!rawCorrectAnswer) return [];

  try {
    const parsed = JSON.parse(rawCorrectAnswer);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {}

  return rawCorrectAnswer
    .split(/\r?\n|[|;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMatchingPairs(options: string[] | null) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      const [left, right] = String(option).split("|||");
      if (!left || !right) return null;
      return {
        left: left.trim(),
        right: right.trim(),
      };
    })
    .filter(
      (pair): pair is {
        left: string;
        right: string;
      } => Boolean(pair)
    );
}

function generatedQuestionToDraft(
  question: GeneratedQuestion,
  index: number
): QuestionImportDraft {
  const normalizedType = question.type;
  const draft: QuestionImportDraft = {
    draftId: randomUUID(),
    sourceRow: index + 1,
    type: normalizedType,
    content: String(question.content ?? "").trim(),
    contentHtml: "",
    imageUrl: "",
    explanation: String(question.explanation ?? "").trim(),
    points:
      Number.isFinite(question.points) && question.points > 0
        ? question.points
        : 1,
    options:
      normalizedType === "multiple_choice" ||
      normalizedType === "multiple_response"
        ? Array.isArray(question.options)
          ? question.options.map((option) => String(option).trim())
          : []
        : [],
    correctAnswer:
      normalizedType === "multiple_choice" || normalizedType === "fill_blank"
        ? String(question.correct_answer ?? "").trim()
        : "",
    multipleCorrectAnswers:
      normalizedType === "multiple_response"
        ? parseMultipleResponseAnswer(question.correct_answer)
        : [],
    matchingPairs:
      normalizedType === "matching" ? parseMatchingPairs(question.options) : [],
    warnings: [],
    errors: [],
  };

  draft.errors = validateQuestionImportDraft(draft);
  return draft;
}

async function buildSampleContextForSubject(
  subjectId: string,
  gradeLevel: number | null
) {
  const supabase = await createClient();

  const { data: subject } = await supabase
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .maybeSingle();

  const sampleExamQuery = supabase
    .from("sample_exams")
    .select(
      "title, grade_level, difficulty_level, sample_exam_items(question_bank:question_bank_id(content, type, options, correct_answer, points))"
    )
    .eq("subject_id", subjectId)
    .limit(3);

  const { data: sampleExams } = gradeLevel
    ? await sampleExamQuery.eq("grade_level", gradeLevel)
    : await sampleExamQuery;

  const fallback =
    gradeLevel && (!sampleExams || sampleExams.length === 0)
      ? await supabase
          .from("sample_exams")
          .select(
            "title, grade_level, difficulty_level, sample_exam_items(question_bank:question_bank_id(content, type, options, correct_answer, points))"
          )
          .eq("subject_id", subjectId)
          .limit(3)
      : null;

  const resolvedSampleExams = sampleExams?.length
    ? sampleExams
    : fallback?.data ?? [];

  if (!resolvedSampleExams || resolvedSampleExams.length === 0) {
    return { subjectName: subject?.name ?? "", sampleContext: "" };
  }

  const contextParts: string[] = [];

  for (const se of resolvedSampleExams) {
    const items = (se.sample_exam_items ?? []) as Array<{
      question_bank:
        | {
            content: string;
            type: string;
            options: string[] | null;
            correct_answer: string | null;
            points: number;
          }
        | {
            content: string;
            type: string;
            options: string[] | null;
            correct_answer: string | null;
            points: number;
          }[]
        | null;
    }>;

    const questions = items
      .map((item) =>
        Array.isArray(item.question_bank)
          ? item.question_bank[0]
          : item.question_bank
      )
      .filter(Boolean);

    if (questions.length === 0) continue;

    const sampleLines = questions.slice(0, 5).map((q, i) => {
      const qData = q!;
      let line = `${i + 1}. [${qData.type}] ${qData.content}`;
      if (qData.options) {
        line += ` | Сонголтууд: ${JSON.stringify(qData.options)}`;
      }
      if (qData.correct_answer) {
        line += ` | Хариулт: ${qData.correct_answer}`;
      }
      return line;
    });

    contextParts.push(
      `--- ${se.title} (${se.grade_level}-р анги, түвшин ${se.difficulty_level}) ---\n${sampleLines.join("\n")}`
    );
  }

  return {
    subjectName: subject?.name ?? "",
    sampleContext: contextParts.join("\n\n"),
  };
}

export async function generateQuestionsWithAI(input: AIGenerateQuestionsInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, subject_id, is_published, created_by")
    .eq("id", input.examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтад асуулт нэмэх боломжгүй" };
  }

  try {
    const generated = await callGeminiForQuestionGeneration({
      subjectName: input.subjectName,
      gradeLevel: input.gradeLevel,
      subtopic: input.subtopic,
      difficultyLevel: input.difficultyLevel,
      questionCount: input.questionCount,
      questionTypes: input.questionTypes,
      sampleContext: input.sampleContext,
    });

    if (generated.length === 0) {
      return { error: "AI асуулт үүсгэж чадсангүй. Дахин оролдоно уу." };
    }

    const { data: existing } = await supabase
      .from("questions")
      .select("order_index")
      .eq("exam_id", input.examId)
      .order("order_index", { ascending: false })
      .limit(1);

    let orderIndex =
      existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

    const insertRows = generated.map((q) => {
      const row = {
        exam_id: input.examId,
        subject_id: exam.subject_id,
        subtopic: input.subtopic ? input.subtopic.trim() : null,
        type: q.type,
        content: q.content,
        content_html: null,
        image_url: null,
        options: q.options,
        correct_answer: q.correct_answer,
        points: q.points || 1,
        order_index: orderIndex++,
        explanation: q.explanation,
        created_by: user.id,
        topic_label_source: input.subtopic ? "ai_generated" : "unknown",
        topic_label_confidence: input.subtopic ? 1 : null,
      };
      return row;
    });

    const { error: insertError } = await supabase
      .from("questions")
      .insert(insertRows);

    if (insertError) return { error: insertError.message };

    await redis.del(`educator:exam:${input.examId}:question-page`);
    revalidatePath(`/educator/exams/${input.examId}/questions`);
    return { success: true, count: generated.length };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI асуулт үүсгэхэд алдаа гарлаа";
    return { error: message };
  }
}

export async function generatePrivateBankQuestionDraftsWithAI(
  input: GeneratePrivateBankQuestionDraftsInput
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const subjectId = String(input.subjectId ?? "").trim();
  if (!subjectId) {
    return { error: "Хичээлээ сонгоно уу." };
  }

  const allowedSubjectIds = await getAllowedSubjectIds(supabase, user.id);
  if (allowedSubjectIds !== null && !allowedSubjectIds.includes(subjectId)) {
    return { error: "Энэ хичээлээр AI асуулт үүсгэх эрх байхгүй байна." };
  }

  const normalizedQuestionCount = Math.min(
    Math.max(Number.parseInt(String(input.questionCount), 10) || 10, 1),
    25
  );
  const normalizedGradeLevel = input.gradeLevel
    ? Math.min(Math.max(input.gradeLevel, 1), 12)
    : null;
  const promptText = String(input.prompt ?? "").trim();

  try {
    const { subjectName, sampleContext } = await buildSampleContextForSubject(
      subjectId,
      normalizedGradeLevel
    );

    const generated = await callGeminiForQuestionGeneration({
      subjectName,
      gradeLevel: normalizedGradeLevel ?? 10,
      subtopic: "",
      difficultyLevel: 2,
      questionCount: normalizedQuestionCount,
      questionTypes: [input.questionType],
      sampleContext,
      additionalInstructions: promptText,
    });

    if (generated.length === 0) {
      return { error: "AI асуулт үүсгэж чадсангүй. Дахин оролдоно уу." };
    }

    const drafts = generated.map((question, index) =>
      generatedQuestionToDraft(question, index)
    );

    return {
      success: true,
      subjectName,
      sampleContext,
      drafts,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI асуулт үүсгэхэд алдаа гарлаа";
    return { error: message };
  }
}

export async function getSampleExamContext(
  examId: string
): Promise<{ subjectName: string; sampleContext: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: exam } = await supabase
    .from("exams")
    .select("subject_id, subjects(name)")
    .eq("id", examId)
    .maybeSingle();

  if (!exam?.subject_id) return null;

  const subjectName = Array.isArray(exam.subjects)
    ? exam.subjects[0]?.name
    : (exam.subjects as { name: string } | null)?.name;
  const context = await buildSampleContextForSubject(exam.subject_id, null);

  return {
    subjectName: subjectName || context.subjectName,
    sampleContext: context.sampleContext,
  };
}
