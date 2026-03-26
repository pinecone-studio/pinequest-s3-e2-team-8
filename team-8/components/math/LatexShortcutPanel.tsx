"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CURSOR_MARKER = "__cursor__";
const SELECTION_MARKER = "__selection__";

const formulaGroups = [
  {
    id: "basic",
    label: "Үндсэн",
    description: "Хамгийн их хэрэглэдэг математик тэмдэгтүүд",
    items: [
      { label: "Inline", preview: "$x^2$", snippet: `$${SELECTION_MARKER}${CURSOR_MARKER}$` },
      { label: "Block", preview: "$$x^2$$", snippet: `$$${SELECTION_MARKER}${CURSOR_MARKER}$$` },
      { label: "Зэрэг", preview: "x²", snippet: `$x^{${SELECTION_MARKER}${CURSOR_MARKER}}$` },
      { label: "Индекс", preview: "xₙ", snippet: `$x_{${SELECTION_MARKER}${CURSOR_MARKER}}$` },
      { label: "Нийлбэр", preview: "Σ", snippet: `$$\\sum_{${CURSOR_MARKER}}^{}$$` },
      { label: "Интеграл", preview: "∫", snippet: `$$\\int ${SELECTION_MARKER}${CURSOR_MARKER}\\,dx$$` },
      { label: "Хязгаар", preview: "∞", snippet: `$\\infty$` },
      { label: "Харьцуулалт", preview: "≤ ≥ ≠", snippet: `$\\le \\quad \\ge \\quad \\neq$` },
    ],
  },
  {
    id: "fraction",
    label: "Бутархай",
    description: "Энгийн болон томьёоны бутархайнууд",
    items: [
      { label: "a / b", preview: "a/b", snippet: `$$\\frac{${SELECTION_MARKER}${CURSOR_MARKER}}{ }$$` },
      { label: "Жижиг", preview: "1/2", snippet: `$\\tfrac{${SELECTION_MARKER}${CURSOR_MARKER}}{ }$` },
      { label: "Давхар", preview: "(a+b)/(c+d)", snippet: `$$\\frac{a + b}{c + d${CURSOR_MARKER}}$$` },
      { label: "Харьцаа", preview: "a:b", snippet: `$a:b${CURSOR_MARKER}$` },
    ],
  },
  {
    id: "root",
    label: "Язгуур",
    description: "Язгуур болон зэрэгт язгуурын хэлбэрүүд",
    items: [
      { label: "√x", preview: "√x", snippet: `$$\\sqrt{${SELECTION_MARKER}${CURSOR_MARKER}}$$` },
      { label: "ⁿ√x", preview: "ⁿ√x", snippet: `$$\\sqrt[n]{${SELECTION_MARKER}${CURSOR_MARKER}}$$` },
      { label: "Квадрат", preview: "√(x²+y²)", snippet: `$$\\sqrt{x^2 + y^2${CURSOR_MARKER}}$$` },
      { label: "Модуль", preview: "|x|", snippet: `$\\left|${SELECTION_MARKER}${CURSOR_MARKER}\\right|$` },
    ],
  },
  {
    id: "chemistry",
    label: "Химийн элемент",
    description: "Хими, урвал, ион, молекулын бичлэгүүд",
    items: [
      { label: "Ус", preview: "H₂O", snippet: `$$\\ce{H2O${CURSOR_MARKER}}$$` },
      { label: "Урвал", preview: "2H₂ + O₂ → 2H₂O", snippet: `$$\\ce{2H2 + O2 -> 2H2O${CURSOR_MARKER}}$$` },
      { label: "Ион", preview: "Na⁺", snippet: `$$\\ce{Na+${CURSOR_MARKER}}$$` },
      { label: "Тэнцвэр", preview: "⇌", snippet: `$$\\ce{CO2 + H2O <=> H2CO3${CURSOR_MARKER}}$$` },
    ],
  },
  {
    id: "physics",
    label: "Физик тэмдэгт",
    description: "Физик хэмжигдэхүүн, вектор, долгионы тэмдэгтүүд",
    items: [
      { label: "Хурд", preview: "v = s/t", snippet: `$$v = \\frac{s}{t${CURSOR_MARKER}}$$` },
      { label: "Хүч", preview: "F = ma", snippet: `$$F = ma${CURSOR_MARKER}$$` },
      { label: "Өөрчлөлт", preview: "Δt", snippet: `$\\Delta t${CURSOR_MARKER}$` },
      { label: "Вектор", preview: "→F", snippet: `$\\vec{F${CURSOR_MARKER}}$` },
      { label: "Долгион", preview: "λ ω", snippet: `$\\lambda \\quad \\omega${CURSOR_MARKER}$` },
      { label: "Градус", preview: "90°", snippet: `$90^\\circ${CURSOR_MARKER}$` },
    ],
  },
];

interface LatexShortcutPanelProps {
  targetId: string;
  title?: string;
  description?: string;
}

export default function LatexShortcutPanel({
  targetId,
  title = "Formula Tool",
  description = "Тэмдэгтээ категориор нь сонгоод асуулт дотроо шууд оруулна.",
}: LatexShortcutPanelProps) {
  const defaultGroup = useMemo(() => formulaGroups[0]?.id ?? "basic", []);

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

      <Tabs defaultValue={defaultGroup} className="gap-3">
        <TabsList variant="line" className="h-auto flex-wrap justify-start p-0">
          {formulaGroups.map((group) => (
            <TabsTrigger
              key={group.id}
              value={group.id}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
            >
              {group.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {formulaGroups.map((group) => (
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

      <p className="text-xs leading-relaxed text-muted-foreground">
        Товчлуур дарахад формул caret байгаа хэсэгт орно. Сонгосон текст байвал
        зарим формул дотор автоматаар багтана.
      </p>
    </div>
  );
}
