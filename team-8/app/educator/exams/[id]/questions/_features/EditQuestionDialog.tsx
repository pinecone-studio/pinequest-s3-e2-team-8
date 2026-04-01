"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateQuestion } from "@/lib/question/actions";
import type {
  AiQuestionVariantMode,
  Question,
  QuestionPassage,
  QuestionType,
} from "@/types";
import MathContent from "@/components/math/MathContent";
import LatexShortcutPanel from "@/components/math/LatexShortcutPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Сонгох" },
  { value: "multiple_response", label: "Олон зөв" },
  { value: "fill_blank", label: "Нөхөх" },
  { value: "essay", label: "Задгай / Эссэ" },
  { value: "matching", label: "Холбох" },
];

const aiVariantModes: Array<{
  value: AiQuestionVariantMode;
  label: string;
  description: string;
}> = [
  {
    value: "two_fixed",
    label: "2 хувилбар",
    description: "AI 2 тогтмол хувилбар бэлдэнэ.",
  },
  {
    value: "per_student",
    label: "Сурагч бүрт өөр",
    description: "Сурагч бүр өөр хувилбар авна.",
  },
];

interface EditQuestionDialogProps {
  examId: string;
  question: Question;
  passages: QuestionPassage[];
}

interface MatchingPair {
  left: string;
  right: string;
}

function getChoiceOptions(question: Question) {
  if (
    question.type === "multiple_choice" ||
    question.type === "multiple_response"
  ) {
    const existingOptions = Array.isArray(question.options)
      ? question.options.map((option) => option.trim()).filter(Boolean)
      : [];

    return existingOptions.length > 0 ? existingOptions : ["", ""];
  }

  return ["", ""];
}

function getMultipleCorrectAnswers(question: Question) {
  if (question.type !== "multiple_response" || !question.correct_answer) {
    return [];
  }

  try {
    const parsed = JSON.parse(question.correct_answer) as string[];
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function getMatchingPairs(question: Question): MatchingPair[] {
  if (question.type !== "matching" || !Array.isArray(question.options)) {
    return [
      { left: "", right: "" },
      { left: "", right: "" },
    ];
  }

  const pairs = question.options
    .map((option) => {
      const [left, right] = String(option).split("|||");
      if (!left || !right) return null;
      return { left, right };
    })
    .filter((item): item is MatchingPair => Boolean(item));

  return pairs.length > 0
    ? pairs
    : [
        { left: "", right: "" },
        { left: "", right: "" },
      ];
}

function getInitialPassageId(question: Question) {
  return question.passage_id ?? question.question_passages?.id ?? "__none";
}

export default function EditQuestionDialog({
  examId,
  question,
  passages,
}: EditQuestionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const contentTargetId = `content-${question.id}`;
  const contentHtmlTargetId = `content-html-${question.id}`;
  const [type, setType] = useState<QuestionType>(question.type);
  const [isFormulaToolOpen, setIsFormulaToolOpen] = useState(false);
  const [activeFormulaTarget, setActiveFormulaTarget] = useState({
    id: contentTargetId,
    label: "Асуулт",
  });
  const [selectedPassageId, setSelectedPassageId] = useState(
    getInitialPassageId(question)
  );
  const [options, setOptions] = useState<string[]>(() => getChoiceOptions(question));
  const [correctAnswer, setCorrectAnswer] = useState(question.correct_answer ?? "");
  const [multipleCorrectAnswers, setMultipleCorrectAnswers] = useState<string[]>(
    () => getMultipleCorrectAnswers(question)
  );
  const [matchingPairs, setMatchingPairs] = useState<MatchingPair[]>(() =>
    getMatchingPairs(question)
  );
  const [aiVariantEnabled, setAiVariantEnabled] = useState(
    Boolean(question.ai_variant_enabled)
  );
  const [aiVariantMode, setAiVariantMode] = useState<AiQuestionVariantMode>(
    question.ai_variant_mode ?? "per_student"
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedPassage =
    selectedPassageId === "__none"
      ? null
      : passages.find((passage) => passage.id === selectedPassageId) ?? null;
  const hasAdvancedValues = Boolean(
    question.image_url || question.content_html || question.explanation
  );

  function resetState(nextType: QuestionType = question.type) {
    setType(nextType);
    setSelectedPassageId(getInitialPassageId(question));
    setOptions(getChoiceOptions(question));
    setCorrectAnswer(question.correct_answer ?? "");
    setMultipleCorrectAnswers(getMultipleCorrectAnswers(question));
    setMatchingPairs(getMatchingPairs(question));
    setAiVariantEnabled(Boolean(question.ai_variant_enabled));
    setAiVariantMode(question.ai_variant_mode ?? "per_student");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      resetState();
      setIsFormulaToolOpen(false);
      setActiveFormulaTarget({
        id: contentTargetId,
        label: "Асуулт",
      });
    } else {
      setError(null);
      setSaving(false);
      setIsFormulaToolOpen(false);
    }

    setOpen(nextOpen);
  }

  function toggleFormulaTool(targetId: string, label: string) {
    const isSameTarget = activeFormulaTarget.id === targetId;
    if (isFormulaToolOpen && isSameTarget) {
      setIsFormulaToolOpen(false);
      return;
    }

    setActiveFormulaTarget({ id: targetId, label });
    setIsFormulaToolOpen(true);
  }

  function handleTypeChange(value: QuestionType) {
    setType(value);
    setOptions(["", ""]);
    setCorrectAnswer("");
    setMultipleCorrectAnswers([]);
    setMatchingPairs([
      { left: "", right: "" },
      { left: "", right: "" },
    ]);
  }

  function updateOption(index: number, value: string) {
    const previousValue = options[index];

    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });

    if (correctAnswer === previousValue) {
      setCorrectAnswer(value);
    }

    setMultipleCorrectAnswers((prev) =>
      prev.map((answer) => (answer === previousValue ? value : answer))
    );
  }

  function addOption() {
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(index: number) {
    const removedValue = options[index];
    const nextOptions = options.filter((_, optionIndex) => optionIndex !== index);

    setOptions(nextOptions.length >= 2 ? nextOptions : [...nextOptions, ""]);

    if (correctAnswer === removedValue) {
      setCorrectAnswer("");
    }

    setMultipleCorrectAnswers((prev) =>
      prev.filter((answer) => answer !== removedValue)
    );
  }

  function toggleMultipleAnswer(option: string) {
    setMultipleCorrectAnswers((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  }

  function updateMatchingPair(
    index: number,
    key: keyof MatchingPair,
    value: string
  ) {
    setMatchingPairs((prev) =>
      prev.map((pair, pairIndex) =>
        pairIndex === index ? { ...pair, [key]: value } : pair
      )
    );
  }

  function addMatchingPair() {
    setMatchingPairs((prev) => [...prev, { left: "", right: "" }]);
  }

  function removeMatchingPair(index: number) {
    setMatchingPairs((prev) => {
      const next = prev.filter((_, pairIndex) => pairIndex !== index);
      return next.length >= 2 ? next : [...next, { left: "", right: "" }];
    });
  }

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setError(null);

    formData.set("type", type);
    formData.set(
      "passage_id",
      selectedPassageId === "__none" ? "" : selectedPassageId
    );
    formData.set("ai_variant_enabled", aiVariantEnabled ? "on" : "off");
    formData.set("ai_variant_mode", aiVariantMode);

    if (type === "multiple_choice") {
      const validOptions = options.map((option) => option.trim()).filter(Boolean);

      if (validOptions.length < 2) {
        setError("Дор хаяж 2 сонголт үлдээнэ үү.");
        setSaving(false);
        return;
      }

      if (!correctAnswer.trim() || !validOptions.includes(correctAnswer.trim())) {
        setError("Зөв хариултаа сонгоно уу.");
        setSaving(false);
        return;
      }

      formData.set("options", JSON.stringify(validOptions));
      formData.set("correct_answer", correctAnswer.trim());
    } else if (type === "multiple_response") {
      const validOptions = options.map((option) => option.trim()).filter(Boolean);
      const validCorrectAnswers = multipleCorrectAnswers
        .map((answer) => answer.trim())
        .filter((answer) => answer && validOptions.includes(answer));

      if (validOptions.length < 2) {
        setError("Дор хаяж 2 сонголт үлдээнэ үү.");
        setSaving(false);
        return;
      }

      if (validCorrectAnswers.length < 1) {
        setError("Дор хаяж 1 зөв хариулт сонгоно уу.");
        setSaving(false);
        return;
      }

      formData.set("options", JSON.stringify(validOptions));
      formData.set("correct_answer", JSON.stringify(validCorrectAnswers));
    } else if (type === "fill_blank") {
      if (!correctAnswer.trim()) {
        setError("Зөв хариултаа оруулна уу.");
        setSaving(false);
        return;
      }

      formData.set("correct_answer", correctAnswer.trim());
      formData.set("options", "[]");
    } else if (type === "matching") {
      const validPairs = matchingPairs
        .map((pair) => ({
          left: pair.left.trim(),
          right: pair.right.trim(),
        }))
        .filter((pair) => pair.left && pair.right);

      if (validPairs.length < 2) {
        setError("Дор хаяж 2 мөр хэрэгтэй.");
        setSaving(false);
        return;
      }

      formData.set("options", JSON.stringify(validPairs));
      formData.set("correct_answer", "");
    } else {
      formData.set("correct_answer", "");
      formData.set("options", "[]");
    }

    const result = await updateQuestion(question.id, examId, formData);
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-[68px] justify-center"
        >
          Засах
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Асуулт засах</DialogTitle>
        </DialogHeader>

        <form className="space-y-5" action={handleSubmit}>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 rounded-xl border p-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Асуултын төрөл</Label>
              <Select
                value={type}
                onValueChange={(value) => handleTypeChange(value as QuestionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {questionTypes.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`points-${question.id}`}>Оноо</Label>
              <Input
                id={`points-${question.id}`}
                name="points"
                type="number"
                min="0.5"
                step="0.5"
                defaultValue={question.points}
              />
            </div>

            <div className="space-y-2">
              <Label>Эх материал</Label>
              <Select value={selectedPassageId} onValueChange={setSelectedPassageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Холбохгүй" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Холбохгүй</SelectItem>
                  {passages.map((passage, index) => (
                    <SelectItem key={passage.id} value={passage.id}>
                      {passage.title || `Материал ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            className={cn(
              "space-y-2.5 rounded-xl border p-3 transition-colors",
              aiVariantEnabled
                ? "border-amber-200 bg-amber-50"
                : "border-border bg-muted/20"
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-amber-100 p-1.5 text-amber-700">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm font-semibold text-foreground">AI хувилбар</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-9 rounded-full px-3.5 text-sm",
                  aiVariantEnabled
                    ? "border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-100"
                    : ""
                )}
                onClick={() => setAiVariantEnabled((prev) => !prev)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {aiVariantEnabled
                  ? "Идэвхтэй"
                  : "Идэвхжүүлэх"}
              </Button>
            </div>
            <input
              type="hidden"
              name="ai_variant_enabled"
              value={aiVariantEnabled ? "on" : "off"}
            />
            <input type="hidden" name="ai_variant_mode" value={aiVariantMode} />
            {aiVariantEnabled ? (
              <div className="grid gap-2 md:grid-cols-2">
                {aiVariantModes.map((mode) => {
                  const isActive = aiVariantMode === mode.value;

                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setAiVariantMode(mode.value)}
                      className={cn(
                        "rounded-2xl border px-3.5 py-2.5 text-left transition-colors",
                        isActive
                          ? "border-amber-300 bg-white text-zinc-950 shadow-sm"
                          : "border-amber-100 bg-amber-50/60 text-zinc-600 hover:border-amber-200 hover:bg-white/80"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{mode.label}</p>
                        {isActive ? (
                          <Check className="h-4 w-4 text-amber-700" />
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-zinc-600">
                        {mode.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {selectedPassage && (
            <div className="space-y-2 rounded-lg border border-dashed bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Сонгосон эх материал
              </p>
              {selectedPassage.title && (
                <p className="font-medium">{selectedPassage.title}</p>
              )}
              <MathContent
                html={selectedPassage.content_html}
                text={selectedPassage.content}
                className="prose prose-sm max-w-none text-foreground"
              />
              {selectedPassage.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedPassage.image_url}
                  alt="Сонгосон эх материалын зураг"
                  className="max-h-56 rounded-lg border"
                />
              )}
            </div>
          )}

          {isFormulaToolOpen && (
            <LatexShortcutPanel
              targetId={activeFormulaTarget.id}
              targetLabel={activeFormulaTarget.label}
              minimal
            />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={contentTargetId}>Асуулт</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => toggleFormulaTool(contentTargetId, "Асуулт")}
              >
                {isFormulaToolOpen && activeFormulaTarget.id === contentTargetId
                  ? "Томьёо нуух"
                  : "Томьёо"}
              </Button>
            </div>
            <Textarea
              id={contentTargetId}
              name="content"
              rows={4}
              defaultValue={question.content}
              placeholder="Асуултын текст..."
              onFocus={() =>
                setActiveFormulaTarget({
                  id: contentTargetId,
                  label: "Асуулт",
                })
              }
            />
          </div>

          {(type === "multiple_choice" || type === "multiple_response") && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <Label>
                  {type === "multiple_choice"
                    ? "Сонголтууд"
                    : "Сонголтууд ба зөв хариултууд"}
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  Сонголт нэмэх
                </Button>
              </div>

              {options.map((option, index) => {
                const isChecked =
                  type === "multiple_choice"
                    ? correctAnswer === option && option.trim() !== ""
                    : multipleCorrectAnswers.includes(option) && option.trim() !== "";

                return (
                  <div
                    key={`${question.id}-option-${index}`}
                    className="grid gap-2 md:grid-cols-[auto_1fr_auto]"
                  >
                    <input
                      type={type === "multiple_choice" ? "radio" : "checkbox"}
                      name={`correct-choice-${question.id}-${index}`}
                      checked={isChecked}
                      onChange={() =>
                        type === "multiple_choice"
                          ? setCorrectAnswer(option)
                          : toggleMultipleAnswer(option)
                      }
                      className="mt-3 h-4 w-4 shrink-0"
                      disabled={!option.trim()}
                    />
                    <Input
                      value={option}
                      onChange={(event) => updateOption(index, event.target.value)}
                      placeholder={`${index + 1}-р сонголт`}
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(index)}
                      >
                        Хасах
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {type === "fill_blank" && (
            <div className="space-y-2 rounded-xl border p-4">
              <Label htmlFor={`fill-blank-${question.id}`}>Зөв хариулт</Label>
              <Input
                id={`fill-blank-${question.id}`}
                value={correctAnswer}
                onChange={(event) => setCorrectAnswer(event.target.value)}
                placeholder="Жишээ: 3x + 2"
              />
            </div>
          )}

          {type === "matching" && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <Label>Холбох мөрүүд</Label>
                <Button type="button" variant="outline" size="sm" onClick={addMatchingPair}>
                  Мөр нэмэх
                </Button>
              </div>

              {matchingPairs.map((pair, index) => (
                <div
                  key={`${question.id}-pair-${index}`}
                  className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
                >
                  <Input
                    value={pair.left}
                    onChange={(event) =>
                      updateMatchingPair(index, "left", event.target.value)
                    }
                    placeholder={`Зүүн тал ${index + 1}`}
                  />
                  <Input
                    value={pair.right}
                    onChange={(event) =>
                      updateMatchingPair(index, "right", event.target.value)
                    }
                    placeholder={`Баруун тал ${index + 1}`}
                  />
                  {matchingPairs.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMatchingPair(index)}
                    >
                      Хасах
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {type === "essay" && (
            <div className="rounded-xl border p-4 text-sm text-muted-foreground">
              Энэ асуултыг дараа нь багш гараар үнэлнэ.
            </div>
          )}

          <details className="rounded-xl border p-4" open={hasAdvancedValues}>
            <summary className="cursor-pointer text-sm font-medium">Нэмэлт</summary>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`image-url-${question.id}`}>Зургийн URL</Label>
                  <Input
                    id={`image-url-${question.id}`}
                    name="image_url"
                    type="url"
                    defaultValue={question.image_url ?? ""}
                    placeholder="https://example.com/question-image.png"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`explanation-${question.id}`}>Тайлбар</Label>
                  <Textarea
                    id={`explanation-${question.id}`}
                    name="explanation"
                    rows={3}
                    defaultValue={question.explanation ?? ""}
                    placeholder="Товч тайлбар..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={contentHtmlTargetId}>HTML контент</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() =>
                      toggleFormulaTool(contentHtmlTargetId, "HTML контент")
                    }
                  >
                    {isFormulaToolOpen &&
                    activeFormulaTarget.id === contentHtmlTargetId
                      ? "Томьёо нуух"
                      : "Томьёо"}
                  </Button>
                </div>
                <Textarea
                  id={contentHtmlTargetId}
                  name="content_html"
                  rows={4}
                  defaultValue={question.content_html ?? ""}
                  placeholder="<p>Форматтай текст...</p>"
                  onFocus={() =>
                    setActiveFormulaTarget({
                      id: contentHtmlTargetId,
                      label: "HTML контент",
                    })
                  }
                />
              </div>
            </div>
          </details>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Хадгалж байна..." : "Өөрчлөлт хадгалах"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
