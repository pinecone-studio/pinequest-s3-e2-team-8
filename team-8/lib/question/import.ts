import * as XLSX from "xlsx";
import type { QuestionImportDraft, QuestionType } from "@/types";

type SpreadsheetRow = Record<string, string>;

const CONTENT_KEYS = ["content", "question", "question_text", "asuult"];
const TYPE_KEYS = ["type", "question_type", "questiontype", "turul"];
const ANSWER_KEYS = ["correct_answer", "answer", "answers", "correct"];
const POINTS_KEYS = ["points", "score", "оноо"];
const EXPLANATION_KEYS = ["explanation", "solution", "tailbar"];
const IMAGE_KEYS = ["image_url", "image", "zurag"];
const CONTENT_HTML_KEYS = ["content_html", "html", "formatted_content"];

function normalizeHeaderKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCellValue(value: unknown) {
  return String(value ?? "").trim();
}

function getFirstValue(row: SpreadsheetRow, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value) return value;
  }

  return "";
}

function splitAnswerTokens(value: string) {
  if (!value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {}

  return value
    .split(/\r?\n|[|;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapExplicitType(value: string): QuestionType | null {
  const normalized = normalizeHeaderKey(value);

  switch (normalized) {
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

function optionTokenToValue(token: string, options: string[]) {
  const exact = options.find(
    (option) => option.trim().toLowerCase() === token.trim().toLowerCase()
  );
  if (exact) return exact;

  if (/^\d+$/.test(token)) {
    const index = Number(token) - 1;
    if (index >= 0 && index < options.length) {
      return options[index];
    }
  }

  if (/^[A-Z]$/i.test(token)) {
    const index = token.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < options.length) {
      return options[index];
    }
  }

  return token.trim();
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractOptionValues(row: SpreadsheetRow) {
  return Object.entries(row)
    .map(([key, value]) => {
      const match = key.match(/^(?:option|choice|opt)_?(\d+)$/);
      if (!match) return null;

      return {
        index: Number(match[1]),
        value: value.trim(),
      };
    })
    .filter(
      (
        item
      ): item is {
        index: number;
        value: string;
      } => Boolean(item)
    )
    .sort((a, b) => a.index - b.index)
    .map((item) => item.value)
    .filter(Boolean);
}

function extractMatchingPairs(row: SpreadsheetRow) {
  const pairs = new Map<number, { left: string; right: string }>();

  for (const [key, value] of Object.entries(row)) {
    const match = key.match(/^(?:match|pair)_?(left|right)_?(\d+)$/);
    if (!match) continue;

    const side = match[1] as "left" | "right";
    const index = Number(match[2]);
    const existing = pairs.get(index) ?? { left: "", right: "" };
    existing[side] = value.trim();
    pairs.set(index, existing);
  }

  return [...pairs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, pair]) => pair)
    .filter((pair) => pair.left || pair.right);
}

function inferQuestionType(params: {
  explicitType: QuestionType | null;
  options: string[];
  matchingPairs: { left: string; right: string }[];
  rawCorrectAnswer: string;
}) {
  if (params.explicitType) return params.explicitType;
  if (params.matchingPairs.length >= 2) return "matching";
  if (params.options.length >= 2) {
    return splitAnswerTokens(params.rawCorrectAnswer).length > 1
      ? "multiple_response"
      : "multiple_choice";
  }
  if (params.rawCorrectAnswer.trim()) return "fill_blank";
  return "essay";
}

export function validateQuestionImportDraft(draft: QuestionImportDraft) {
  const errors: string[] = [];

  if (!draft.content.trim() && !draft.contentHtml.trim()) {
    errors.push("Асуултын агуулга хоосон байна.");
  }

  if (!Number.isFinite(draft.points) || draft.points <= 0) {
    errors.push("Оноо 0-ээс их байх ёстой.");
  }

  if (draft.type === "multiple_choice") {
    const options = draft.options.map((item) => item.trim()).filter(Boolean);
    if (options.length < 2) {
      errors.push("Сонгох асуултад дор хаяж 2 сонголт хэрэгтэй.");
    }

    if (!draft.correctAnswer.trim() || !options.includes(draft.correctAnswer.trim())) {
      errors.push("Зөв хариулт нь сонголтуудын нэг байх ёстой.");
    }
  }

  if (draft.type === "multiple_response") {
    const options = draft.options.map((item) => item.trim()).filter(Boolean);
    const answers = draft.multipleCorrectAnswers
      .map((item) => item.trim())
      .filter(Boolean);

    if (options.length < 2) {
      errors.push("Олон сонголттой асуултад дор хаяж 2 сонголт хэрэгтэй.");
    }

    if (answers.length < 1) {
      errors.push("Дор хаяж 1 зөв хариулт сонгох хэрэгтэй.");
    }

    if (answers.some((answer) => !options.includes(answer))) {
      errors.push("Зөв хариултууд нь сонголтуудын дотор байх ёстой.");
    }
  }

  if (draft.type === "fill_blank" && !draft.correctAnswer.trim()) {
    errors.push("Нөхөх асуултын зөв хариултыг оруулна уу.");
  }

  if (draft.type === "matching") {
    const pairs = draft.matchingPairs.filter(
      (pair) => pair.left.trim() && pair.right.trim()
    );

    if (pairs.length < 2) {
      errors.push("Холбох асуултад дор хаяж 2 мөр хэрэгтэй.");
    }
  }

  return errors;
}

export function draftToQuestionFormShape(draft: QuestionImportDraft) {
  const base = {
    type: draft.type,
    content: draft.content.trim(),
    content_html: draft.contentHtml.trim(),
    image_url: draft.imageUrl.trim(),
    explanation: draft.explanation.trim(),
    points: String(draft.points || 1),
    difficulty: "medium",
    tags: "",
    passage_id: "",
  };

  if (draft.type === "multiple_choice") {
    return {
      ...base,
      options: JSON.stringify(draft.options.map((item) => item.trim()).filter(Boolean)),
      correct_answer: draft.correctAnswer.trim(),
    };
  }

  if (draft.type === "multiple_response") {
    return {
      ...base,
      options: JSON.stringify(draft.options.map((item) => item.trim()).filter(Boolean)),
      correct_answer: JSON.stringify(
        dedupe(draft.multipleCorrectAnswers.map((item) => item.trim()).filter(Boolean))
      ),
    };
  }

  if (draft.type === "fill_blank") {
    return {
      ...base,
      options: "[]",
      correct_answer: draft.correctAnswer.trim(),
    };
  }

  if (draft.type === "matching") {
    return {
      ...base,
      options: JSON.stringify(
        draft.matchingPairs
          .map((pair) => ({
            left: pair.left.trim(),
            right: pair.right.trim(),
          }))
          .filter((pair) => pair.left && pair.right)
      ),
      correct_answer: "",
    };
  }

  return {
    ...base,
    options: "[]",
    correct_answer: "",
  };
}

export function buildQuestionImportDrafts(
  fileBuffer: ArrayBuffer,
  fileName: string
) {
  const workbook = XLSX.read(fileBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Файл дотроос sheet олдсонгүй.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  const rows: SpreadsheetRow[] = rawRows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        normalizeHeaderKey(key),
        normalizeCellValue(value),
      ])
    )
  );

  const drafts = rows
    .map((row, index) => {
      const content = getFirstValue(row, CONTENT_KEYS);
      const rawCorrectAnswer = getFirstValue(row, ANSWER_KEYS);
      const options = extractOptionValues(row);
      const matchingPairs = extractMatchingPairs(row);
      const explicitType = mapExplicitType(getFirstValue(row, TYPE_KEYS));

      const hasContent =
        content ||
        rawCorrectAnswer ||
        options.length > 0 ||
        matchingPairs.length > 0;

      if (!hasContent) return null;

      const type = inferQuestionType({
        explicitType,
        options,
        matchingPairs,
        rawCorrectAnswer,
      });

      const answerTokens = splitAnswerTokens(rawCorrectAnswer);
      const resolvedAnswers = answerTokens.map((token) =>
        optionTokenToValue(token, options)
      );

      const draft: QuestionImportDraft = {
        draftId: `${fileName}-${index + 2}-${type}`,
        sourceRow: index + 2,
        type,
        content,
        contentHtml: getFirstValue(row, CONTENT_HTML_KEYS),
        imageUrl: getFirstValue(row, IMAGE_KEYS),
        explanation: getFirstValue(row, EXPLANATION_KEYS),
        points: Number(getFirstValue(row, POINTS_KEYS)) || 1,
        options,
        correctAnswer:
          type === "multiple_choice" || type === "fill_blank"
            ? resolvedAnswers[0] ?? rawCorrectAnswer.trim()
            : "",
        multipleCorrectAnswers:
          type === "multiple_response" ? dedupe(resolvedAnswers) : [],
        matchingPairs:
          type === "matching"
            ? matchingPairs.map((pair) => ({
                left: pair.left,
                right: pair.right,
              }))
            : [],
        warnings: [],
        errors: [],
      };

      draft.errors = validateQuestionImportDraft(draft);

      return draft;
    })
    .filter((draft): draft is QuestionImportDraft => Boolean(draft));

  if (drafts.length === 0) {
    throw new Error(
      "Импортлох мөр олдсонгүй. Header болон асуултын мөрүүдээ шалгана уу."
    );
  }

  return drafts;
}
