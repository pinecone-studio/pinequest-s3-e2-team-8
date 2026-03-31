import mammoth from "mammoth";
import type { QuestionImportDraft } from "@/types";
import { validateQuestionImportDraft } from "@/lib/question/import";

type MammothMessage = {
  type: "warning" | "error";
  message: string;
};

type MammothWithMarkdown = typeof mammoth & {
  convertToMarkdown: (input: { buffer: Buffer }) => Promise<{
    value: string;
    messages: MammothMessage[];
  }>;
};

type OptionSeries = "latin" | "cyrillic" | "number";

interface ParsedOptionLine {
  label: string;
  value: string;
  series: OptionSeries;
  index: number;
}

interface ParsedQuestionBlock {
  draft: QuestionImportDraft | null;
  warnings: string[];
}

interface MatchingItem {
  lineIndex: number;
  optionIndex: number;
  label: string;
  value: string;
  series: OptionSeries;
}

interface MatchingBlock {
  start: number;
  pairs: Array<{ left: string; right: string }>;
  warning?: string;
  leftItems?: MatchingItem[];
  rightItems?: MatchingItem[];
}

const mammothWithMarkdown = mammoth as MammothWithMarkdown;

const cyrillicLabelOrder = Array.from(
  "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
);

const trueFalseOptionSets = [
  {
    trueValues: ["үнэн", "тийм"],
    falseValues: ["худал", "үгүй"],
    options: ["Үнэн", "Худал"],
  },
  {
    trueValues: ["зөв"],
    falseValues: ["буруу"],
    options: ["Зөв", "Буруу"],
  },
  {
    trueValues: ["true", "yes"],
    falseValues: ["false", "no"],
    options: ["True", "False"],
  },
];

function normalizeMarkdownText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1");
}

function normalizeLine(line: string) {
  return normalizeMarkdownText(line)
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparisonValue(value: string) {
  return normalizeMarkdownText(value)
    .trim()
    .toLowerCase()
    .replace(/[().,:;'"`]+/g, "")
    .replace(/\s+/g, " ");
}

function normalizeLabelToken(value: string) {
  return value.trim().replace(/[.)\]:-]+$/g, "").toUpperCase();
}

function stripQuestionPrefix(value: string) {
  return value
    .replace(/^(?:question|асуулт)\s*\d+(?:[.)]|:)?\s*/iu, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function cleanupQuestionContent(lines: string[]) {
  if (lines.length === 0) return "";

  return lines
    .map((line, index) => {
      const cleaned = normalizeLine(line);
      return index === 0 ? stripQuestionPrefix(cleaned) : cleaned;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
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
    /^(?:[-*+]\s*)?([A-Za-zА-Яа-яЁёӨөҮү]|\d{1,2})[.):\]-]?\s+(.+)$/u
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

function parseBulletOptionLine(line: string) {
  const normalized = normalizeLine(line);
  const match = normalized.match(/^[-*+]\s+(.+)$/);
  if (!match) return null;

  return match[1].trim();
}

function findLabelledOptionBlock(lines: string[]) {
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
      options: options.map((option) => option.value),
      resolver: (token: string) => {
        const cleaned = token.trim();
        const normalizedToken = normalizeComparisonValue(cleaned);
        const labelMatch = cleaned.match(
          /^([A-Za-zА-Яа-яЁёӨөҮү]|\d{1,2})(?:[.):\]-]|\s|$)/u
        );

        if (labelMatch) {
          const label = normalizeLabelToken(labelMatch[1]);
          const byLabel = options.find((option) => option.label === label);
          if (byLabel) return byLabel.value;
        }

        const byExactValue = options.find(
          (option) => normalizeComparisonValue(option.value) === normalizedToken
        );
        if (byExactValue) return byExactValue.value;

        if (/^\d+$/.test(cleaned)) {
          const index = Number(cleaned) - 1;
          if (index >= 0 && index < options.length) {
            return options[index].value;
          }
        }

        return cleaned;
      },
    };
  }

  return null;
}

function findBulletOptionBlock(lines: string[]) {
  for (let start = 0; start < lines.length - 1; start += 1) {
    const first = parseBulletOptionLine(lines[start]);
    const second = parseBulletOptionLine(lines[start + 1]);

    if (!first || !second) continue;

    const options = [first, second];
    for (let cursor = start + 2; cursor < lines.length; cursor += 1) {
      const candidate = parseBulletOptionLine(lines[cursor]);
      if (!candidate) break;
      options.push(candidate);
    }

    return {
      start,
      options,
      resolver: (token: string) => {
        const cleaned = normalizeLine(token);
        const normalizedToken = normalizeComparisonValue(cleaned);
        const byExactValue = options.find(
          (option) => normalizeComparisonValue(option) === normalizedToken
        );

        if (byExactValue) return byExactValue;

        if (/^\d+$/.test(cleaned)) {
          const index = Number(cleaned) - 1;
          if (index >= 0 && index < options.length) {
            return options[index];
          }
        }

        return cleaned;
      },
    };
  }

  return null;
}

function splitAnswerTokens(value: string) {
  return value
    .split(/\r?\n|[|;,/]|\s+\b(?:and|ба)\b\s+/iu)
    .map((item) => normalizeLine(item))
    .filter(Boolean);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isAnswerLine(line: string) {
  return /^(?:зөв\s*хариулт(?:ууд)?|хариулт(?:ууд)?|answer|correct\s*answer(?:s)?)\s*[:\-]\s*/iu.test(
    normalizeLine(line)
  );
}

function extractAnswerText(line: string) {
  return normalizeLine(line).replace(
    /^(?:зөв\s*хариулт(?:ууд)?|хариулт(?:ууд)?|answer|correct\s*answer(?:s)?)\s*[:\-]\s*/iu,
    ""
  );
}

function isImportedAnswerLine(line: string) {
  const normalized = normalizeLine(line);
  return (
    isAnswerLine(line) ||
    /^(?:\u0437\u04e9\u0432\s*\u0445\u0430\u0440\u0438\u0443\u043b\u0442(?:\u0443\u0443\u0434)?|\u0445\u0430\u0440\u0438\u0443\u043b\u0442(?:\u0443\u0443\u0434)?|answer|correct\s*answer(?:s)?)(?:\s*[:\-]\s*|\s+)/iu.test(
      normalized
    )
  );
}

function extractImportedAnswerText(line: string) {
  if (isAnswerLine(line)) {
    return extractAnswerText(line);
  }

  return normalizeLine(line).replace(
    /^(?:\u0437\u04e9\u0432\s*\u0445\u0430\u0440\u0438\u0443\u043b\u0442(?:\u0443\u0443\u0434)?|\u0445\u0430\u0440\u0438\u0443\u043b\u0442(?:\u0443\u0443\u0434)?|answer|correct\s*answer(?:s)?)(?:\s*[:\-]\s*|\s+)/iu,
    ""
  );
}

function hasMatchingPrompt(text: string) {
  const normalized = normalizeComparisonValue(text);

  return (
    contentSuggestsMatching(text) ||
    normalized.includes("\u0445\u043e\u043b\u0431\u043e\u0445") ||
    normalized.includes("\u0445\u043e\u0441\u043b\u0443\u0443\u043b")
  );
}

function isTopLevelQuestionStart(line: string) {
  const normalized = normalizeLine(line);

  if (/^(?:question|асуулт)\s*\d+(?:[.)]|:)?\s+/iu.test(normalized)) {
    return true;
  }

  const numberedMatch = normalized.match(/^(\d{1,2})[.)]\s+(.+)$/u);
  if (!numberedMatch) {
    return false;
  }

  const content = numberedMatch[2].trim();

  return (
    hasMatchingPrompt(content) ||
    /[?:]$/.test(content) ||
    content.includes(":") ||
    looksLikeBlankQuestion(content)
  );
}

function splitQuestionBlocks(markdown: string) {
  const lines = normalizeMarkdownText(markdown)
    .split("\n")
    .map((line) => line.replace(/\t/g, "    ").trimEnd());

  const blocks: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const trimmed = normalizeLine(rawLine);
    const isTopLevel = rawLine.trimStart() === rawLine;
    const startsNewQuestion = trimmed && isTopLevel && isTopLevelQuestionStart(trimmed);

    if (startsNewQuestion && current.some((line) => normalizeLine(line))) {
      blocks.push(current);
      current = [rawLine];
      continue;
    }

    if (!trimmed && current.length === 0) {
      continue;
    }

    current.push(rawLine);
  }

  if (current.some((line) => normalizeLine(line))) {
    blocks.push(current);
  }

  return blocks.map((block) => block.join("\n"));
}

function extractMatchingPairs(lines: string[]) {
  const pairs: Array<{ left: string; right: string }> = [];
  let startIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeLine(lines[index]);
    const match = normalized.match(
      /^(?:[-*+]\s*)?(?:\d+[.)]\s*)?(.+?)\s*(?:->|=>|—|–| - )\s*(.+)$/u
    );

    if (!match) {
      if (pairs.length >= 2) break;
      pairs.length = 0;
      startIndex = -1;
      continue;
    }

    if (startIndex === -1) {
      startIndex = index;
    }

    pairs.push({
      left: match[1].trim(),
      right: match[2].trim(),
    });
  }

  if (pairs.length < 2 || startIndex === -1) {
    return null;
  }

  return {
    start: startIndex,
    pairs,
  };
}

function contentSuggestsMatching(text: string) {
  const normalized = normalizeComparisonValue(text);

  return (
    normalized.includes("холбоно уу") ||
    normalized.includes("холбож") ||
    normalized.includes("харгалзуул") ||
    normalized.includes("тааруул") ||
    normalized.includes("match")
  );
}

function extractInlineMatchingPairs(lines: string[]): MatchingBlock | null {
  const pairs: Array<{ left: string; right: string }> = [];
  let startIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeLine(lines[index]);
    const match = normalized.match(
      /^(\d{1,2})[.)]\s+(.+?)\s+([A-Za-zА-Яа-яЁёӨөҮү])[.)]\s+(.+)$/u
    );

    if (!match) {
      if (pairs.length >= 2) break;
      if (startIndex !== -1) {
        pairs.length = 0;
        startIndex = -1;
      }
      continue;
    }

    if (startIndex === -1) {
      startIndex = index;
    }

    pairs.push({
      left: match[2].trim(),
      right: match[4].trim(),
    });
  }

  if (pairs.length < 2 || startIndex === -1) {
    return null;
  }

  return {
    start: startIndex,
    pairs,
    warning:
      "Word дээрх 2 баганатай холбох асуултыг мөрийн дарааллаар танилаа. Preview дээр зөв хослолыг заавал шалгана уу.",
  };
}

function collectSeriesItems(lines: string[], series: OptionSeries) {
  return lines
    .map((line, index) => {
      const parsed = parseOptionLine(line);
      if (!parsed || parsed.series !== series) return null;

      return {
        lineIndex: index,
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
        series: OptionSeries;
      } => Boolean(item)
    );
}

function collectRightSideItems(lines: string[]) {
  return lines
    .map((line, index) => {
      const parsed = parseOptionLine(line);
      if (!parsed || parsed.series === "number") return null;

      return {
        lineIndex: index,
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

function extractColumnMatchingPairs(lines: string[]): MatchingBlock | null {
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
    warning:
      "Word дээрх тусдаа жагсаалттай холбох асуултыг мөрийн дарааллаар таарууллаа. Хэрэв баруун талын дараалал shuffle хийсэн бол preview дээр зөв хослолыг засна уу.",
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

function isMatchingAnswerToken(token: string) {
  return Boolean(parseMatchingAnswerToken(token));
}

function findMatchingQuestionBlock(lines: string[], answerTokens: string[]) {
  const directPairs = extractMatchingPairs(lines.slice(1));
  if (directPairs) {
    return {
      start: directPairs.start + 1,
      pairs: directPairs.pairs,
    };
  }

  const inlinePairs = extractInlineMatchingPairs(lines.slice(1));
  if (inlinePairs) {
    return {
      start: inlinePairs.start + 1,
      pairs: inlinePairs.pairs,
      warning: inlinePairs.warning,
    };
  }

  const columnPairs = extractColumnMatchingPairs(lines.slice(1));
  if (!columnPairs) {
    return null;
  }

  const promptText = lines.slice(0, columnPairs.start + 1).join(" ");
  const hasMatchingAnswerKey =
    answerTokens.length >= 2 && answerTokens.every(isMatchingAnswerToken);

  if (!hasMatchingPrompt(promptText) && !hasMatchingAnswerKey) {
    return null;
  }

  return {
    start: columnPairs.start + 1,
    pairs: columnPairs.pairs,
    warning: columnPairs.warning,
    leftItems: columnPairs.leftItems,
    rightItems: columnPairs.rightItems,
  };
}

function resolveMatchingAnswerPairs(
  answerTokens: string[],
  leftItems: MatchingItem[],
  rightItems: MatchingItem[]
) {
  if (answerTokens.length === 0) {
    return null;
  }

  const leftByIndex = new Map(leftItems.map((item) => [item.optionIndex, item]));
  const rightByIndex = new Map(rightItems.map((item) => [item.optionIndex, item]));
  const resolvedPairs: Array<{ left: string; right: string }> = [];

  for (const token of answerTokens) {
    const normalized = normalizeLine(token);
    const match = normalized.match(
      /^(\d{1,2})\s*[-–—=:.)]?\s*([A-Za-zА-Яа-яЁёӨөҮү])$/u
    );

    if (!match) {
      return null;
    }

    const leftInfo = parseOptionLabel(match[1]);
    const rightInfo = parseOptionLabel(match[2]);
    if (!leftInfo || !rightInfo) {
      return null;
    }

    const leftItem = leftByIndex.get(leftInfo.index);
    const rightItem = rightByIndex.get(rightInfo.index);

    if (!leftItem || !rightItem) {
      return null;
    }

    resolvedPairs.push({
      left: leftItem.value,
      right: rightItem.value,
    });
  }

  if (resolvedPairs.length < 2) {
    return null;
  }

  return resolvedPairs;
}

function resolveMatchingAnswerPairsSafe(
  answerTokens: string[],
  leftItems: MatchingItem[],
  rightItems: MatchingItem[]
) {
  const legacyResolvedPairs = resolveMatchingAnswerPairs(
    answerTokens,
    leftItems,
    rightItems
  );
  if (legacyResolvedPairs) {
    return legacyResolvedPairs;
  }

  if (answerTokens.length === 0) {
    return null;
  }

  const leftByIndex = new Map(leftItems.map((item) => [item.optionIndex, item]));
  const rightByIndex = new Map(rightItems.map((item) => [item.optionIndex, item]));
  const resolvedPairs: Array<{ left: string; right: string }> = [];

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

function resolveBooleanOptionSet(value: string) {
  const normalized = normalizeComparisonValue(value);

  for (const optionSet of trueFalseOptionSets) {
    if (
      optionSet.trueValues.includes(normalized) ||
      optionSet.falseValues.includes(normalized)
    ) {
      return optionSet;
    }
  }

  return null;
}

function resolveBooleanAnswer(value: string, options: string[]) {
  const normalized = normalizeComparisonValue(value);

  for (const optionSet of trueFalseOptionSets) {
    if (optionSet.trueValues.includes(normalized)) return options[0];
    if (optionSet.falseValues.includes(normalized)) return options[1];
  }

  return value.trim();
}

function looksLikeBlankQuestion(content: string) {
  return /_{3,}|\.{3,}|…{2,}/.test(content);
}

function buildDraftFromBlock(
  block: string,
  blockIndex: number,
  fileName: string
): ParsedQuestionBlock {
  const warnings: string[] = [];
  const lines = block
    .split("\n")
    .map((line, index) => {
      const normalized = normalizeLine(line);
      return index === 0 ? stripQuestionPrefix(normalized) : normalized;
    })
    .filter((line, index, allLines) => Boolean(line) || allLines[index - 1] !== "");

  const answerLines = lines
    .filter(isImportedAnswerLine)
    .map(extractImportedAnswerText);
  const bodyLines = lines.filter((line) => !isImportedAnswerLine(line));
  const answerTokens = dedupe(answerLines.flatMap(splitAnswerTokens));
  const matchingBlock = findMatchingQuestionBlock(bodyLines, answerTokens);
  const labelledOptionBlock = matchingBlock ? null : findLabelledOptionBlock(bodyLines);
  const bulletOptionBlock = labelledOptionBlock ? null : findBulletOptionBlock(bodyLines);
  const optionBlock = labelledOptionBlock ?? bulletOptionBlock;

  const content = cleanupQuestionContent(
    optionBlock
      ? bodyLines.slice(0, optionBlock.start)
      : matchingBlock
        ? bodyLines.slice(0, matchingBlock.start)
        : bodyLines
  );

  if (!content && answerTokens.length === 0 && !optionBlock && !matchingBlock) {
    return { draft: null, warnings };
  }

  const draft: QuestionImportDraft = {
    draftId: `${fileName}-word-${blockIndex + 1}`,
    sourceRow: blockIndex + 1,
    type: "essay",
    content,
    contentHtml: "",
    imageUrl: "",
    explanation: "",
    points: 1,
    options: [],
    correctAnswer: "",
    multipleCorrectAnswers: [],
    matchingPairs: [],
    warnings,
    errors: [],
  };

  if (matchingBlock) {
    draft.type = "matching";
    const resolvedPairs =
      matchingBlock.leftItems && matchingBlock.rightItems
        ? resolveMatchingAnswerPairsSafe(
            answerTokens,
            matchingBlock.leftItems,
            matchingBlock.rightItems
          )
        : null;

    draft.matchingPairs = resolvedPairs ?? matchingBlock.pairs;

    if (answerTokens.length > 0 && !resolvedPairs) {
      warnings.push(
        "Хариултын түлхүүрийг бүрэн уншиж чадсангүй. Preview дээр холболтуудыг шалгаж баталгаажуулна уу."
      );
    } else if (answerTokens.length > 0 && resolvedPairs) {
      warnings.push(
        "Хариултын түлхүүрийг ашиглаад холбох асуултын зөв хослолыг автоматаар таарууллаа."
      );
    } else if (matchingBlock.warning) {
      warnings.push(matchingBlock.warning);
    }
    draft.errors = validateQuestionImportDraft(draft);
    return { draft, warnings };
  }

  if (optionBlock) {
    const resolvedAnswers = dedupe(
      answerTokens.map((token) => optionBlock.resolver(token))
    );

    draft.options = optionBlock.options;
    draft.type =
      resolvedAnswers.length > 1 ? "multiple_response" : "multiple_choice";
    draft.correctAnswer = draft.type === "multiple_choice" ? resolvedAnswers[0] ?? "" : "";
    draft.multipleCorrectAnswers =
      draft.type === "multiple_response" ? resolvedAnswers : [];

    if (resolvedAnswers.length === 0) {
      warnings.push(
        "Зөв хариулт танигдсангүй. Preview дээр шалгаад зөв хариултыг сонгоно уу."
      );
    }

    draft.errors = validateQuestionImportDraft(draft);
    return { draft, warnings };
  }

  if (answerTokens.length > 0) {
    const booleanSet = resolveBooleanOptionSet(answerTokens[0]);
    if (booleanSet) {
      draft.type = "multiple_choice";
      draft.options = booleanSet.options;
      draft.correctAnswer = resolveBooleanAnswer(answerTokens[0], booleanSet.options);
      warnings.push(
        "True/False төрлийг Word файлаас автоматаар таарууллаа. Нэг удаа шалгаж баталгаажуулаарай."
      );
      draft.errors = validateQuestionImportDraft(draft);
      return { draft, warnings };
    }

    draft.type = "fill_blank";
    draft.correctAnswer = answerTokens.join(", ");
    draft.errors = validateQuestionImportDraft(draft);
    return { draft, warnings };
  }

  if (looksLikeBlankQuestion(content)) {
    draft.type = "fill_blank";
    warnings.push(
      "Нөхөх асуулт гэж таамагласан боловч зөв хариулт олдсонгүй. Preview дээр зөв хариултаа нөхнө үү."
    );
    draft.errors = validateQuestionImportDraft(draft);
    return { draft, warnings };
  }

  warnings.push(
    "Асуултын төрлийг бүрэн таньж чадсангүй. Essay хэлбэрээр оруулсан тул preview дээр шалгана уу."
  );
  draft.errors = validateQuestionImportDraft(draft);
  return { draft, warnings };
}

export async function buildQuestionImportDraftsFromWord(
  fileBuffer: ArrayBuffer,
  fileName: string
) {
  const result = await mammothWithMarkdown.convertToMarkdown({
    buffer: Buffer.from(fileBuffer),
  });

  const globalWarnings = result.messages.map((message: MammothMessage) =>
    message.type === "error"
      ? `Word parse: ${message.message}`
      : `Word parse анхааруулга: ${message.message}`
  );

  const blocks = splitQuestionBlocks(result.value);
  const drafts = blocks
    .map((block, index) => buildDraftFromBlock(block, index, fileName))
    .map((item) => item.draft)
    .filter((draft): draft is QuestionImportDraft => Boolean(draft));

  if (drafts.length === 0) {
    throw new Error(
      "Word файлаас асуултын бүтэц олдсонгүй. Асуултуудаа дугаарласан эсвэл тус тусдаа блок хэлбэрээр байршуулсан эсэхийг шалгана уу."
    );
  }

  return {
    drafts,
    warnings: globalWarnings,
  };
}
