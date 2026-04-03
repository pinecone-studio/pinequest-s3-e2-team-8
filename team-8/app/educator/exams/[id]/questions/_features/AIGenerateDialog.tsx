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
  const hasSampleContext = sampleContext.trim().length > 0;

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
          className="h-10 w-full justify-between rounded-[10px] border-[#D7DEF3] bg-[#F7F9FF] px-4 text-[12px] font-medium text-[#2F4C98] shadow-none transition hover:bg-[#EEF3FF] sm:w-[160px]"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          AI асуулт үүсгэх
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden rounded-[30px] border border-[#D9E1EC] bg-[#FCFDFE] p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.32)] sm:max-w-[640px]">
        <DialogHeader>
          <div className="border-b border-[#E7EDF5] bg-white px-6 py-5 sm:px-7">
            <DialogTitle className="flex items-center gap-2 text-[18px] font-semibold text-[#111827]">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EEF3FF] text-[#2F4C98]">
                <Sparkles className="h-5 w-5" />
              </span>
              AI-аар асуулт үүсгэх
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-6 text-[#5B6476]">
              Жишиг шалгалтын агуулга, сонгосон хичээл, ангийн түвшинд тулгуурлан
              шинэ асуултууд боловсруулна.
            </DialogDescription>
            <div
              className={`mt-4 rounded-[22px] border px-4 py-3 text-sm ${
                hasSampleContext
                  ? "border-[#D7DEF3] bg-[#F4F7FF] text-[#2F4C98]"
                  : "border-[#E5E7EB] bg-[#F8FAFC] text-[#475467]"
              }`}
            >
              {hasSampleContext
                ? "Жишиг шалгалтын мэдээлэл олдлоо. AI ижил хэв маяг, түвшинд тулгуурлаж шинэ асуулт үүсгэнэ."
                : "Жишиг шалгалтын мэдээлэл олдсонгүй. AI зөвхөн хичээл, дэд сэдэв, сонгосон төрлүүдэд тулгуурлаж асуулт үүсгэнэ."}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5 sm:px-7 sm:py-6">
          {error ? (
            <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2.5">
              <Label className="text-[13px] font-semibold text-[#374151]">
                Хичээл
              </Label>
              <Input
                value={subjectName || "Тодорхойгүй"}
                disabled
                className="h-10 rounded-full border-[#E3E8EF] bg-[#F8FAFC] px-4 text-[12px] text-[#111827] shadow-none disabled:opacity-100"
              />
            </div>

            <div className="space-y-2.5">
              <Label
                htmlFor="ai-grade-level"
                className="text-[13px] font-semibold text-[#374151]"
              >
                Анги
              </Label>
              <Select value={gradeLevel} onValueChange={setGradeLevel}>
                <SelectTrigger
                  id="ai-grade-level"
                  className="h-10 rounded-full border-[#E3E8EF] bg-[#F8FAFC] px-4 text-[12px] text-[#111827] shadow-none focus-visible:ring-[#D5E3F7]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-zinc-200 bg-white">
                  {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {g}-р анги
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2.5">
            <Label
              htmlFor="ai-subtopic"
              className="text-[13px] font-semibold text-[#374151]"
            >
              Дэд сэдэв
            </Label>
            <Input
              id="ai-subtopic"
              value={subtopic}
              onChange={(e) => setSubtopic(e.target.value)}
              placeholder="Жишээ: Геометр, Тригонометр, Үсэгт илэрхийлэл..."
              className="h-10 rounded-full border-[#E3E8EF] bg-[#F8FAFC] px-4 text-[12px] text-[#111827] shadow-none focus-visible:ring-[#D5E3F7]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2.5">
              <Label className="text-[13px] font-semibold text-[#374151]">
                Түвшин
              </Label>
              <Select
                value={difficultyLevel}
                onValueChange={setDifficultyLevel}
              >
                <SelectTrigger className="h-10 rounded-full border-[#E3E8EF] bg-[#F8FAFC] px-4 text-[12px] text-[#111827] shadow-none focus-visible:ring-[#D5E3F7]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-zinc-200 bg-white">
                  <SelectItem value="1">Хөнгөн</SelectItem>
                  <SelectItem value="2">Дунд</SelectItem>
                  <SelectItem value="3">Хүнд</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2.5">
              <Label
                htmlFor="ai-count"
                className="text-[13px] font-semibold text-[#374151]"
              >
                Асуултын тоо
              </Label>
              <Input
                id="ai-count"
                type="number"
                min={1}
                max={20}
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
                className="h-10 rounded-full border-[#E3E8EF] bg-[#F8FAFC] px-4 text-[12px] text-[#111827] shadow-none focus-visible:ring-[#D5E3F7]"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-[13px] font-semibold text-[#374151]">
              Асуултын төрлүүд
            </Label>
            <div className="flex flex-wrap gap-2">
              {QUESTION_TYPE_OPTIONS.map((opt) => {
                const selected = selectedTypes.includes(opt.value);

                return (
                  <Badge
                    key={opt.value}
                    variant="outline"
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      selected
                        ? "border-[#D7DEF3] bg-[#EEF3FF] text-[#2F4C98]"
                        : "border-[#E5E7EB] bg-white text-[#475467] hover:border-[#D7DEF3] hover:bg-[#F8FAFF]"
                    }`}
                    onClick={() => toggleType(opt.value)}
                  >
                    {opt.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-[#E7EDF5] bg-white px-6 py-4 sm:px-7">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="h-10 rounded-full border-[#E5E7EB] px-5 text-[12px] font-medium text-[#475467] shadow-none hover:bg-[#F8FAFC]"
          >
            Болих
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isPending || selectedTypes.length === 0}
            className="h-10 rounded-full bg-[#2F4C98] px-5 text-[12px] font-medium text-white hover:bg-[#263F80]"
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
