"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteQuestionBankItem,
  updateQuestionBankItem,
} from "@/lib/question/actions";
import type { QuestionBank, Subject } from "@/types";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

const questionTypes = [
  { value: "multiple_choice", label: "Сонголтот" },
  { value: "true_false", label: "Үнэн/Худал" },
  { value: "essay", label: "Нээлттэй" },
  { value: "fill_blank", label: "Цоорхой" },
];

const difficultyOptions = [
  { value: "easy", label: "Хялбар" },
  { value: "medium", label: "Дунд" },
  { value: "hard", label: "Хэцүү" },
];

interface EditQuestionBankDialogProps {
  question: QuestionBank;
  subjects: Subject[];
}

function getDefaultOptions(question: QuestionBank) {
  if (question.type === "multiple_choice") {
    const existingOptions = Array.isArray(question.options)
      ? question.options.map((option) => option.trim()).filter(Boolean)
      : [];

    return existingOptions.length > 0
      ? existingOptions
      : ["", "", "", ""];
  }

  return ["", "", "", ""];
}

export default function EditQuestionBankDialog({
  question,
  subjects,
}: EditQuestionBankDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(question.type);
  const [subjectId, setSubjectId] = useState(question.subject_id ?? "__none");
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [options, setOptions] = useState<string[]>(() => getDefaultOptions(question));
  const [correctAnswer, setCorrectAnswer] = useState(question.correct_answer ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tagValue = useMemo(
    () => (Array.isArray(question.tags) ? question.tags.join(", ") : ""),
    [question.tags]
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setType(question.type);
      setSubjectId(question.subject_id ?? "__none");
      setDifficulty(question.difficulty);
      setOptions(getDefaultOptions(question));
      setCorrectAnswer(question.correct_answer ?? "");
    } else {
      setError(null);
      setSaving(false);
      setDeleting(false);
    }

    setOpen(nextOpen);
  }

  function updateOption(index: number, value: string) {
    setOptions((prev) => {
      const next = [...prev];
      const previousValue = next[index];
      next[index] = value;

      if (correctAnswer === previousValue) {
        setCorrectAnswer(value);
      }

      return next;
    });
  }

  function addOption() {
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(index: number) {
    setOptions((prev) => {
      const next = prev.filter((_, optionIndex) => optionIndex !== index);
      const removedValue = prev[index];

      if (correctAnswer === removedValue) {
        setCorrectAnswer("");
      }

      if (next.length >= 2) {
        return next;
      }

      return [...next, ...Array.from({ length: 2 - next.length }, () => "")];
    });
  }

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setError(null);

    formData.set("type", type);
    formData.set("difficulty", difficulty);
    formData.set("subject_id", subjectId === "__none" ? "" : subjectId);

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
    } else if (type === "true_false") {
      formData.set("correct_answer", correctAnswer || "Үнэн");
    } else if (type === "fill_blank") {
      if (!correctAnswer.trim()) {
        setError("Нөхөх асуултын зөв хариултыг оруулна уу.");
        setSaving(false);
        return;
      }

      formData.set("correct_answer", correctAnswer.trim());
    } else {
      formData.set("correct_answer", "");
      formData.set("options", "[]");
    }

    const result = await updateQuestionBankItem(question.id, formData);
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const result = await deleteQuestionBankItem(question.id);
    if (result?.error) {
      setError(result.error);
      setDeleting(false);
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
          <DialogTitle>Асуултын сангийн бичлэг засах</DialogTitle>
          <DialogDescription>
            Content, subject, difficulty, image, tags болон зөв хариултыг шинэчилнэ.
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
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as QuestionBank["type"]);
                  if (value === "true_false") {
                    setCorrectAnswer("Үнэн");
                  } else if (value !== "multiple_choice") {
                    setOptions(["", "", "", ""]);
                    if (value === "essay") {
                      setCorrectAnswer("");
                    }
                  }
                }}
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
              <Label>Хичээл</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Хичээл сонгох" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Сонгоогүй</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Оноо</Label>
              <Input
                name="points"
                type="number"
                min="0.5"
                step="0.5"
                defaultValue={question.points}
              />
            </div>
            <div className="space-y-2">
              <Label>Хүндрэлийн түвшин</Label>
              <Select
                value={difficulty}
                onValueChange={(value) =>
                  setDifficulty(value as QuestionBank["difficulty"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {difficultyOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`tags-${question.id}`}>Tag-ууд</Label>
              <Input
                id={`tags-${question.id}`}
                name="tags"
                defaultValue={tagValue}
                placeholder="algebra, formula, grade-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`content-${question.id}`}>Агуулга</Label>
            <Textarea
              id={`content-${question.id}`}
              name="content"
              rows={3}
              defaultValue={question.content}
              placeholder="Асуултын үндсэн текст..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`content-html-${question.id}`}>Форматтай контент (HTML)</Label>
            <Textarea
              id={`content-html-${question.id}`}
              name="content_html"
              rows={4}
              defaultValue={question.content_html ?? ""}
              placeholder="<p>Formula, унших эх, онцгой формат...</p>"
            />
            <LatexShortcutPanel targetId={`content-html-${question.id}`} />
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

          {type === "multiple_choice" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Сонголтууд</Label>
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  Сонголт нэмэх
                </Button>
              </div>

              {options.map((option, index) => (
                <div key={`${question.id}-option-${index}`} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-choice-${question.id}`}
                    checked={correctAnswer === option && option.trim() !== ""}
                    onChange={() => setCorrectAnswer(option)}
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
              ))}
            </div>
          )}

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

          {type === "fill_blank" && (
            <div className="space-y-2">
              <Label htmlFor={`fill-blank-${question.id}`}>Зөв хариулт</Label>
              <Input
                id={`fill-blank-${question.id}`}
                value={correctAnswer}
                onChange={(event) => setCorrectAnswer(event.target.value)}
                placeholder="Жишээ: H2SO4"
              />
            </div>
          )}

          {type === "essay" && (
            <p className="text-sm text-muted-foreground">
              Нээлттэй асуултанд зөв хариулт шаардахгүй.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor={`explanation-${question.id}`}>Тайлбар</Label>
            <Textarea
              id={`explanation-${question.id}`}
              name="explanation"
              rows={3}
              defaultValue={question.explanation ?? ""}
              placeholder="Зөв хариултын тайлбар, санамж..."
            />
          </div>

          <DialogFooter className="gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto text-destructive"
                >
                  Устгах
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Энэ бичлэгийг устгах уу?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Асуултын сангаас бүр мөсөн устгана. Шалгалтад өмнө импортолсон
                    хувилбарууд устахгүй.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Болих</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Устгаж байна..." : "Устгах"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

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
