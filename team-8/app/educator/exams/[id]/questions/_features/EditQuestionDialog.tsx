"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateQuestion } from "@/lib/question/actions";
import type { Question, QuestionPassage, QuestionType } from "@/types";
import MathContent from "@/components/math/MathContent";
import LatexShortcutPanel from "@/components/math/LatexShortcutPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Сонгох" },
  { value: "multiple_response", label: "Олон сонголттой" },
  { value: "fill_blank", label: "Нөхөх" },
  { value: "essay", label: "Задгай / Эссэ" },
  { value: "matching", label: "Холбох" },
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
  const [type, setType] = useState<QuestionType>(question.type);
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedPassage =
    selectedPassageId === "__none"
      ? null
      : passages.find((passage) => passage.id === selectedPassageId) ?? null;

  function resetState(nextType: QuestionType = question.type) {
    setType(nextType);
    setSelectedPassageId(getInitialPassageId(question));
    setOptions(getChoiceOptions(question));
    setCorrectAnswer(question.correct_answer ?? "");
    setMultipleCorrectAnswers(getMultipleCorrectAnswers(question));
    setMatchingPairs(getMatchingPairs(question));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      resetState();
    } else {
      setError(null);
      setSaving(false);
    }

    setOpen(nextOpen);
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
        setError("Нөхөх асуултын зөв хариултыг оруулна уу.");
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
        setError("Холбох асуултад дор хаяж 2 мөр хэрэгтэй.");
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
        <Button type="button" variant="outline" size="sm">
          Засах
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Асуулт засах</DialogTitle>
          <DialogDescription>
            Draft шалгалтын асуултын төрөл, passage холбоос, контент, зураг,
            зөв хариултыг шинэчилнэ.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" action={handleSubmit}>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Асуултын төрөл</Label>
              <Select value={type} onValueChange={(value) => handleTypeChange(value as QuestionType)}>
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
              <Label>Shared passage block</Label>
              <Select value={selectedPassageId} onValueChange={setSelectedPassageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Passage сонгохгүй" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Холбохгүй</SelectItem>
                  {passages.map((passage, index) => (
                    <SelectItem key={passage.id} value={passage.id}>
                      {passage.title || `Block ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedPassage && (
            <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Сонгосон passage
              </p>
              {selectedPassage.title && (
                <p className="font-medium">{selectedPassage.title}</p>
              )}
              <MathContent
                html={selectedPassage.content_html}
                text={selectedPassage.content}
                className="prose prose-sm max-w-none text-foreground"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <Label htmlFor={`image-url-${question.id}`}>Зургийн URL</Label>
              <Input
                id={`image-url-${question.id}`}
                name="image_url"
                type="url"
                defaultValue={question.image_url ?? ""}
                placeholder="https://example.com/question-image.png"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`content-${question.id}`}>Агуулга</Label>
            <LatexShortcutPanel
              targetId={`content-${question.id}`}
              title="Formula Tool"
              description="Асуултын текст дотор томьёо, язгуур, хими, физикийн тэмдэгтээ шууд оруулна."
            />
            <Textarea
              id={`content-${question.id}`}
              name="content"
              rows={3}
              defaultValue={question.content}
              placeholder="Асуултын үндсэн текст..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`content-html-${question.id}`}>
              Форматтай контент (HTML)
            </Label>
            <Textarea
              id={`content-html-${question.id}`}
              name="content_html"
              rows={4}
              defaultValue={question.content_html ?? ""}
              placeholder="<p>Formula, текстийн онцгой формат, HTML...</p>"
            />
            <LatexShortcutPanel
              targetId={`content-html-${question.id}`}
              title="LaTeX Helper"
              description="HTML контент дотор формул эсвэл тусгай тэмдэгтээ нэмж болно."
            />
          </div>

          {(type === "multiple_choice" || type === "multiple_response") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Сонголтууд</Label>
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
                  <div key={`${question.id}-option-${index}`} className="flex items-center gap-2">
                    <input
                      type={type === "multiple_choice" ? "radio" : "checkbox"}
                      name={`correct-choice-${question.id}-${index}`}
                      checked={isChecked}
                      onChange={() =>
                        type === "multiple_choice"
                          ? setCorrectAnswer(option)
                          : toggleMultipleAnswer(option)
                      }
                      className="h-4 w-4 shrink-0"
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
            <div className="space-y-2">
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Холбох мөрүүд</Label>
                <Button type="button" variant="outline" size="sm" onClick={addMatchingPair}>
                  Мөр нэмэх
                </Button>
              </div>

              {matchingPairs.map((pair, index) => (
                <div
                  key={`${question.id}-pair-${index}`}
                  className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] md:items-center"
                >
                  <Input
                    value={pair.left}
                    onChange={(event) =>
                      updateMatchingPair(index, "left", event.target.value)
                    }
                    placeholder={`Зүүн тал ${index + 1}`}
                  />
                  <span className="text-center text-sm text-muted-foreground">→</span>
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
            <p className="text-sm text-muted-foreground">
              Задгай асуултыг багш grading дээр гараар үнэлнэ.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor={`explanation-${question.id}`}>Тайлбар</Label>
            <Textarea
              id={`explanation-${question.id}`}
              name="explanation"
              rows={3}
              defaultValue={question.explanation ?? ""}
              placeholder="Зөв хариултын тайлбар, тэмдэглэл..."
            />
          </div>

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
