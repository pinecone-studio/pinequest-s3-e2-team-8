"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CURSOR_MARKER = "__cursor__";
const SELECTION_MARKER = "__selection__";

type FormulaItem = {
  label: string;
  preview: string;
  snippet: string;
  keywords: string[];
};

type FormulaGroup = {
  id: string;
  label: string;
  description: string;
  items: FormulaItem[];
};

const formulaGroups: FormulaGroup[] = [
  {
    id: "basic",
    label: "Суурь",
    description: "Ерөнхий LaTeX хүрээ, зэрэг, индекс, тэнцэтгэлүүд.",
    items: [
      { label: "Inline", preview: "$x^2$", snippet: `$${SELECTION_MARKER}${CURSOR_MARKER}$`, keywords: ["inline", "basic", "math"] },
      { label: "Block", preview: "$$x^2$$", snippet: `$$${SELECTION_MARKER}${CURSOR_MARKER}$$`, keywords: ["block", "display", "math"] },
      { label: "Зэрэг", preview: "x²", snippet: `$x^{${SELECTION_MARKER}${CURSOR_MARKER}}$`, keywords: ["power", "square", "superscript"] },
      { label: "Индекс", preview: "aₙ", snippet: `$a_{${SELECTION_MARKER}${CURSOR_MARKER}}$`, keywords: ["subscript", "index"] },
      { label: "Харьцуулалт", preview: "≤ ≥ ≠", snippet: `$\\le \\quad \\ge \\quad \\neq${CURSOR_MARKER}$`, keywords: ["less", "greater", "not equal"] },
      { label: "Тэнцэтгэл", preview: "x = y", snippet: `$$${SELECTION_MARKER}${CURSOR_MARKER} = $$`, keywords: ["equation", "equal"] },
    ],
  },
  {
    id: "algebra",
    label: "Алгебр",
    description: "Бутархай, модуль, логарифм, язгуур, polynomial хэлбэрүүд.",
    items: [
      { label: "Бутархай", preview: "a/b", snippet: `$$\\frac{${SELECTION_MARKER}${CURSOR_MARKER}}{ }$$`, keywords: ["fraction", "divide"] },
      { label: "Жижиг бутархай", preview: "1/2", snippet: `$\\tfrac{${SELECTION_MARKER}${CURSOR_MARKER}}{ }$`, keywords: ["fraction", "inline"] },
      { label: "Язгуур", preview: "√x", snippet: `$$\\sqrt{${SELECTION_MARKER}${CURSOR_MARKER}}$$`, keywords: ["root", "sqrt"] },
      { label: "n-р язгуур", preview: "ⁿ√x", snippet: `$$\\sqrt[n]{${SELECTION_MARKER}${CURSOR_MARKER}}$$`, keywords: ["root", "nth root"] },
      { label: "Модуль", preview: "|x|", snippet: `$\\left|${SELECTION_MARKER}${CURSOR_MARKER}\\right|$`, keywords: ["absolute", "modulus"] },
      { label: "Логарифм", preview: "logₐ b", snippet: `$\\log_{a}{${SELECTION_MARKER}${CURSOR_MARKER}}$`, keywords: ["logarithm", "algebra"] },
      { label: "Экспонент", preview: "eˣ", snippet: `$e^{${SELECTION_MARKER}${CURSOR_MARKER}}$`, keywords: ["exponential", "power"] },
      { label: "Квадрат гурвалсан", preview: "ax²+bx+c", snippet: `$$ax^2 + bx + c${CURSOR_MARKER}$$`, keywords: ["quadratic", "polynomial"] },
    ],
  },
  {
    id: "trig",
    label: "Триг",
    description: "Тригонометрийн функц, өнцөг, identity.",
    items: [
      { label: "sin/cos/tan", preview: "sin x", snippet: `$\\sin(${SELECTION_MARKER}${CURSOR_MARKER})$`, keywords: ["sin", "cos", "tan", "trig"] },
      { label: "Identity", preview: "sin²x + cos²x = 1", snippet: `$$\\sin^2 x + \\cos^2 x = 1${CURSOR_MARKER}$$`, keywords: ["identity", "trigonometry"] },
      { label: "Өнцөг", preview: "∠ABC", snippet: `$\\angle ABC${CURSOR_MARKER}$`, keywords: ["angle", "geometry", "trig"] },
      { label: "Градус", preview: "30°", snippet: `$30^\\circ${CURSOR_MARKER}$`, keywords: ["degree", "angle"] },
      { label: "Радиан", preview: "π/2", snippet: `$\\frac{\\pi}{2${CURSOR_MARKER}}$`, keywords: ["radian", "pi"] },
      { label: "Арк функц", preview: "arcsin x", snippet: `$\\arcsin(${SELECTION_MARKER}${CURSOR_MARKER})$`, keywords: ["inverse trig", "arcsin"] },
    ],
  },
  {
    id: "geometry",
    label: "Геометр",
    description: "Дүрс, параллель, перпендикуляр, талбай, эзлэхүүн.",
    items: [
      { label: "Параллель", preview: "AB ∥ CD", snippet: `$AB \\parallel CD${CURSOR_MARKER}$`, keywords: ["parallel", "geometry"] },
      { label: "Перпендикуляр", preview: "AB ⟂ CD", snippet: `$AB \\perp CD${CURSOR_MARKER}$`, keywords: ["perpendicular", "geometry"] },
      { label: "Гурвалжин", preview: "△ABC", snippet: `$\\triangle ABC${CURSOR_MARKER}$`, keywords: ["triangle", "geometry"] },
      { label: "Тойргийн талбай", preview: "πr²", snippet: `$S = \\pi r^2${CURSOR_MARKER}$`, keywords: ["circle", "area"] },
      { label: "Пифагор", preview: "a²+b²=c²", snippet: `$$a^2 + b^2 = c^2${CURSOR_MARKER}$$`, keywords: ["pythagorean", "geometry"] },
      { label: "Эзлэхүүн", preview: "V = lwh", snippet: `$V = lwh${CURSOR_MARKER}$`, keywords: ["volume", "geometry"] },
    ],
  },
  {
    id: "calculus",
    label: "Калькулус",
    description: "Хязгаар, уламжлал, интеграл, нийлбэр, үржвэр.",
    items: [
      { label: "Хязгаар", preview: "lim", snippet: `$$\\lim_{x \\to ${CURSOR_MARKER}}$$`, keywords: ["limit", "calculus"] },
      { label: "Уламжлал", preview: "f'(x)", snippet: `$$f'(${SELECTION_MARKER}${CURSOR_MARKER})$$`, keywords: ["derivative", "prime"] },
      { label: "d/dx", preview: "d/dx", snippet: `$$\\frac{d}{dx}${SELECTION_MARKER}${CURSOR_MARKER}$$`, keywords: ["derivative", "operator"] },
      { label: "Интеграл", preview: "∫f(x)dx", snippet: `$$\\int ${SELECTION_MARKER}${CURSOR_MARKER}\\,dx$$`, keywords: ["integral", "calculus"] },
      { label: "Хос интеграл", preview: "∬", snippet: `$$\\iint ${SELECTION_MARKER}${CURSOR_MARKER}\\,dA$$`, keywords: ["double integral"] },
      { label: "Нийлбэр", preview: "Σ", snippet: `$$\\sum_{i=1}^{n}${SELECTION_MARKER}${CURSOR_MARKER}$$`, keywords: ["sum", "sigma"] },
      { label: "Үржвэр", preview: "Π", snippet: `$$\\prod_{i=1}^{n}${SELECTION_MARKER}${CURSOR_MARKER}$$`, keywords: ["product", "pi"] },
    ],
  },
  {
    id: "matrix",
    label: "Матриц",
    description: "Матриц, вектор, determinant, тэгшитгэлийн систем.",
    items: [
      { label: "2x2 матриц", preview: "[a b; c d]", snippet: `$$\\begin{pmatrix} a & b \\\\ c & d${CURSOR_MARKER} \\end{pmatrix}$$`, keywords: ["matrix", "2x2"] },
      { label: "Детерминант", preview: "|A|", snippet: `$$\\begin{vmatrix} a & b \\\\ c & d${CURSOR_MARKER} \\end{vmatrix}$$`, keywords: ["determinant"] },
      { label: "Вектор", preview: "→v", snippet: `$\\vec{${SELECTION_MARKER}${CURSOR_MARKER}}$`, keywords: ["vector"] },
      { label: "Column vector", preview: "[x;y;z]", snippet: `$$\\begin{pmatrix} x \\\\ y \\\\ z${CURSOR_MARKER} \\end{pmatrix}$$`, keywords: ["column vector"] },
      { label: "Тэгшитгэлийн систем", preview: "{x+y=1}", snippet: `$$\\begin{cases} x + y = 1 \\\\ x - y = 3${CURSOR_MARKER} \\end{cases}$$`, keywords: ["system", "equations"] },
    ],
  },
  {
    id: "sets",
    label: "Магадлал",
    description: "Олонлог, магадлал, статистикийн үндсэн тэмдэглэгээ.",
    items: [
      { label: "Олонлог", preview: "{a,b,c}", snippet: `$\\{${SELECTION_MARKER}${CURSOR_MARKER}\\}$`, keywords: ["set"] },
      { label: "Нийлбэр олонлог", preview: "A ∪ B", snippet: `$A \\cup B${CURSOR_MARKER}$`, keywords: ["union", "set"] },
      { label: "Огтлолцол", preview: "A ∩ B", snippet: `$A \\cap B${CURSOR_MARKER}$`, keywords: ["intersection", "set"] },
      { label: "Хамаарах", preview: "x ∈ A", snippet: `$x \\in A${CURSOR_MARKER}$`, keywords: ["belongs", "element"] },
      { label: "Магадлал", preview: "P(A)", snippet: `$P(${SELECTION_MARKER}${CURSOR_MARKER})$`, keywords: ["probability"] },
      { label: "Дундаж", preview: "x̄", snippet: `$\\bar{x}${CURSOR_MARKER}$`, keywords: ["mean", "statistics"] },
      { label: "Хазайлт", preview: "σ", snippet: `$\\sigma${CURSOR_MARKER}$`, keywords: ["sigma", "standard deviation"] },
    ],
  },
  {
    id: "chemistry",
    label: "Хими",
    description: "Молекул, ион, урвал, тэнцвэр, тунадас.",
    items: [
      { label: "Молекул", preview: "H₂O", snippet: `$$\\ce{H2O${CURSOR_MARKER}}$$`, keywords: ["molecule", "chemistry"] },
      { label: "Урвал", preview: "2H₂ + O₂ → 2H₂O", snippet: `$$\\ce{2H2 + O2 -> 2H2O${CURSOR_MARKER}}$$`, keywords: ["reaction", "chemistry"] },
      { label: "Ион", preview: "Na⁺", snippet: `$$\\ce{Na+${CURSOR_MARKER}}$$`, keywords: ["ion", "chemistry"] },
      { label: "Тэнцвэр", preview: "⇌", snippet: `$$\\ce{CO2 + H2O <=> H2CO3${CURSOR_MARKER}}$$`, keywords: ["equilibrium", "chemistry"] },
      { label: "Тунадас", preview: "↓", snippet: `$$\\ce{Ag+ + Cl- -> AgCl v${CURSOR_MARKER}}$$`, keywords: ["precipitate", "chemistry"] },
      { label: "Концентрац", preview: "[H⁺]", snippet: `$[H^+]${CURSOR_MARKER}$`, keywords: ["concentration", "chemistry"] },
    ],
  },
  {
    id: "physics",
    label: "Физик",
    description: "Хурд, хүч, ажил, цахилгаан, долгион.",
    items: [
      { label: "Хурд", preview: "v = s/t", snippet: `$$v = \\frac{s}{t${CURSOR_MARKER}}$$`, keywords: ["speed", "velocity"] },
      { label: "Хүч", preview: "F = ma", snippet: `$$F = ma${CURSOR_MARKER}$$`, keywords: ["force", "physics"] },
      { label: "Ажил", preview: "A = Fs", snippet: `$$A = Fs\\cos\\theta${CURSOR_MARKER}$$`, keywords: ["work", "physics"] },
      { label: "Омын хууль", preview: "U = IR", snippet: `$$U = IR${CURSOR_MARKER}$$`, keywords: ["ohm", "electric"] },
      { label: "Долгион", preview: "λ = v/f", snippet: `$$\\lambda = \\frac{v}{f${CURSOR_MARKER}}$$`, keywords: ["wave", "lambda"] },
      { label: "Өөрчлөлт", preview: "Δt", snippet: `$\\Delta t${CURSOR_MARKER}$`, keywords: ["delta", "change"] },
    ],
  },
];

interface LatexShortcutPanelProps {
  targetId: string;
  targetLabel?: string;
  title?: string;
  description?: string;
}

export default function LatexShortcutPanel({
  targetId,
  targetLabel = "Асуултын талбар",
  title = "Томьёоны хэрэгсэл",
  description = "Томьёогоо хайж олоод, caret байгаа талбартаа шууд оруулна.",
}: LatexShortcutPanelProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState(formulaGroups[0]?.id ?? "basic");

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return formulaGroups;

    return formulaGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          [item.label, item.preview, ...item.keywords]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [query]);
  const resolvedActiveTab =
    filteredGroups.find((group) => group.id === activeTab)?.id ??
    filteredGroups[0]?.id ??
    formulaGroups[0]?.id ??
    "basic";

  function insertSnippet(snippet: string) {
    const field = document.getElementById(targetId) as
      | HTMLTextAreaElement
      | HTMLInputElement
      | null;

    if (!field) return;

    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const selectedText = field.value.slice(start, end);

    const preparedSnippet = snippet.replaceAll(SELECTION_MARKER, selectedText);
    const cursorIndex = preparedSnippet.indexOf(CURSOR_MARKER);
    const cleanSnippet = preparedSnippet.replace(CURSOR_MARKER, "");

    const nextValue =
      field.value.slice(0, start) + cleanSnippet + field.value.slice(end);

    field.value = nextValue;
    field.focus();

    const caret =
      start + (cursorIndex >= 0 ? cursorIndex : cleanSnippet.length);
    field.setSelectionRange?.(caret, caret);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/10 px-3 py-2">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Одоогоор оруулах талбар</p>
          <p className="text-sm font-medium">{targetLabel}</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Томьёо хайх"
            className="pl-9"
          />
        </div>
      </div>

      {filteredGroups.length > 0 ? (
        <Tabs value={resolvedActiveTab} onValueChange={setActiveTab} className="gap-3">
          <TabsList variant="line" className="h-auto flex-wrap justify-start p-0">
            {filteredGroups.map((group) => (
              <TabsTrigger
                key={group.id}
                value={group.id}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
              >
                {group.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {filteredGroups.map((group) => (
            <TabsContent key={group.id} value={group.id} className="space-y-3">
              <p className="text-xs text-muted-foreground">{group.description}</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {group.items.map((item) => (
                  <Button
                    key={`${group.id}-${item.label}`}
                    type="button"
                    variant="outline"
                    className="h-auto items-start justify-start rounded-xl px-3 py-3 text-left"
                    onClick={() => insertSnippet(item.snippet)}
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="font-mono text-sm text-foreground">
                        {item.preview}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
          Хайлтад тохирох томьёо олдсонгүй.
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Товчлуур дарахад сонгосон талбарт формул орно. Текст сонгосон байвал
        зарим snippet дотор автоматаар шингээнэ.
      </p>
    </div>
  );
}
