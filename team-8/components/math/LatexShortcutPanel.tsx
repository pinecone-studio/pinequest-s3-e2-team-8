"use client";

import { Button } from "@/components/ui/button";

const latexShortcuts = [
  { label: "Inline", snippet: "$x^2 + y^2$" },
  { label: "Block", snippet: "$$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$" },
  { label: "Root", snippet: "$$\\sqrt{x^2 + y^2}$$" },
  { label: "Matrix", snippet: "$$\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$$" },
  { label: "Chem", snippet: "$$\\ce{2H2 + O2 -> 2H2O}$$" },
];

interface LatexShortcutPanelProps {
  targetId: string;
}

export default function LatexShortcutPanel({
  targetId,
}: LatexShortcutPanelProps) {
  function insertSnippet(snippet: string) {
    const field = document.getElementById(targetId) as
      | HTMLTextAreaElement
      | HTMLInputElement
      | null;

    if (!field) return;

    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const nextValue =
      field.value.slice(0, start) + snippet + field.value.slice(end);

    field.value = nextValue;
    field.focus();

    const caret = start + snippet.length;
    field.setSelectionRange?.(caret, caret);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        LaTeX helper
      </p>
      <div className="flex flex-wrap gap-2">
        {latexShortcuts.map((shortcut) => (
          <Button
            key={shortcut.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => insertSnippet(shortcut.snippet)}
          >
            {shortcut.label}
          </Button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Inline formula-д <code>$...$</code>, томъёоны block-д <code>$$...$$</code>,
        chemistry-д <code>{"\\ce{H2O}"}</code> маягаар ашиглана.
      </p>
    </div>
  );
}
