"use client";

import { useState } from "react";
import { addQuestion } from "@/lib/question/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  function addOption() {
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(index: number) {
    const removedValue = options[index];
    const nextOptions = options.filter((_, i) => i !== index);

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
      return next.length >= 2
        ? next
        : [...next, createEmptyMatchingPair()];
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

          <div className="space-y-2">
            <Label>Асуултын төрөл</Label>
            <Select value={type} onValueChange={(value) => resetTypeState(value as QuestionType)}>
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
            <p className="text-sm text-muted-foreground">
              {questionTypes.find((item) => item.value === type)?.hint}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Асуулт</Label>
            <Textarea
              id="content"
              name="content"
              placeholder="Асуултаа энд бичнэ үү..."
              rows={4}
              required
            />
          </div>

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
                      name={type === "multiple_choice" ? "correct_option" : `correct_option_${index}`}
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
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
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
                      size="icon"
                      onClick={() => removeMatchingPair(index)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addMatchingPair}>
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
