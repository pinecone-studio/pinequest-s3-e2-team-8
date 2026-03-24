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

interface Props {
  examId: string;
}

const questionTypes = [
  { value: "multiple_choice", label: "Сонголтот (MC)" },
  { value: "true_false", label: "Үнэн/Худал" },
  { value: "essay", label: "Нээлттэй хариулт" },
];

export default function AddQuestionForm({ examId }: Props) {
  const [type, setType] = useState("multiple_choice");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    }

    const result = await addQuestion(examId, formData);
    if (result?.error) {
      setError(result.error);
    } else {
      // Reset form
      setOptions(["", "", "", ""]);
      setCorrectAnswer("");
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

          <div className="space-y-2">
            <Label htmlFor="content">Асуулт *</Label>
            <Textarea id="content" name="content" placeholder="Асуултаа энд бичнэ үү..." rows={3} required />
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
