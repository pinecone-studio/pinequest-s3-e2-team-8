const LATEX_COMMAND_PATTERN =
  /\\(?:frac|sqrt|int|sum|prod|lim|log|ln|sin|cos|tan|cot|sec|csc|left|right|cdot|times|le|ge|neq|approx|to|infty|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega|bar|hat|vec|overline|underline|text|mathrm|mathbf|begin|end|pmatrix|bmatrix|vmatrix|cases|angle|triangle|parallel|perp|circ|cup|cap|in)\b/;

const EXPLICIT_MATH_DELIMITER_PATTERN =
  /\$\$[\s\S]*\$\$|\$[^$]+\$|\\\([\s\S]*\\\)|\\\[[\s\S]*\\\]/;

const STANDALONE_FORMULA_PATTERN =
  /^[A-Za-z0-9\s{}[\]()^_\\&,+\-*/=<>|:;.,'"`~]+$/;

export function hasMathMarkup(value: string | null | undefined) {
  if (!value) return false;

  return (
    EXPLICIT_MATH_DELIMITER_PATTERN.test(value) ||
    LATEX_COMMAND_PATTERN.test(value)
  );
}

function hasExplicitMathDelimiters(value: string) {
  return EXPLICIT_MATH_DELIMITER_PATTERN.test(value);
}

function looksLikeStandaloneFormula(value: string) {
  return (
    LATEX_COMMAND_PATTERN.test(value) &&
    STANDALONE_FORMULA_PATTERN.test(value) &&
    !/[А-Яа-яӨөҮүЁё]/.test(value)
  );
}

function wrapFormulaLine(value: string) {
  if (value.includes("\\begin{") || value.includes("\\end{")) {
    return `$$${value}$$`;
  }

  return `$${value}$`;
}

export function normalizeMathText(value: string | null | undefined) {
  if (!value) return "";

  return value
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      if (
        !trimmed ||
        hasExplicitMathDelimiters(trimmed) ||
        !looksLikeStandaloneFormula(trimmed)
      ) {
        return line;
      }

      const leadingWhitespace = line.match(/^\s*/)?.[0] ?? "";
      const trailingWhitespace = line.match(/\s*$/)?.[0] ?? "";

      return `${leadingWhitespace}${wrapFormulaLine(trimmed)}${trailingWhitespace}`;
    })
    .join("\n");
}
