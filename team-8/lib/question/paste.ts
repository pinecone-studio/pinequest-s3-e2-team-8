import type { QuestionType } from "@/types";

interface ParsedOptionLine {
  label: string;
  value: string;
  series: "latin" | "cyrillic" | "number";
  index: number;
}

export interface ParsedPastedQuestion {
  type: QuestionType;
  content: string;
  options: string[];
  correctAnswer: string;
  multipleCorrectAnswers: string[];
}

const cyrillicLabelOrder = Array.from(
  "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
);

function normalizeLine(line: string) {
  return line.replace(/\u00A0/g, " ").trim();
}

function normalizeComparisonValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[().,:;'"`]+/g, "")
    .replace(/\s+/g, " ");
}

function normalizeLabelToken(value: string) {
  return value.trim().replace(/[.)\]:-]+$/g, "").toUpperCase();
}

function parseOptionLabel(label: string) {
  const normalized = normalizeLabelToken(label);

  if (/^\d+$/.test(normalized)) {
    return {
      series: "number" as const,
      index: Number(normalized) - 1,
    };
  }

  if (/^[A-Z]$/i.test(normalized)) {
    return {
      series: "latin" as const,
      index: normalized.charCodeAt(0) - 65,
    };
  }

  const cyrillicIndex = cyrillicLabelOrder.indexOf(normalized);
  if (cyrillicIndex >= 0) {
    return {
      series: "cyrillic" as const,
      index: cyrillicIndex,
    };
  }

  return null;
}

function parseOptionLine(line: string): ParsedOptionLine | null {
  const match = line.match(
    /^(?:[-*•]\s*)?([A-Za-zА-Яа-яЁёӨөҮү]|\d{1,2})[.):\]-]?\s+(.+)$/u
  );
  if (!match) return null;

  const labelInfo = parseOptionLabel(match[1]);
  if (!labelInfo) return null;

  return {
    label: normalizeLabelToken(match[1]),
    value: match[2].trim(),
    series: labelInfo.series,
    index: labelInfo.index,
  };
}

function isAnswerLine(line: string) {
  return /^(?:зөв\s*хариулт(?:ууд)?|хариулт(?:ууд)?|answer|correct\s*answer(?:s)?)\s*[:\-]\s*/iu.test(
    line
  );
}

function extractAnswerText(line: string) {
  return line
    .replace(
      /^(?:зөв\s*хариулт(?:ууд)?|хариулт(?:ууд)?|answer|correct\s*answer(?:s)?)\s*[:\-]\s*/iu,
      ""
    )
    .trim();
}

function splitAnswerTokens(value: string) {
  return value
    .split(/\r?\n|[|;,/]|\s+\b(?:and|ба)\b\s+/iu)
    .map((item) => item.trim())
    .filter(Boolean);
}

function findOptionBlock(lines: string[]) {
  const parsed = lines.map(parseOptionLine);

  for (let start = 0; start < parsed.length - 1; start += 1) {
    const first = parsed[start];
    const second = parsed[start + 1];

    if (!first || !second) continue;
    if (first.series !== second.series) continue;
    if (second.index !== first.index + 1) continue;

    const options: ParsedOptionLine[] = [first, second];
    let previousIndex = second.index;

    for (let cursor = start + 2; cursor < parsed.length; cursor += 1) {
      const candidate = parsed[cursor];
      if (!candidate || candidate.series !== first.series) break;
      if (candidate.index <= previousIndex) break;

      options.push(candidate);
      previousIndex = candidate.index;
    }

    return {
      start,
      options,
    };
  }

  return null;
}

function cleanupQuestionContent(lines: string[]) {
  if (lines.length === 0) return "";

  return lines
    .map((line, index) =>
      index === 0 ? line.replace(/^\d+[.)]\s*/, "").trim() : line.trim()
    )
    .join("\n")
    .trim();
}

function resolveAnswerToken(token: string, options: ParsedOptionLine[]) {
  const cleaned = token.trim();
  const normalized = normalizeComparisonValue(cleaned);

  const labelMatch = cleaned.match(
    /^([A-Za-zА-Яа-яЁёӨөҮү]|\d{1,2})(?:[.):\]-]|\s|$)/u
  );
  if (labelMatch) {
    const normalizedLabel = normalizeLabelToken(labelMatch[1]);
    const byLabel = options.find((option) => option.label === normalizedLabel);
    if (byLabel) return byLabel.value;
  }

  const byExactValue = options.find(
    (option) => normalizeComparisonValue(option.value) === normalized
  );
  if (byExactValue) return byExactValue.value;

  if (/^\d+$/.test(cleaned)) {
    const index = Number(cleaned) - 1;
    if (index >= 0 && index < options.length) {
      return options[index].value;
    }
  }

  return cleaned;
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function parsePastedQuestionText(
  pastedText: string
): ParsedPastedQuestion | null {
  const lines = pastedText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  if (lines.length === 0) return null;

  const answerLines = lines.filter(isAnswerLine).map(extractAnswerText);
  const bodyLines = lines.filter((line) => !isAnswerLine(line));
  const optionBlock = findOptionBlock(bodyLines);

  if (optionBlock) {
    const questionLines = bodyLines.slice(0, optionBlock.start);
    const content = cleanupQuestionContent(questionLines);
    const options = optionBlock.options.map((option) => option.value);
    const resolvedAnswers = dedupe(
      answerLines.flatMap((line) =>
        splitAnswerTokens(line).map((token) =>
          resolveAnswerToken(token, optionBlock.options)
        )
      )
    );

    return {
      type: resolvedAnswers.length > 1 ? "multiple_response" : "multiple_choice",
      content,
      options,
      correctAnswer: resolvedAnswers[0] ?? "",
      multipleCorrectAnswers: resolvedAnswers,
    };
  }

  if (answerLines.length > 0) {
    return {
      type: "fill_blank",
      content: cleanupQuestionContent(bodyLines),
      options: [],
      correctAnswer: answerLines.join("\n").trim(),
      multipleCorrectAnswers: [],
    };
  }

  return null;
}
