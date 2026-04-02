"use client";

import { useState, type ClipboardEvent } from "react";
import {
  Check,
  ChevronDown,
  PlusCircle,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { addQuestion } from "@/lib/question/actions";
import { parsePastedQuestionText } from "@/lib/question/paste";
import MathContent from "@/components/math/MathContent";
import LatexShortcutPanel from "@/components/math/LatexShortcutPanel";
import { hasMathMarkup } from "@/components/math/math-text";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type {
  AiQuestionVariantMode,
  QuestionPassage,
  QuestionType,
} from "@/types";
import QuestionImportActions from "./QuestionImportActions";

interface Props {
  examId: string;
  passages: QuestionPassage[];
}

interface MatchingPair {
  left: string;
  right: string;
}

const defaultSelectionOptions = ["", "", "", ""];

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Нэг сонголттой" },
  { value: "multiple_response", label: "Олон сонголттой" },
  { value: "fill_blank", label: "Нөхөх" },
  { value: "essay", label: "Эссэ" },
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

function createEmptyMatchingPair(): MatchingPair {
  return { left: "", right: "" };
}

function buildSelectionOptions(options: string[]) {
  return options.length >= 4
    ? options
    : [...options, ...Array.from({ length: 4 - options.length }, () => "")];
}

export default function AddQuestionForm({ examId, passages }: Props) {
  const [type, setType] = useState<QuestionType>("multiple_choice");
  const [isFormulaToolOpen, setIsFormulaToolOpen] = useState(false);
  const [activeFormulaTarget, setActiveFormulaTarget] = useState({
    id: "content",
    label: "Асуулт",
  });
  const [selectedPassageId, setSelectedPassageId] = useState("__none");
  const [content, setContent] = useState("");
  const [options, setOptions] = useState(defaultSelectionOptions);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [multipleCorrectAnswers, setMultipleCorrectAnswers] = useState<string[]>([]);
  const [matchingPairs, setMatchingPairs] = useState<MatchingPair[]>([
    createEmptyMatchingPair(),
    createEmptyMatchingPair(),
  ]);
  const [points, setPoints] = useState(1);
  const [aiVariantEnabled, setAiVariantEnabled] = useState(false);
  const [aiVariantMode, setAiVariantMode] =
    useState<AiQuestionVariantMode>("per_student");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedPassage =
    selectedPassageId === "__none"
      ? null
      : passages.find((passage) => passage.id === selectedPassageId) ?? null;

  const isSelectionType =
    type === "multiple_choice" || type === "multiple_response";

  function resetTypeState(nextType: QuestionType) {
    setType(nextType);
    setOptions(defaultSelectionOptions);
    setCorrectAnswer("");
    setMultipleCorrectAnswers([]);
    setMatchingPairs([createEmptyMatchingPair(), createEmptyMatchingPair()]);
  }

  function applyParsedQuestion(rawText: string) {
    const parsed = parsePastedQuestionText(rawText);
    if (!parsed) return false;

    setError(null);
    setContent(parsed.content);
    setType(parsed.type);

    if (parsed.type === "multiple_choice") {
      setOptions(buildSelectionOptions(parsed.options));
      setCorrectAnswer(parsed.correctAnswer);
      setMultipleCorrectAnswers([]);
      setMatchingPairs([createEmptyMatchingPair(), createEmptyMatchingPair()]);
      return true;
    }

    if (parsed.type === "multiple_response") {
      setOptions(buildSelectionOptions(parsed.options));
      setCorrectAnswer("");
      setMultipleCorrectAnswers(parsed.multipleCorrectAnswers);
      setMatchingPairs([createEmptyMatchingPair(), createEmptyMatchingPair()]);
      return true;
    }

    if (parsed.type === "fill_blank") {
      setOptions(defaultSelectionOptions);
      setCorrectAnswer(parsed.correctAnswer);
      setMultipleCorrectAnswers([]);
      setMatchingPairs([createEmptyMatchingPair(), createEmptyMatchingPair()]);
      return true;
    }

    if (parsed.type === "matching") {
      setOptions(defaultSelectionOptions);
      setCorrectAnswer("");
      setMultipleCorrectAnswers([]);
      setMatchingPairs(
        parsed.matchingPairs.length >= 2
          ? parsed.matchingPairs
          : [createEmptyMatchingPair(), createEmptyMatchingPair()]
      );
      return true;
    }

    setOptions(defaultSelectionOptions);
    setCorrectAnswer("");
    setMultipleCorrectAnswers([]);
    setMatchingPairs([createEmptyMatchingPair(), createEmptyMatchingPair()]);
    return true;
  }

  function handleContentPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedText = event.clipboardData.getData("text");
    if (!pastedText.trim()) return;

    const didParse = applyParsedQuestion(pastedText);
    if (!didParse) return;

    event.preventDefault();
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
    setMatchingPairs((prev) => [...prev, createEmptyMatchingPair()]);
  }

  function removeMatchingPair(index: number) {
    setMatchingPairs((prev) => {
      const next = prev.filter((_, pairIndex) => pairIndex !== index);
      return next.length >= 2 ? next : [...next, createEmptyMatchingPair()];
    });
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    formData.set("type", type);
    formData.set("points", String(points));
    formData.set("difficulty", "medium");
    formData.set("tags", "");
    formData.set("content_html", "");
    formData.set("image_url", "");
    formData.set("explanation", "");
    formData.set("ai_variant_enabled", aiVariantEnabled ? "on" : "off");
    formData.set("ai_variant_mode", aiVariantMode);
    formData.set(
      "passage_id",
      selectedPassageId === "__none" ? "" : selectedPassageId
    );

    if (type === "multiple_choice") {
      const validOptions = options.map((option) => option.trim()).filter(Boolean);

      if (validOptions.length < 2) {
        setError("Дор хаяж 2 хариултын сонголт оруулна уу.");
        setLoading(false);
        return;
      }

      if (!correctAnswer.trim() || !validOptions.includes(correctAnswer.trim())) {
        setError("Зөв хариултаа сонгоно уу.");
        setLoading(false);
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
        setError("Дор хаяж 2 хариултын сонголт оруулна уу.");
        setLoading(false);
        return;
      }

      if (validCorrectAnswers.length < 1) {
        setError("Дор хаяж 1 зөв хариулт сонгоно уу.");
        setLoading(false);
        return;
      }

      formData.set("options", JSON.stringify(validOptions));
      formData.set("correct_answer", JSON.stringify(validCorrectAnswers));
    } else if (type === "fill_blank") {
      if (!correctAnswer.trim()) {
        setError("Зөв хариултаа оруулна уу.");
        setLoading(false);
        return;
      }

      formData.set("options", "[]");
      formData.set("correct_answer", correctAnswer.trim());
    } else if (type === "matching") {
      const validPairs = matchingPairs
        .map((pair) => ({
          left: pair.left.trim(),
          right: pair.right.trim(),
        }))
        .filter((pair) => pair.left && pair.right);

      if (validPairs.length < 2) {
        setError("Холбох асуултад дор хаяж 2 мөр оруулна уу.");
        setLoading(false);
        return;
      }

      formData.set("options", JSON.stringify(validPairs));
      formData.set("correct_answer", "");
    } else {
      formData.set("options", "[]");
      formData.set("correct_answer", "");
    }

    const result = await addQuestion(examId, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    resetTypeState(type);
    setIsFormulaToolOpen(false);
    setContent("");
    setPoints(1);
    setAiVariantEnabled(false);
    setAiVariantMode("per_student");
    setSelectedPassageId("__none");

    const form = document.getElementById("question-form") as HTMLFormElement | null;
    form?.reset();
    setLoading(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  return (
    <div className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.16)] md:p-8">
      <form id="question-form" action={handleSubmit} className="space-y-6">
        <QuestionImportActions
          examId={examId}
          aiVariantEnabled={aiVariantEnabled}
          onAiVariantEnabledChange={setAiVariantEnabled}
          aiVariantMode={aiVariantMode}
          formulaToolOpen={isFormulaToolOpen}
          onFormulaToolOpenChange={setIsFormulaToolOpen}
        />

        <div className="text-zinc-950">
          <h2 className="text-2xl font-semibold tracking-tight">Шинэ асуулт</h2>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Асуулт амжилттай нэмэгдлээ.
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_84px]">
          <div className="space-y-2.5">
            <Label className="text-sm font-medium text-zinc-700">Төрөл</Label>
            <Select
              value={type}
              onValueChange={(value) => resetTypeState(value as QuestionType)}
            >
              <SelectTrigger className="h-12 rounded-2xl border-zinc-200 bg-white px-4 text-sm shadow-none focus-visible:ring-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-zinc-200 bg-white">
                {questionTypes.map((questionType) => (
                  <SelectItem key={questionType.value} value={questionType.value}>
                    {questionType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2.5">
            <Label
              htmlFor="question-points"
              className="text-sm font-medium text-zinc-700"
            >
              Оноо
            </Label>
            <Input
              id="question-points"
              type="number"
              min={1}
              max={100}
              value={points}
              onChange={(event) =>
                setPoints(Math.max(1, Number(event.target.value) || 1))
              }
              className="h-10 rounded-xl border-zinc-200 bg-white px-2.5 text-center text-sm tabular-nums shadow-none focus-visible:ring-zinc-200"
            />
          </div>
        </div>

        {aiVariantEnabled ? (
          <div className="space-y-2.5 rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-amber-100 p-1.5 text-amber-700">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm font-semibold text-zinc-950">AI хувилбар</p>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  Идэвхтэй
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-amber-700 hover:bg-white/80 hover:text-amber-950"
                onClick={() => setAiVariantEnabled(false)}
                aria-label="AI хувилбарыг хаах"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
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
          </div>
        ) : null}

        <div className="hidden">
        <div
          className={cn(
            "space-y-3 rounded-[24px] border p-4 transition-colors",
            aiVariantEnabled
              ? "border-amber-200 bg-amber-50"
              : "border-zinc-200 bg-zinc-50/70"
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-950">
                AI-аар өгөгдөл солих
              </p>
              <p className="text-sm text-zinc-500">
                Идэвхжүүлбэл сурагч бүр энэ асуултыг өөр тоо, нэр, өгөгдөлтэй
                хувилбараар авна.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-11 rounded-full px-4 text-sm",
                aiVariantEnabled
                  ? "border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-100"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
              onClick={() => setAiVariantEnabled((prev) => !prev)}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {aiVariantEnabled ? "AI хувилбар идэвхтэй" : "Идэвхжүүлэх"}
            </Button>
          </div>
          <input
            type="hidden"
            name="ai_variant_enabled"
            value={aiVariantEnabled ? "on" : "off"}
          />
          {aiVariantEnabled ? (
            <p className="rounded-2xl bg-white/80 px-3 py-2 text-sm text-amber-900">
              Session эхлэх үед AI зөвхөн асуултын өгөгдлийг хувиргаж, зөв
              хариултыг нь шинэчилнэ.
            </p>
          ) : null}
        </div>

        </div>

        {passages.length > 0 ? (
          <div className="space-y-2.5">
            <Label className="text-sm font-medium text-zinc-700">
              Нийтлэг өгөгдөл / эх материал
            </Label>
            <Select value={selectedPassageId} onValueChange={setSelectedPassageId}>
              <SelectTrigger className="h-12 rounded-2xl border-zinc-200 bg-white px-4 text-sm shadow-none focus-visible:ring-zinc-200">
                <SelectValue placeholder="Эх материал холбохгүй" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-zinc-200 bg-white">
                <SelectItem value="__none">Холбохгүй</SelectItem>
                {passages.map((passage, index) => (
                  <SelectItem key={passage.id} value={passage.id}>
                    {passage.title || `Материал ${index + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {selectedPassage ? (
          <div className="space-y-3 rounded-[24px] border border-dashed border-zinc-200 bg-zinc-50 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-950">
                Сонгосон эх материал
              </p>
              {selectedPassage.title ? (
                <p className="text-sm text-zinc-500">{selectedPassage.title}</p>
              ) : null}
            </div>
            <MathContent
              html={selectedPassage.content_html}
              text={selectedPassage.content}
              className="prose prose-sm max-w-none text-zinc-900"
            />
            {selectedPassage.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedPassage.image_url}
                alt="Сонгосон эх материалын зураг"
                className="max-h-56 rounded-2xl border border-zinc-200"
              />
            ) : null}
          </div>
        ) : null}

        {isFormulaToolOpen ? (
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3 z-10 bg-white/90 text-zinc-500 hover:bg-white hover:text-zinc-950"
              onClick={() => setIsFormulaToolOpen(false)}
              aria-label="Томьёоны хэсгийг хаах"
            >
              <X className="h-4 w-4" />
            </Button>
            <LatexShortcutPanel
              targetId={activeFormulaTarget.id}
              targetLabel={activeFormulaTarget.label}
              minimal
            />
          </div>
        ) : null}

        <div className="space-y-2.5">
          <Label htmlFor="content" className="text-sm font-medium text-zinc-700">
            Асуулт
          </Label>
          <Textarea
            id="content"
            name="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onPaste={handleContentPaste}
            onFocus={() =>
              setActiveFormulaTarget({
                id: "content",
                label: "Асуулт",
              })
            }
            placeholder={"Асуултаа энд бичнэ үү...\nЖишээ: \\frac{a+b}{c} эсвэл $\\frac{a+b}{c}$"}
            rows={4}
            required
            className="min-h-[180px] rounded-[24px] border-zinc-200 bg-white px-4 py-3 text-base leading-7 shadow-none focus-visible:ring-zinc-200"
          />
        </div>

        {hasMathMarkup(content) ? (
          <div className="space-y-3 rounded-[24px] border border-zinc-200 bg-zinc-50 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-950">
                Асуултын харагдах байдал
              </p>
              <p className="text-xs text-zinc-500">
                Сонгосон томьёо асуулт дээр ингэж render хийгдэнэ.
              </p>
            </div>
            <div className="rounded-[20px] border border-zinc-200 bg-white px-4 py-3">
              <MathContent
                text={content}
                className="prose prose-sm max-w-none text-zinc-900"
              />
            </div>
          </div>
        ) : null}

        {isSelectionType ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium text-zinc-700">
                Хариултууд
              </Label>
              <span className="text-sm text-zinc-400">
                (Зөв хариултыг сонгоно уу)
              </span>
            </div>

            {options.map((option, index) => {
              const isSelected =
                type === "multiple_choice"
                  ? correctAnswer === option && option.trim() !== ""
                  : multipleCorrectAnswers.includes(option) &&
                    option.trim() !== "";

              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors",
                    isSelected
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-200 bg-white"
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      type === "multiple_choice"
                        ? setCorrectAnswer(option)
                        : toggleMultipleAnswer(option)
                    }
                    disabled={!option.trim()}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isSelected
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-zinc-300 bg-white text-transparent",
                      !option.trim() && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <Check className="h-4 w-4" />
                  </button>

                  <Input
                    id={`option-${index}`}
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                    onFocus={() =>
                      setActiveFormulaTarget({
                        id: `option-${index}`,
                        label: `Хариулт ${index + 1}`,
                      })
                    }
                    placeholder={`Хариулт ${index + 1}`}
                    className="h-10 border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                  />

                  {options.length > 2 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-zinc-400 hover:text-zinc-950"
                      onClick={() => removeOption(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              );
            })}

            <button
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
            >
              <PlusCircle className="h-4 w-4" />
              Хариулт нэмэх
            </button>
          </div>
        ) : null}

        {type === "fill_blank" ? (
          <div className="space-y-2.5">
            <Label
              htmlFor="fill_blank_answer"
              className="text-sm font-medium text-zinc-700"
            >
              Зөв хариулт
            </Label>
            <Input
              id="fill_blank_answer"
              value={correctAnswer}
              onChange={(event) => setCorrectAnswer(event.target.value)}
              onFocus={() =>
                setActiveFormulaTarget({
                  id: "fill_blank_answer",
                  label: "Зөв хариулт",
                })
              }
              placeholder="Зөв хариултаа бичнэ үү"
              className="h-12 rounded-2xl border-zinc-200 bg-white px-4 text-sm shadow-none focus-visible:ring-zinc-200"
            />
          </div>
        ) : null}

        {type === "essay" ? (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
            Энэ төрлийн асуултыг багш дараа нь гараар шалгана.
          </div>
        ) : null}

        {type === "matching" ? (
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-700">
              Холбох мөрүүд
            </Label>
            {matchingPairs.map((pair, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-2xl border border-zinc-200 p-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-center"
              >
                <Input
                  id={`matching-left-${index}`}
                  value={pair.left}
                  onChange={(event) =>
                    updateMatchingPair(index, "left", event.target.value)
                  }
                  onFocus={() =>
                    setActiveFormulaTarget({
                      id: `matching-left-${index}`,
                      label: `Холбох мөр ${index + 1} · Зүүн тал`,
                    })
                  }
                  placeholder={`Зүүн тал ${index + 1}`}
                  className="h-10 rounded-xl border-zinc-200 bg-white px-3 text-sm shadow-none focus-visible:ring-zinc-200"
                />
                <ChevronDown className="mx-auto h-4 w-4 rotate-[-90deg] text-zinc-300" />
                <Input
                  id={`matching-right-${index}`}
                  value={pair.right}
                  onChange={(event) =>
                    updateMatchingPair(index, "right", event.target.value)
                  }
                  onFocus={() =>
                    setActiveFormulaTarget({
                      id: `matching-right-${index}`,
                      label: `Холбох мөр ${index + 1} · Баруун тал`,
                    })
                  }
                  placeholder={`Баруун тал ${index + 1}`}
                  className="h-10 rounded-xl border-zinc-200 bg-white px-3 text-sm shadow-none focus-visible:ring-zinc-200"
                />
                {matchingPairs.length > 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-zinc-400 hover:text-zinc-950"
                    onClick={() => removeMatchingPair(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))}

            <button
              type="button"
              onClick={addMatchingPair}
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
            >
              <PlusCircle className="h-4 w-4" />
              Мөр нэмэх
            </button>
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-2xl bg-zinc-900 text-base font-medium text-white hover:bg-zinc-800"
        >
          {loading ? "Асуулт нэмж байна..." : "Асуулт нэмэх"}
        </Button>
      </form>
    </div>
  );
}
