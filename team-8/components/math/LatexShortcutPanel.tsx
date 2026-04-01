"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import MathContent from "@/components/math/MathContent";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FormulaItem = {
  id: string;
  label: string;
  latex: string;
};

export type FormulaGroup = {
  id: string;
  label: string;
  description: string;
  items: FormulaItem[];
};

export const formulaGroups: FormulaGroup[] = [
  {
    id: "basic",
    label: "Суурь",
    description: "Ерөнхий тэмдэглэгээ, зэрэг, индекс, бутархай.",
    items: [
      { id: "square", label: "Зэрэг", latex: "$x^2$" },
      { id: "subscript", label: "Индекс", latex: "$a_n$" },
      { id: "fraction", label: "Бутархай", latex: "$\\frac{a}{b}$" },
      { id: "sqrt", label: "Язгуур", latex: "$\\sqrt{x}$" },
      { id: "comparison", label: "Харьцуулалт", latex: "$x \\le y$" },
      { id: "equation", label: "Тэнцэтгэл", latex: "$x = y$" },
    ],
  },
  {
    id: "algebra",
    label: "Алгебр",
    description: "Алгебрийн түгээмэл илэрхийлэл, логарифм, модуль.",
    items: [
      { id: "quadratic", label: "Квадрат", latex: "$ax^2 + bx + c = 0$" },
      { id: "factor", label: "Үржигдэхүүн", latex: "$(x+a)(x+b)$" },
      { id: "log", label: "Логарифм", latex: "$\\log_a b$" },
      { id: "abs", label: "Модуль", latex: "$\\left|x\\right|$" },
      { id: "exp", label: "Экспонент", latex: "$e^x$" },
      {
        id: "system",
        label: "Систем",
        latex: "$$\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}$$",
      },
    ],
  },
  {
    id: "trigonometry",
    label: "Тригонометр",
    description: "Тригонометрийн функц, өнцөг, үндсэн тэнцэтгэлүүд.",
    items: [
      { id: "sin", label: "Sin", latex: "$\\sin x$" },
      { id: "cos", label: "Cos", latex: "$\\cos x$" },
      { id: "tan", label: "Tan", latex: "$\\tan x$" },
      {
        id: "identity",
        label: "Identity",
        latex: "$\\sin^2 x + \\cos^2 x = 1$",
      },
      { id: "angle", label: "Өнцөг", latex: "$\\angle ABC$" },
      { id: "degree", label: "Градус", latex: "$45^\\circ$" },
    ],
  },
  {
    id: "geometry",
    label: "Геометр",
    description: "Дүрс, параллель, перпендикуляр, талбай, эзлэхүүн.",
    items: [
      { id: "triangle", label: "Гурвалжин", latex: "$\\triangle ABC$" },
      { id: "parallel", label: "Параллель", latex: "$AB \\parallel CD$" },
      { id: "perpendicular", label: "Перпендикуляр", latex: "$AB \\perp CD$" },
      { id: "circle-area", label: "Тойргийн талбай", latex: "$S = \\pi r^2$" },
      { id: "pythagorean", label: "Пифагор", latex: "$a^2 + b^2 = c^2$" },
      { id: "volume", label: "Эзлэхүүн", latex: "$V = lwh$" },
    ],
  },
  {
    id: "calculus",
    label: "Калькулус",
    description: "Хязгаар, уламжлал, интеграл, нийлбэр, үржвэр.",
    items: [
      { id: "limit", label: "Хязгаар", latex: "$\\lim_{x \\to 0} f(x)$" },
      { id: "derivative", label: "Уламжлал", latex: "$f'(x)$" },
      { id: "ddx", label: "d/dx", latex: "$\\frac{d}{dx}f(x)$" },
      { id: "integral", label: "Интеграл", latex: "$\\int_a^b f(x)\\,dx$" },
      { id: "sum", label: "Нийлбэр", latex: "$\\sum_{i=1}^{n} x_i$" },
      { id: "product", label: "Үржвэр", latex: "$\\prod_{i=1}^{n} x_i$" },
    ],
  },
  {
    id: "matrix",
    label: "Матриц",
    description: "Матриц, вектор, детерминант зэрэг шугаман алгебрийн томьёо.",
    items: [
      {
        id: "matrix-2x2",
        label: "2x2 матриц",
        latex: "$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$",
      },
      {
        id: "determinant",
        label: "Детерминант",
        latex: "$$\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}$$",
      },
      { id: "vector", label: "Вектор", latex: "$\\vec{v}$" },
      {
        id: "column-vector",
        label: "Баганан вектор",
        latex: "$$\\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix}$$",
      },
      { id: "inverse", label: "Урвуу матриц", latex: "$A^{-1}$" },
      { id: "transpose", label: "Транспоуз", latex: "$A^T$" },
    ],
  },
  {
    id: "probability",
    label: "Магадлал",
    description: "Олонлог, магадлал, статистикийн үндсэн тэмдэглэгээ.",
    items: [
      { id: "set", label: "Олонлог", latex: "$A = \\{1,2,3\\}$" },
      { id: "union", label: "Нийлбэр олонлог", latex: "$A \\cup B$" },
      { id: "intersection", label: "Огтлолцол", latex: "$A \\cap B$" },
      { id: "belongs", label: "Хамаарах", latex: "$x \\in A$" },
      { id: "probability", label: "Магадлал", latex: "$P(A)$" },
      { id: "mean", label: "Дундаж", latex: "$\\bar{x}$" },
    ],
  },
];

interface LatexShortcutPanelProps {
  targetId: string;
  targetLabel?: string;
  title?: string;
  description?: string;
  minimal?: boolean;
}

function setNativeFieldValue(
  field: HTMLTextAreaElement | HTMLInputElement,
  nextValue: string
) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(field, nextValue);
    return;
  }

  field.value = nextValue;
}

export default function LatexShortcutPanel({
  targetId,
  targetLabel = "Асуулт",
  title = "Томьёоны хэрэгсэл",
  description = "Сэдвээ сонгоод, тухайн бүлгийн томьёоноос шууд оруулна.",
  minimal = false,
}: LatexShortcutPanelProps) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [insertError, setInsertError] = useState<string | null>(null);

  const activeGroup =
    formulaGroups.find((group) => group.id === activeGroupId) ?? null;

  function insertFormula(latex: string) {
    const field = document.getElementById(targetId) as
      | HTMLTextAreaElement
      | HTMLInputElement
      | null;

    if (!field) {
      setInsertError(
        "Талбар олдсонгүй. Эхлээд асуулт эсвэл хариултын талбар дээр дарна уу."
      );
      return;
    }

    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const nextValue = field.value.slice(0, start) + latex + field.value.slice(end);

    setNativeFieldValue(field, nextValue);
    field.focus();

    const caret = start + latex.length;
    field.setSelectionRange?.(caret, caret);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    setInsertError(null);
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-[24px] border border-zinc-200 bg-white p-4",
        minimal ? "" : "shadow-sm"
      )}
    >
      {!minimal ? (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-zinc-950">{title}</p>
            <p className="text-sm text-zinc-500">{description}</p>
          </div>
          <p className="text-xs text-zinc-500">Оруулах талбар: {targetLabel}</p>
        </div>
      ) : null}

      {insertError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {insertError}
        </div>
      ) : null}

      {activeGroup ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-3 text-sm text-zinc-600 hover:text-zinc-950"
              onClick={() => setActiveGroupId(null)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Бүлгүүд
            </Button>
            {!minimal ? (
              <p className="text-xs text-zinc-500">{targetLabel}</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <p className="text-base font-semibold text-zinc-950">
              {activeGroup.label}
            </p>
            <p className="text-sm text-zinc-500">{activeGroup.description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeGroup.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded-[20px] border border-zinc-200 bg-zinc-50 px-4 py-4 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-100"
                onClick={() => insertFormula(item.latex)}
              >
                <div className="flex min-h-20 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                  <MathContent
                    text={item.latex}
                    className="prose prose-sm max-w-none text-zinc-950"
                  />
                </div>
                <p className="mt-3 text-sm font-medium text-zinc-900">
                  {item.label}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {formulaGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="rounded-[20px] border border-zinc-200 bg-zinc-50 px-4 py-4 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-100"
              onClick={() => setActiveGroupId(group.id)}
            >
              <div className="space-y-2">
                <p className="text-base font-semibold text-zinc-950">
                  {group.label}
                </p>
                <p className="text-sm leading-6 text-zinc-500">
                  {group.description}
                </p>
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
                {group.items.length} томьёо
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
