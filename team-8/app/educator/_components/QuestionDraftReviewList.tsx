"use client";

import type { Dispatch, SetStateAction } from "react";
import { PlusCircle, Trash2 } from "lucide-react";
import type {
  QuestionImportDraft,
  QuestionImportMatchingPair,
  QuestionType,
} from "@/types";
import { Badge } from "@/components/ui/badge";
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

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Нэг сонголттой" },
  { value: "multiple_response", label: "Олон сонголттой" },
  { value: "fill_blank", label: "Нөхөх" },
  { value: "essay", label: "Эссэ" },
  { value: "matching", label: "Холбох" },
];

const hiddenCorrectAnswerWarningSnippets = [
  "Зөв хариулт танигдсангүй",
  "зөв хариулт олдсонгүй",
];

const hiddenCorrectAnswerErrorSnippets = [
  "Зөв хариулт нь сонголтуудын нэг байх ёстой.",
  "Дор хаяж 1 зөв хариулт сонгох хэрэгтэй.",
  "Зөв хариултууд нь сонголтуудын дотор байх ёстой.",
  "Нөхөх асуултын зөв хариултыг оруулна уу.",
];

function includesAnySnippet(value: string, snippets: string[]) {
  return snippets.some((snippet) => value.includes(snippet));
}

function createEmptyMatchingPair(): QuestionImportMatchingPair {
  return { left: "", right: "" };
}

function resetDraftForType(
  draft: QuestionImportDraft,
  nextType: QuestionType
): QuestionImportDraft {
  const nextOptions = draft.options.length >= 2 ? draft.options : ["", ""];
  const nextPairs =
    draft.matchingPairs.length >= 2
      ? draft.matchingPairs
      : [createEmptyMatchingPair(), createEmptyMatchingPair()];

  if (nextType === "multiple_choice") {
    return {
      ...draft,
      type: nextType,
      options: nextOptions,
      correctAnswer: draft.correctAnswer || draft.multipleCorrectAnswers[0] || "",
      multipleCorrectAnswers: [],
      matchingPairs: [],
      errors: [],
    };
  }

  if (nextType === "multiple_response") {
    return {
      ...draft,
      type: nextType,
      options: nextOptions,
      correctAnswer: "",
      multipleCorrectAnswers:
        draft.multipleCorrectAnswers.length > 0
          ? draft.multipleCorrectAnswers
          : draft.correctAnswer
            ? [draft.correctAnswer]
            : [],
      matchingPairs: [],
      errors: [],
    };
  }

  if (nextType === "fill_blank") {
    return {
      ...draft,
      type: nextType,
      options: [],
      correctAnswer: draft.correctAnswer || draft.multipleCorrectAnswers[0] || "",
      multipleCorrectAnswers: [],
      matchingPairs: [],
      errors: [],
    };
  }

  if (nextType === "matching") {
    return {
      ...draft,
      type: nextType,
      options: [],
      correctAnswer: "",
      multipleCorrectAnswers: [],
      matchingPairs: nextPairs,
      errors: [],
    };
  }

  return {
    ...draft,
    type: nextType,
    options: [],
    correctAnswer: "",
    multipleCorrectAnswers: [],
    matchingPairs: [],
    errors: [],
  };
}

function getLiveDraftErrors(draft: QuestionImportDraft) {
  const errors: string[] = [];

  if (!draft.content.trim() && !draft.contentHtml.trim()) {
    errors.push("Асуултын агуулга хоосон байна.");
  }

  if (!Number.isFinite(draft.points) || draft.points <= 0) {
    errors.push("Оноо 0-ээс их байх ёстой.");
  }

  if (draft.type === "multiple_choice") {
    const options = draft.options.map((item) => item.trim()).filter(Boolean);
    if (options.length < 2) {
      errors.push("Сонгох асуултад дор хаяж 2 сонголт хэрэгтэй.");
    }

    if (!draft.correctAnswer.trim() || !options.includes(draft.correctAnswer.trim())) {
      errors.push("Зөв хариулт нь сонголтуудын нэг байх ёстой.");
    }
  }

  if (draft.type === "multiple_response") {
    const options = draft.options.map((item) => item.trim()).filter(Boolean);
    const answers = draft.multipleCorrectAnswers
      .map((item) => item.trim())
      .filter(Boolean);

    if (options.length < 2) {
      errors.push("Олон сонголттой асуултад дор хаяж 2 сонголт хэрэгтэй.");
    }

    if (answers.length < 1) {
      errors.push("Дор хаяж 1 зөв хариулт сонгох хэрэгтэй.");
    }

    if (answers.some((answer) => !options.includes(answer))) {
      errors.push("Зөв хариултууд нь сонголтуудын дотор байх ёстой.");
    }
  }

  if (draft.type === "fill_blank" && !draft.correctAnswer.trim()) {
    errors.push("Нөхөх асуултын зөв хариултыг оруулна уу.");
  }

  if (draft.type === "matching") {
    const pairs = draft.matchingPairs.filter(
      (pair) => pair.left.trim() && pair.right.trim()
    );

    if (pairs.length < 2) {
      errors.push("Холбох асуултад дор хаяж 2 мөр хэрэгтэй.");
    }
  }

  return errors;
}

export function getVisibleDraftWarnings(draft: QuestionImportDraft) {
  return draft.warnings.filter(
    (warning) => !includesAnySnippet(warning, hiddenCorrectAnswerWarningSnippets)
  );
}

export function getVisibleDraftErrors(draft: QuestionImportDraft) {
  const serverErrors = draft.errors.filter(
    (error) => !includesAnySnippet(error, hiddenCorrectAnswerErrorSnippets)
  );
  const liveErrors = getLiveDraftErrors(draft);
  return Array.from(new Set([...serverErrors, ...liveErrors]));
}

export function draftNeedsCorrectAnswerSelection(draft: QuestionImportDraft) {
  if (draft.type === "multiple_choice") {
    const options = draft.options.map((item) => item.trim()).filter(Boolean);
    const answer = draft.correctAnswer.trim();

    return !answer || !options.includes(answer);
  }

  if (draft.type === "multiple_response") {
    const options = draft.options.map((item) => item.trim()).filter(Boolean);
    const answers = draft.multipleCorrectAnswers
      .map((item) => item.trim())
      .filter(Boolean);

    return answers.length === 0 || answers.some((answer) => !options.includes(answer));
  }

  if (draft.type === "fill_blank") {
    return !draft.correctAnswer.trim();
  }

  return false;
}

export function summarizeQuestionDrafts(drafts: QuestionImportDraft[]) {
  const invalid = drafts.filter((draft) => getVisibleDraftErrors(draft).length > 0).length;
  const warning = drafts.filter((draft) => getVisibleDraftWarnings(draft).length > 0).length;
  const missingCorrectAnswer = drafts.filter((draft) =>
    draftNeedsCorrectAnswerSelection(draft)
  ).length;

  return {
    total: drafts.length,
    invalid,
    warning,
    missingCorrectAnswer,
  };
}

interface QuestionDraftReviewListProps {
  drafts: QuestionImportDraft[];
  onDraftsChange: Dispatch<SetStateAction<QuestionImportDraft[]>>;
  selectable?: boolean;
  selectedDraftIds?: string[];
  onSelectedDraftIdsChange?: Dispatch<SetStateAction<string[]>>;
  emptyMessage?: string;
  removeLabel?: string;
  showSourceRow?: boolean;
}

export default function QuestionDraftReviewList({
  drafts,
  onDraftsChange,
  selectable = false,
  selectedDraftIds = [],
  onSelectedDraftIdsChange,
  emptyMessage = "Draft үлдээгүй байна.",
  removeLabel = "Энэ draft-ийг хасах",
  showSourceRow = true,
}: QuestionDraftReviewListProps) {
  function updateDraft(
    draftId: string,
    updater: (draft: QuestionImportDraft) => QuestionImportDraft
  ) {
    onDraftsChange((prev) =>
      prev.map((draft) =>
        draft.draftId === draftId ? { ...updater(draft), errors: [] } : draft
      )
    );
  }

  function toggleSelection(draftId: string, checked: boolean) {
    if (!onSelectedDraftIdsChange) return;

    onSelectedDraftIdsChange((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(draftId);
      } else {
        next.delete(draftId);
      }
      return Array.from(next);
    });
  }

  function removeDraft(draftId: string) {
    onDraftsChange((prev) => prev.filter((draft) => draft.draftId !== draftId));
    if (!onSelectedDraftIdsChange) return;
    onSelectedDraftIdsChange((prev) => prev.filter((id) => id !== draftId));
  }

  function updateOption(draftId: string, optionIndex: number, value: string) {
    updateDraft(draftId, (draft) => {
      const previousValue = draft.options[optionIndex];
      const nextOptions = [...draft.options];
      nextOptions[optionIndex] = value;

      return {
        ...draft,
        options: nextOptions,
        correctAnswer:
          draft.correctAnswer === previousValue ? value : draft.correctAnswer,
        multipleCorrectAnswers: draft.multipleCorrectAnswers.map((answer) =>
          answer === previousValue ? value : answer
        ),
      };
    });
  }

  function addOption(draftId: string) {
    updateDraft(draftId, (draft) => ({
      ...draft,
      options: [...draft.options, ""],
    }));
  }

  function removeOption(draftId: string, optionIndex: number) {
    updateDraft(draftId, (draft) => {
      const removedValue = draft.options[optionIndex];
      const nextOptions = draft.options.filter((_, index) => index !== optionIndex);

      return {
        ...draft,
        options: nextOptions.length >= 2 ? nextOptions : [...nextOptions, ""],
        correctAnswer:
          draft.correctAnswer === removedValue ? "" : draft.correctAnswer,
        multipleCorrectAnswers: draft.multipleCorrectAnswers.filter(
          (answer) => answer !== removedValue
        ),
      };
    });
  }

  function toggleMultipleAnswer(draftId: string, option: string) {
    updateDraft(draftId, (draft) => ({
      ...draft,
      multipleCorrectAnswers: draft.multipleCorrectAnswers.includes(option)
        ? draft.multipleCorrectAnswers.filter((item) => item !== option)
        : [...draft.multipleCorrectAnswers, option],
    }));
  }

  function updateMatchingPair(
    draftId: string,
    pairIndex: number,
    key: keyof QuestionImportMatchingPair,
    value: string
  ) {
    updateDraft(draftId, (draft) => ({
      ...draft,
      matchingPairs: draft.matchingPairs.map((pair, index) =>
        index === pairIndex ? { ...pair, [key]: value } : pair
      ),
    }));
  }

  function addMatchingPair(draftId: string) {
    updateDraft(draftId, (draft) => ({
      ...draft,
      matchingPairs: [...draft.matchingPairs, createEmptyMatchingPair()],
    }));
  }

  function removeMatchingPair(draftId: string, pairIndex: number) {
    updateDraft(draftId, (draft) => {
      const nextPairs = draft.matchingPairs.filter((_, index) => index !== pairIndex);

      return {
        ...draft,
        matchingPairs:
          nextPairs.length >= 2
            ? nextPairs
            : [...nextPairs, createEmptyMatchingPair()],
      };
    });
  }

  function renderDraftFields(draft: QuestionImportDraft) {
    if (draft.type === "multiple_choice" || draft.type === "multiple_response") {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Сонголтууд</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addOption(draft.draftId)}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Сонголт нэмэх
            </Button>
          </div>

          {draft.options.map((option, index) => {
            const isChecked =
              draft.type === "multiple_choice"
                ? draft.correctAnswer === option && option.trim() !== ""
                : draft.multipleCorrectAnswers.includes(option) &&
                  option.trim() !== "";

            return (
              <div key={`${draft.draftId}-option-${index}`} className="flex items-center gap-2">
                <input
                  type={draft.type === "multiple_choice" ? "radio" : "checkbox"}
                  name={`${draft.draftId}-correct-option`}
                  checked={isChecked}
                  onChange={() =>
                    draft.type === "multiple_choice"
                      ? updateDraft(draft.draftId, (currentDraft) => ({
                          ...currentDraft,
                          correctAnswer: option,
                        }))
                      : toggleMultipleAnswer(draft.draftId, option)
                  }
                  className="h-4 w-4 shrink-0"
                  disabled={!option.trim()}
                />
                <Input
                  value={option}
                  onChange={(event) =>
                    updateOption(draft.draftId, index, event.target.value)
                  }
                  placeholder={`Сонголт ${index + 1}`}
                />
                {draft.options.length > 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeOption(draft.draftId, index)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    }

    if (draft.type === "fill_blank") {
      return (
        <div className="space-y-2">
          <Label>Зөв хариулт</Label>
          <Input
            value={draft.correctAnswer}
            onChange={(event) =>
              updateDraft(draft.draftId, (currentDraft) => ({
                ...currentDraft,
                correctAnswer: event.target.value,
              }))
            }
            placeholder="Зөв хариултаа бичнэ үү"
          />
        </div>
      );
    }

    if (draft.type === "matching") {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Холбох мөрүүд</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addMatchingPair(draft.draftId)}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Мөр нэмэх
            </Button>
          </div>

          {draft.matchingPairs.map((pair, index) => (
            <div
              key={`${draft.draftId}-pair-${index}`}
              className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] md:items-center"
            >
              <Input
                value={pair.left}
                onChange={(event) =>
                  updateMatchingPair(draft.draftId, index, "left", event.target.value)
                }
                placeholder={`Зүүн тал ${index + 1}`}
              />
              <span className="text-center text-sm text-muted-foreground">→</span>
              <Input
                value={pair.right}
                onChange={(event) =>
                  updateMatchingPair(draft.draftId, index, "right", event.target.value)
                }
                placeholder={`Баруун тал ${index + 1}`}
              />
              {draft.matchingPairs.length > 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeMatchingPair(draft.draftId, index)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
        Энэ асуулт одоогоор эссэ хэлбэрээр хадгалагдана.
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {drafts.map((draft) => {
        const selected = selectable
          ? selectedDraftIds.includes(draft.draftId)
          : false;

        return (
          <div key={draft.draftId} className="space-y-4 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {selectable ? (
                  <label className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) =>
                        toggleSelection(draft.draftId, event.target.checked)
                      }
                      className="h-4 w-4"
                    />
                    Сонгох
                  </label>
                ) : null}
                {showSourceRow ? <Badge variant="outline">#{draft.sourceRow}</Badge> : null}
                <Badge
                  variant={
                    getVisibleDraftErrors(draft).length > 0 ? "destructive" : "secondary"
                  }
                >
                  {questionTypes.find((item) => item.value === draft.type)?.label}
                </Badge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeDraft(draft.draftId)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {removeLabel}
              </Button>
            </div>

            {getVisibleDraftWarnings(draft).length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">Анхаарах зүйл</p>
                <ul className="mt-2 list-disc pl-5">
                  {getVisibleDraftWarnings(draft).map((warning) => (
                    <li key={`${draft.draftId}-${warning}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {getVisibleDraftErrors(draft).length > 0 ? (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <p className="font-medium">Засах шаардлагатай</p>
                <ul className="mt-2 list-disc pl-5">
                  {getVisibleDraftErrors(draft).map((item) => (
                    <li key={`${draft.draftId}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-2">
                <Label>Асуулт</Label>
                <Textarea
                  value={draft.content}
                  onChange={(event) =>
                    updateDraft(draft.draftId, (currentDraft) => ({
                      ...currentDraft,
                      content: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Асуултын агуулга"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px] lg:items-end">
                <div className="space-y-2">
                  <Label>Асуултын төрөл</Label>
                  <Select
                    value={draft.type}
                    onValueChange={(value) =>
                      updateDraft(draft.draftId, (currentDraft) =>
                        resetDraftForType(currentDraft, value as QuestionType)
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
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
                  <Label>Оноо</Label>
                  <Input
                    className="text-center tabular-nums"
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={draft.points}
                    onChange={(event) =>
                      updateDraft(draft.draftId, (currentDraft) => ({
                        ...currentDraft,
                        points: Number(event.target.value) || 1,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {renderDraftFields(draft)}

            {selectable && !selected ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Энэ draft private bank-д хадгалах сонголтоос түр хасагдсан байна.
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
