"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateQuestionsWithAI,
  type AIGenerateQuestionsInput,
} from "@/lib/ai/actions";
import type { QuestionType } from "@/types";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";

interface AIGenerateDialogProps {
  examId: string;
  subjectName: string;
  sampleContext: string;
}

const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Сонгох" },
  { value: "multiple_response", label: "Олон зөв" },
  { value: "fill_blank", label: "Нөхөх" },
  { value: "essay", label: "Задгай / Эссэ" },
  { value: "matching", label: "Холбох" },
];

export default function AIGenerateDialog({
  examId,
  subjectName,
  sampleContext,
}: AIGenerateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [gradeLevel, setGradeLevel] = useState("10");
  const [subtopic, setSubtopic] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("2");
  const [questionCount, setQuestionCount] = useState("5");
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>([
    "multiple_choice",
  ]);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function toggleType(type: QuestionType) {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  }

  function handleGenerate() {
    if (selectedTypes.length === 0) {
      setError("Дор хаяж 1 асуултын төрөл сонгоно уу.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    const input: AIGenerateQuestionsInput = {
      examId,
      subjectName,
      gradeLevel: parseInt(gradeLevel) || 10,
      subtopic,
      difficultyLevel: parseInt(difficultyLevel) || 2,
      questionCount: Math.min(Math.max(parseInt(questionCount) || 5, 1), 20),
      questionTypes: selectedTypes,
      sampleContext,
    };

    startTransition(async () => {
      const result = await generateQuestionsWithAI(input);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccessMessage(`${result.count} асуулт амжилттай үүсгэгдлээ!`);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setSuccessMessage(null);
      }, 1500);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-purple-300 text-purple-700 hover:bg-purple-50"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          AI асуулт үүсгэх
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI-аар асуулт үүсгэх
          </DialogTitle>
          <DialogDescription>
            Жишиг шалгалтын агуулга дээр суурилан Gemini AI шинэ асуултууд
            боловсруулна.
            {sampleContext && (
              <span className="mt-1 block text-purple-600">
                Жишиг шалгалтын мэдээлэл олдлоо — AI түүнд суурилна.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Хичээл</Label>
              <Input value={subjectName || "Тодорхойгүй"} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-grade-level">Анги</Label>
              <Select value={gradeLevel} onValueChange={setGradeLevel}>
                <SelectTrigger id="ai-grade-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {g}-р анги
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-subtopic">Дэд сэдэв (заавал биш)</Label>
            <Input
              id="ai-subtopic"
              value={subtopic}
              onChange={(e) => setSubtopic(e.target.value)}
              placeholder="Жишээ: Геометр, Тригонометр, Үсэгт илэрхийлэл..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Түвшин</Label>
              <Select
                value={difficultyLevel}
                onValueChange={setDifficultyLevel}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Хөнгөн</SelectItem>
                  <SelectItem value="2">Дунд</SelectItem>
                  <SelectItem value="3">Хүнд</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-count">Асуултын тоо</Label>
              <Input
                id="ai-count"
                type="number"
                min={1}
                max={20}
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Асуултын төрлүүд</Label>
            <div className="flex flex-wrap gap-2">
              {QUESTION_TYPE_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant={
                    selectedTypes.includes(opt.value)
                      ? "default"
                      : "outline"
                  }
                  className={`cursor-pointer select-none ${
                    selectedTypes.includes(opt.value)
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "hover:bg-purple-50"
                  }`}
                  onClick={() => toggleType(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Болих
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isPending || selectedTypes.length === 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI үүсгэж байна...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Асуулт үүсгэх
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
