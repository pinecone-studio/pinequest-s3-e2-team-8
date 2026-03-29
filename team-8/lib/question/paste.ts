import type { QuestionType } from "@/types";

type OptionSeries = "latin" | "cyrillic" | "number";

interface ParsedOptionLine {
  label: string;
  value: string;
  series: OptionSeries;
  index: number;
}

interface MatchingItem {
  lineIndex: number;
  optionIndex: number;
  label: string;
  value: string;
  series: OptionSeries;
}

interface MatchingPair {
  left: string;
  right: string;
}

interface MatchingBlock {
  start: number;
  pairs: MatchingPair[];
  leftItems?: MatchingItem[];
  rightItems?: MatchingItem[];
}

export interface ParsedPastedQuestion {
  type: QuestionType;
  content: string;
  options: string[];
  correctAnswer: string;
  multipleCorrectAnswers: string[];
  matchingPairs: MatchingPair[];
}

const cyrillicLabelOrder = Array.from(
  "\u0410\u0411\u0412\u0413\u0414\u0415\u0401\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f"
);

function normalizeLine(line: string) {
  return line.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeComparisonValue(value: string) {
  return normalizeLine(value)
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
  const normalized = normalizeLine(line);
  const match = normalized.match(
    /^(?:[-*•]\s*)?([A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451\u04e8\u04e9\u04ae\u04af]|\d{1,2})[.):\]-]?\s+(.+)$/u
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
  return /^(?:\u0437\u04e9\u0432\s*\u0445\u0430\u0440\u0438\u0443\u043b\u0442(?:\u0443\u0443\u0434)?|\u0445\u0430\u0440\u0438\u0443\u043b\u0442(?:\u0443\u0443\u0434)?|answer|correct\s*answer(?:s)?)(?:\s*[:\-]\s*|\s+)/iu.test(
    line
  );
}

function extractAnswerText(line: string) {
  return line
    .replace(
      /^(?:\u0437\u04e9\u0432\s*\u0445\u0430\u0440\u0438\u0443\u043b\u0442(?:\u0443\u0443\u0434)?|\u0445\u0430\u0440\u0438\u0443\u043b\u0442(?:\u0443\u0443\u0434)?|answer|correct\s*answer(?:s)?)(?:\s*[:\-]\s*|\s+)/iu,
      ""
    )
    .trim();
}

function splitAnswerTokens(value: string) {
  return value
    .split(/\r?\n|[|;,/]|\s+\b(?:and|\u0431\u0430)\b\s+/iu)
    .map((item) => normalizeLine(item))
    .filter(Boolean);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function cleanupQuestionContent(lines: string[]) {
  if (lines.length === 0) return "";

  return lines
    .map((line, index) => {
      if (index > 0) return line.trim();

      return line
        .replace(
          /^(?:question|\u0430\u0441\u0443\u0443\u043b\u0442)\s*\d+(?:[.)]|:)?\s*/iu,
          ""
        )
        .replace(/^(?:\d+[.)]?|[.)])\s*/, "")
        .trim();
    })
    .join("\n")
    .trim();
}

function resolveAnswerToken(token: string, options: ParsedOptionLine[]) {
  const cleaned = normalizeLine(token);
  const normalized = normalizeComparisonValue(cleaned);

  const labelMatch = cleaned.match(
    /^([A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451\u04e8\u04e9\u04ae\u04af]|\d{1,2})(?:[.):\]-]|\s|$)/u
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

function hasMatchingPrompt(text: string) {
  const normalized = normalizeComparisonValue(text);

  return (
    normalized.includes("\u0445\u043e\u043b\u0431\u043e\u043d\u043e \u0443\u0443") ||
    normalized.includes("\u0445\u043e\u043b\u0431\u043e\u0445") ||
    normalized.includes("\u0445\u043e\u043b\u0431\u043e\u0436") ||
    normalized.includes("\u0445\u0430\u0440\u0433\u0430\u043b\u0437\u0443\u0443\u043b") ||
    normalized.includes("\u0442\u0430\u0430\u0440\u0443\u0443\u043b") ||
    normalized.includes("\u0445\u043e\u0441\u043b\u0443\u0443\u043b") ||
    normalized.includes("match")
  );
}

function collectSeriesItems(lines: string[], series: OptionSeries) {
  return lines
    .map((line, lineIndex) => {
      const parsed = parseOptionLine(line);
      if (!parsed || parsed.series !== series) return null;

      return {
        lineIndex,
        optionIndex: parsed.index,
        label: parsed.label,
        value: parsed.value.trim(),
        series: parsed.series,
      };
    })
    .filter((item): item is MatchingItem => Boolean(item));
}

function collectRightSideItems(lines: string[]) {
  return lines
    .map((line, lineIndex) => {
      const parsed = parseOptionLine(line);
      if (!parsed || parsed.series === "number") return null;

      return {
        lineIndex,
        optionIndex: parsed.index,
        label: parsed.label,
        value: parsed.value.trim(),
        series: parsed.series,
      };
    })
    .filter(
      (
        item
      ): item is {
        lineIndex: number;
        optionIndex: number;
        label: string;
        value: string;
        series: "latin" | "cyrillic";
      } => Boolean(item)
    );
}

function extractArrowMatchingBlock(lines: string[]): MatchingBlock | null {
  const pairs: MatchingPair[] = [];
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeLine(lines[index]);
    const match = normalized.match(
      /^(?:[-*•]\s*)?(?:\d+[.)]\s*)?(.+?)\s*(?:->|=>| - )\s*(.+)$/u
    );

    if (!match) {
      if (pairs.length >= 2) break;
      pairs.length = 0;
      start = -1;
      continue;
    }

    if (start === -1) {
      start = index;
    }

    pairs.push({
      left: match[1].trim(),
      right: match[2].trim(),
    });
  }

  if (pairs.length < 2 || start === -1) {
    return null;
  }

  return { start, pairs };
}

function extractInlineMatchingBlock(lines: string[]): MatchingBlock | null {
  const pairs: MatchingPair[] = [];
  const leftItems: MatchingItem[] = [];
  const rightItems: MatchingItem[] = [];
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeLine(lines[index]);
    const match = normalized.match(
      /^(\d{1,2})[.)]\s+(.+?)\s+([A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451\u04e8\u04e9\u04ae\u04af])[.)]\s+(.+)$/u
    );

    if (!match) {
      if (pairs.length >= 2) break;
      if (start !== -1) {
        pairs.length = 0;
        start = -1;
      }
      continue;
    }

    if (start === -1) {
      start = index;
    }

    const leftInfo = parseOptionLabel(match[1]);
    const rightInfo = parseOptionLabel(match[3]);
    if (!leftInfo || !rightInfo) {
      pairs.length = 0;
      leftItems.length = 0;
      rightItems.length = 0;
      start = -1;
      continue;
    }

    pairs.push({
      left: match[2].trim(),
      right: match[4].trim(),
    });

    leftItems.push({
      lineIndex: index,
      optionIndex: leftInfo.index,
      label: normalizeLabelToken(match[1]),
      value: match[2].trim(),
      series: leftInfo.series,
    });

    rightItems.push({
      lineIndex: index,
      optionIndex: rightInfo.index,
      label: normalizeLabelToken(match[3]),
      value: match[4].trim(),
      series: rightInfo.series,
    });
  }

  if (pairs.length < 2 || start === -1) {
    return null;
  }

  return { start, pairs, leftItems, rightItems };
}

function extractColumnMatchingBlock(lines: string[]): MatchingBlock | null {
  const leftItems = collectSeriesItems(lines, "number");
  const rightItems = collectRightSideItems(lines);

  if (leftItems.length < 2 || rightItems.length < 2) {
    return null;
  }

  const pairCount = Math.min(leftItems.length, rightItems.length);
  if (pairCount < 2) {
    return null;
  }

  return {
    start: Math.min(leftItems[0].lineIndex, rightItems[0].lineIndex),
    pairs: Array.from({ length: pairCount }, (_, index) => ({
      left: leftItems[index].value,
      right: rightItems[index].value,
    })),
    leftItems: leftItems.slice(0, pairCount),
    rightItems: rightItems.slice(0, pairCount),
  };
}

function parseMatchingAnswerToken(token: string) {
  const normalized = normalizeLine(token);
  const match = normalized.match(/^(\d{1,2})\s*(?:[-=:.)]|\u2013|\u2014)?\s*(\S)$/u);
  if (!match) {
    return null;
  }

  const leftInfo = parseOptionLabel(match[1]);
  const rightInfo = parseOptionLabel(match[2]);
  if (!leftInfo || !rightInfo) {
    return null;
  }

  return {
    leftIndex: leftInfo.index,
    rightIndex: rightInfo.index,
  };
}

function resolveMatchingPairs(
  answerTokens: string[],
  leftItems: MatchingItem[],
  rightItems: MatchingItem[]
) {
  if (answerTokens.length === 0) {
    return null;
  }

  const leftByIndex = new Map(leftItems.map((item) => [item.optionIndex, item]));
  const rightByIndex = new Map(rightItems.map((item) => [item.optionIndex, item]));
  const resolvedPairs: MatchingPair[] = [];

  for (const token of answerTokens) {
    const parsedToken = parseMatchingAnswerToken(token);
    if (!parsedToken) {
      return null;
    }

    const leftItem = leftByIndex.get(parsedToken.leftIndex);
    const rightItem = rightByIndex.get(parsedToken.rightIndex);
    if (!leftItem || !rightItem) {
      return null;
    }

    resolvedPairs.push({
      left: leftItem.value,
      right: rightItem.value,
    });
  }

  return resolvedPairs.length >= 2 ? resolvedPairs : null;
}

function findMatchingBlock(lines: string[], answerTokens: string[]) {
  const arrowBlock = extractArrowMatchingBlock(lines.slice(1));
  if (arrowBlock) {
    return {
      start: arrowBlock.start + 1,
      pairs: arrowBlock.pairs,
    };
  }

  const inlineBlock = extractInlineMatchingBlock(lines.slice(1));
  if (inlineBlock) {
    return {
      start: inlineBlock.start + 1,
      pairs: inlineBlock.pairs,
      leftItems: inlineBlock.leftItems,
      rightItems: inlineBlock.rightItems,
    };
  }

  const columnBlock = extractColumnMatchingBlock(lines.slice(1));
  if (!columnBlock) {
    return null;
  }

  const promptText = lines.slice(0, columnBlock.start + 1).join(" ");
  const hasMatchingAnswerKey =
    answerTokens.length >= 2 &&
    answerTokens.every((token) => Boolean(parseMatchingAnswerToken(token)));

  if (!hasMatchingPrompt(promptText) && !hasMatchingAnswerKey) {
    return null;
  }

  return {
    start: columnBlock.start + 1,
    pairs: columnBlock.pairs,
    leftItems: columnBlock.leftItems,
    rightItems: columnBlock.rightItems,
  };
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
  const answerTokens = dedupe(answerLines.flatMap(splitAnswerTokens));
  const matchingBlock = findMatchingBlock(bodyLines, answerTokens);

  if (matchingBlock) {
    const resolvedPairs =
      matchingBlock.leftItems && matchingBlock.rightItems
        ? resolveMatchingPairs(
            answerTokens,
            matchingBlock.leftItems,
            matchingBlock.rightItems
          )
        : null;

    return {
      type: "matching",
      content: cleanupQuestionContent(bodyLines.slice(0, matchingBlock.start)),
      options: [],
      correctAnswer: "",
      multipleCorrectAnswers: [],
      matchingPairs: resolvedPairs ?? matchingBlock.pairs,
    };
  }

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
      matchingPairs: [],
    };
  }

  if (answerLines.length > 0) {
    return {
      type: "fill_blank",
      content: cleanupQuestionContent(bodyLines),
      options: [],
      correctAnswer: answerLines.join("\n").trim(),
      multipleCorrectAnswers: [],
      matchingPairs: [],
    };
  }

  return null;
}
