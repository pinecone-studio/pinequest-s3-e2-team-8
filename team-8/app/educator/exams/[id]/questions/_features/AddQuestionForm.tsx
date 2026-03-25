"use client";

import { useState } from "react";
import { addQuestion } from "@/lib/question/actions";
import type { QuestionPassage } from "@/types";
import MathContent from "@/components/math/MathContent";
import LatexShortcutPanel from "@/components/math/LatexShortcutPanel";
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

interface Props {
  examId: string;
  passages: QuestionPassage[];
}

const questionTypes = [
  { value: "multiple_choice", label: "Сонголтот (MC)" },
  { value: "true_false", label: "Үнэн/Худал" },
  { value: "essay", label: "Нээлттэй хариулт" },
  { value: "fill_blank", label: "Нөхөх" },
];

const difficultyOptions = [
  { value: "easy", label: "Хялбар" },
  { value: "medium", label: "Дунд" },
  { value: "hard", label: "Хэцүү" },
];

export default function AddQuestionForm({ examId, passages }: Props) {
  const [type, setType] = useState("multiple_choice");
  const [difficulty, setDifficulty] = useState("medium");
  const [selectedPassageId, setSelectedPassageId] = useState("__none");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedPassage =
    selectedPassageId === "__none"
      ? null
      : passages.find((passage) => passage.id === selectedPassageId) ?? null;

  function addOption() {
    setOptions([...options, ""]);
  }

  function removeOption(index: number) {
    setOptions(options.filter((_, i) => i !== index));
  }

  function updateOption(index: number, value: string) {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    if (type === "multiple_choice") {
      const validOptions = options.filter((o) => o.trim() !== "");
      if (validOptions.length < 2) {
        setError("Дор хаяж 2 сонголт оруулна уу");
        setLoading(false);
        return;
      }
      formData.set("options", JSON.stringify(validOptions));
      formData.set("correct_answer", correctAnswer);
    } else if (type === "true_false") {
      formData.set("correct_answer", correctAnswer || "Үнэн");
    } else if (type === "fill_blank") {
      if (!correctAnswer.trim()) {
        setError("Нөхөх асуултын зөв хариултыг оруулна уу");
        setLoading(false);
        return;
      }
      formData.set("correct_answer", correctAnswer.trim());
    }

    const result = await addQuestion(examId, formData);
    if (result?.error) {
      setError(result.error);
    } else {
      // Reset form
      setOptions(["", "", "", ""]);
      setCorrectAnswer("");
      setDifficulty("medium");
      setSelectedPassageId("__none");
      const form = document.getElementById("question-form") as HTMLFormElement;
      form?.reset();
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Асуулт нэмэх</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="question-form" action={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Асуултын төрөл</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v);
                  setCorrectAnswer("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {questionTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="type" value={type} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="points">Оноо</Label>
              <Input id="points" name="points" type="number" min="0.5" step="0.5" defaultValue="1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Хүндрэлийн түвшин</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {difficultyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="difficulty" value={difficulty} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tag-ууд</Label>
              <Input
                id="tags"
                name="tags"
                placeholder="algebra, grade-10, chapter-2"
              />
            </div>
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
            <input
              type="hidden"
              name="passage_id"
              value={selectedPassageId === "__none" ? "" : selectedPassageId}
            />
            <p className="text-xs text-muted-foreground">
              Унших эх, зураг, formula context-ийг олон асуулттай холбоход ашиглана.
            </p>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Асуулт *</Label>
            <Textarea id="content" name="content" placeholder="Асуултаа энд бичнэ үү..." rows={3} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content_html">Форматтай контент (HTML, заавал биш)</Label>
            <Textarea
              id="content_html"
              name="content_html"
              placeholder="<p>LaTeX, тайлбар, унших эхийн форматтай хувилбар...</p>"
              rows={4}
            />
            <LatexShortcutPanel targetId="content_html" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="image_url">Зургийн URL (заавал биш)</Label>
            <Input
              id="image_url"
              name="image_url"
              type="url"
              placeholder="https://example.com/question-image.png"
            />
          </div>

          {/* Multiple choice options */}
          {type === "multiple_choice" && (
            <div className="space-y-3">
              <Label>Сонголтууд</Label>
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct_radio"
                    checked={correctAnswer === opt && opt !== ""}
                    onChange={() => setCorrectAnswer(opt)}
                    className="h-4 w-4 shrink-0"
                    disabled={!opt}
                  />
                  <Input
                    value={opt}
                    onChange={(e) => {
                      updateOption(idx, e.target.value);
                      if (correctAnswer === options[idx]) setCorrectAnswer(e.target.value);
                    }}
                    placeholder={`${idx + 1}-р сонголт`}
                  />
                  {options.length > 2 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(idx)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Сонголт нэмэх
              </Button>
              {!correctAnswer && (
                <p className="text-xs text-muted-foreground">Зөв хариултыг сонгохын тулд радио товчийг дарна уу</p>
              )}
            </div>
          )}

          {/* True/False */}
          {type === "true_false" && (
            <div className="space-y-2">
              <Label>Зөв хариулт</Label>
              <Select value={correctAnswer || "Үнэн"} onValueChange={setCorrectAnswer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Үнэн">Үнэн</SelectItem>
                  <SelectItem value="Худал">Худал</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Essay — no correct answer */}
          {type === "essay" && (
            <p className="text-sm text-muted-foreground">
              Нээлттэй хариултыг багш гараар үнэлнэ.
            </p>
          )}

          {type === "fill_blank" && (
            <div className="space-y-2">
              <Label htmlFor="fill_blank_answer">Зөв хариулт *</Label>
              <Input
                id="fill_blank_answer"
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                placeholder="Жишээ: 3x + 2"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="explanation">Тайлбар (заавал биш)</Label>
            <Input id="explanation" name="explanation" placeholder="Зөв хариултын тайлбар..." />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Нэмж байна..." : "Асуулт нэмэх"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
