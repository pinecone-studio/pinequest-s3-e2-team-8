"use client";

import { useState, type ClipboardEvent } from "react";
import { addQuestion } from "@/lib/question/actions";
import { parsePastedQuestionText } from "@/lib/question/paste";
import MathContent from "@/components/math/MathContent";
import LatexShortcutPanel from "@/components/math/LatexShortcutPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PlusCircle, Trash2 } from "lucide-react";
import type { QuestionPassage, QuestionType } from "@/types";

interface Props {
  examId: string;
  passages: QuestionPassage[];
}

interface MatchingPair {
  left: string;
  right: string;
}

const questionTypes: { value: QuestionType; label: string; hint: string }[] = [
  {
    value: "multiple_choice",
    label: "Сонгох",
    hint: "Нэг зөв хариулттай тест",
  },
  {
    value: "multiple_response",
    label: "Олон сонголттой",
    hint: "Хэд хэдэн зөв хариулттай тест",
  },
  {
    value: "fill_blank",
    label: "Нөхөх",
    hint: "Хоосон зайг бөглөх",
  },
  {
    value: "essay",
    label: "Задгай асуулт / Эссэ",
    hint: "Багш гараар шалгана",
  },
  {
    value: "matching",
    label: "Холбох",
    hint: "2 баганын харгалзуулах асуулт",
  },
];

function createEmptyMatchingPair(): MatchingPair {
  return { left: "", right: "" };
}

export default function AddQuestionForm({ examId }: Props) {
  const [type, setType] = useState<QuestionType>("multiple_choice");
  const [isFormulaToolOpen, setIsFormulaToolOpen] = useState(false);
  const [activeFormulaTarget, setActiveFormulaTarget] = useState({
    id: "content",
    label: "Асуулт",
  });
  const [content, setContent] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [multipleCorrectAnswers, setMultipleCorrectAnswers] = useState<string[]>([]);
  const [matchingPairs, setMatchingPairs] = useState<MatchingPair[]>([
    createEmptyMatchingPair(),
    createEmptyMatchingPair(),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function resetTypeState(nextType: QuestionType) {
    setType(nextType);
    setOptions(["", ""]);
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
      setOptions(parsed.options.length >= 2 ? parsed.options : ["", ""]);
      setCorrectAnswer(parsed.correctAnswer);
      setMultipleCorrectAnswers([]);
      setMatchingPairs([createEmptyMatchingPair(), createEmptyMatchingPair()]);
      return true;
    }

    if (parsed.type === "multiple_response") {
      setOptions(parsed.options.length >= 2 ? parsed.options : ["", ""]);
      setCorrectAnswer("");
      setMultipleCorrectAnswers(parsed.multipleCorrectAnswers);
      setMatchingPairs([createEmptyMatchingPair(), createEmptyMatchingPair()]);
      return true;
    }

    if (parsed.type === "fill_blank") {
      setOptions(["", ""]);
      setCorrectAnswer(parsed.correctAnswer);
      setMultipleCorrectAnswers([]);
      setMatchingPairs([createEmptyMatchingPair(), createEmptyMatchingPair()]);
      return true;
    }

    setOptions(["", ""]);
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

    setOptions(nextOptions);

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
    formData.set("points", "1");
    formData.set("difficulty", "medium");
    formData.set("tags", "");
    formData.set("content_html", "");
    formData.set("image_url", "");
    formData.set("explanation", "");
    formData.set("passage_id", "");

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

    const form = document.getElementById("question-form") as HTMLFormElement | null;
    form?.reset();
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Асуулт нэмэх</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="question-form" action={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto] items-start gap-2">
            <Label>Асуултын төрөл</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              aria-controls="question-formula-tool"
              aria-expanded={isFormulaToolOpen}
              onClick={() => setIsFormulaToolOpen((prev) => !prev)}
            >
              Томьёоны самбар
              <span className="ml-2 text-xs text-muted-foreground">
                {isFormulaToolOpen ? "Хаах" : "Нээх"}
              </span>
            </Button>

            <div className="col-span-2">
              <Select
                value={type}
                onValueChange={(value) => resetTypeState(value as QuestionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {questionTypes.map((questionType) => (
                    <SelectItem key={questionType.value} value={questionType.value}>
                      {questionType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="col-span-2 text-sm text-muted-foreground">
              {questionTypes.find((item) => item.value === type)?.hint}
            </p>
          </div>

          {isFormulaToolOpen && (
            <div id="question-formula-tool">
              <LatexShortcutPanel
                targetId={activeFormulaTarget.id}
                targetLabel={activeFormulaTarget.label}
                title="Томьёоны самбар"
                description="Cursor-оо байрлуулсан талбартаа томьёо, тэмдэгтээ шууд оруулна."
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="content">Асуулт</Label>
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
              placeholder="Асуултаа энд бичнэ үү..."
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              Word, Docs эсвэл өөр газраас асуулт, сонголт, зөв хариулттай
              текстээ paste хийвэл автоматаар таньж бөглөнө.
            </p>
          </div>

          {content.trim() && (
            <div className="space-y-2 rounded-xl border bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Урьдчилан харах</p>
                <p className="text-xs text-muted-foreground">
                  Томьёо хэрхэн render болохыг эндээс шууд шалгана.
                </p>
              </div>
              <MathContent
                text={content}
                className="prose max-w-none text-sm leading-6 text-foreground"
              />
            </div>
          )}

          {(type === "multiple_choice" || type === "multiple_response") && (
            <div className="space-y-3">
              <Label>Хариултууд</Label>
              {options.map((option, index) => {
                const isChecked =
                  type === "multiple_choice"
                    ? correctAnswer === option && option.trim() !== ""
                    : multipleCorrectAnswers.includes(option) && option.trim() !== "";

                return (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type={type === "multiple_choice" ? "radio" : "checkbox"}
                      name={
                        type === "multiple_choice"
                          ? "correct_option"
                          : `correct_option_${index}`
                      }
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
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOption(index)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Хариулт нэмэх
              </Button>
            </div>
          )}

          {type === "fill_blank" && (
            <div className="space-y-2">
              <Label htmlFor="fill_blank_answer">Зөв хариулт</Label>
              <Input
                id="fill_blank_answer"
                value={correctAnswer}
                onChange={(event) => setCorrectAnswer(event.target.value)}
                onFocus={() =>
                  setActiveFormulaTarget({
                    id: "fill_blank_answer",
                    label: "Нөхөх зөв хариулт",
                  })
                }
                placeholder="Зөв хариултаа бичнэ үү"
              />
            </div>
          )}

          {type === "essay" && (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              Энэ төрлийн асуултыг багш дараа нь гараар шалгана.
            </div>
          )}

          {type === "matching" && (
            <div className="space-y-3">
              <Label>Холбох мөрүүд</Label>
              {matchingPairs.map((pair, index) => (
                <div
                  key={index}
                  className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] md:items-center"
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
                  />
                  <span className="text-center text-sm text-muted-foreground">→</span>
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
                  />
                  {matchingPairs.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMatchingPair(index)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMatchingPair}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Мөр нэмэх
              </Button>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Нэмж байна..." : "Асуулт нэмэх"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
