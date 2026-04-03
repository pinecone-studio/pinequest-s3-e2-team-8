"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { generatePrivateBankQuestionDraftsWithAI } from "@/lib/ai/actions";
import { saveGeneratedPrivateBankQuestions } from "@/lib/question/actions";
import { AiLoading } from "@/app/educator/_components/loading";
import QuestionDraftReviewList, {
  summarizeQuestionDrafts,
} from "@/app/educator/_components/QuestionDraftReviewList";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionImportDraft, QuestionType, Subject } from "@/types";

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const QUESTION_COUNTS = [5, 10, 15, 20, 25] as const;

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "multiple_choice", label: "Олон сонголттой" },
  { value: "multiple_response", label: "Олон зөв хариулттай" },
  { value: "essay", label: "Эсээ" },
  { value: "fill_blank", label: "Хоосон зай нөхөх" },
  { value: "matching", label: "Харгалзуулах" },
];

interface AiCreateConfiguratorProps {
  subjects: Subject[];
}

type GradeFilter = (typeof GRADES)[number] | "all";

function getQuestionTypeLabel(type: QuestionType) {
  return (
    QUESTION_TYPES.find((questionType) => questionType.value === type)?.label ??
    type
  );
}

export default function AiCreateConfigurator({
  subjects,
}: AiCreateConfiguratorProps) {
  const sortedSubjects = useMemo(
    () => [...subjects].sort((left, right) => left.name.localeCompare(right.name, "mn")),
    [subjects]
  );

  const [subjectId, setSubjectId] = useState(sortedSubjects[0]?.id ?? "");
  const [questionCount, setQuestionCount] =
    useState<(typeof QUESTION_COUNTS)[number]>(10);
  const [grade, setGrade] = useState<GradeFilter>("all");
  const [questionType, setQuestionType] =
    useState<QuestionType>("multiple_choice");
  const [prompt, setPrompt] = useState("");
  const [drafts, setDrafts] = useState<QuestionImportDraft[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [generatedSubjectName, setGeneratedSubjectName] = useState("");
  const [usedSampleContext, setUsedSampleContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isGenerating, startGenerateTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  const selectedSubjectName =
    sortedSubjects.find((subject) => subject.id === subjectId)?.name ??
    "Хичээл сонгоогүй";
  const canGenerate = sortedSubjects.length > 0 && Boolean(subjectId);
  const selectedDrafts = useMemo(
    () => drafts.filter((draft) => selectedDraftIds.includes(draft.draftId)),
    [drafts, selectedDraftIds]
  );
  const selectedSummary = useMemo(
    () => summarizeQuestionDrafts(selectedDrafts),
    [selectedDrafts]
  );

  function handleGenerate() {
    if (!canGenerate) {
      setError("AI generation хийхийн тулд эхлээд хичээл сонгоно уу.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    startGenerateTransition(async () => {
      const result = await generatePrivateBankQuestionDraftsWithAI({
        subjectId,
        gradeLevel: grade === "all" ? null : grade,
        questionType,
        questionCount,
        prompt,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      const nextDrafts = result.drafts ?? [];
      setDrafts(nextDrafts);
      setSelectedDraftIds(nextDrafts.map((draft) => draft.draftId));
      setGeneratedSubjectName(result.subjectName ?? selectedSubjectName);
      setUsedSampleContext(Boolean(result.sampleContext?.trim()));
    });
  }

  function handleSave() {
    if (!subjectId) {
      setError("Хичээлээ сонгоно уу.");
      return;
    }

    if (selectedDrafts.length === 0) {
      setError("Хадгалах асуултаа дор хаяж нэгийг сонгоно уу.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    startSaveTransition(async () => {
      const result = await saveGeneratedPrivateBankQuestions({
        subjectId,
        gradeLevel: grade === "all" ? null : grade,
        drafts: selectedDrafts,
      });

      if (result?.error) {
        setError(result.error);
        if (result.drafts) {
          const draftMap = new Map(
            result.drafts.map((draft) => [draft.draftId, draft] as const)
          );
          setDrafts((prev) => prev.map((draft) => draftMap.get(draft.draftId) ?? draft));
        }
        return;
      }

      const savedIds = new Set(selectedDrafts.map((draft) => draft.draftId));
      setDrafts((prev) => prev.filter((draft) => !savedIds.has(draft.draftId)));
      setSelectedDraftIds((prev) => prev.filter((draftId) => !savedIds.has(draftId)));
      setSuccessMessage(
        `${result.count ?? selectedDrafts.length} асуулт private bank-д хадгалагдлаа.`
      );
    });
  }

  return (
    <div className="min-h-screen">
      <h1 className="mb-7 text-[20px] font-medium">AI асуулт үүсгэх</h1>

      <div className="flex gap-4 rounded-lg bg-white p-4 max-lg:flex-col">
        <div className="flex flex-col gap-4">
          <div className="space-y-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div>
              <label className="mb-2 block text-[14px] font-medium">
                Хичээлийн нэр
              </label>
              <div className="relative">
                <select
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                  disabled={!sortedSubjects.length}
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="" disabled>
                    Хичээл сонгох
                  </option>
                  {sortedSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-[14px] font-medium">
                  Асуултын тоо
                </label>
                <div className="relative">
                  <select
                    value={String(questionCount)}
                    onChange={(event) =>
                      setQuestionCount(
                        Number(event.target.value) as (typeof QUESTION_COUNTS)[number]
                      )
                    }
                    className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {QUESTION_COUNTS.map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[14px] font-medium">Анги</label>
                <div className="relative">
                  <select
                    value={grade}
                    onChange={(event) =>
                      setGrade(
                        event.target.value === "all"
                          ? "all"
                          : (Number(event.target.value) as (typeof GRADES)[number])
                      )
                    }
                    className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">Бүгд</option>
                    {GRADES.map((item) => (
                      <option key={item} value={item}>
                        {item}-р анги
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div>
              <label className="mb-2 block text-[14px] font-medium">Төрөл</label>
              <div className="relative">
                <select
                  value={questionType}
                  onChange={(event) =>
                    setQuestionType(event.target.value as QuestionType)
                  }
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {QUESTION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[14px] font-medium">
                Промт / Нэмэлт заавар
              </label>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Жишээ нь: Сэтгэн бодох чадвар шаардсан, богино тодорхой асуулт үүсгэ."
                className="h-36 w-[338px] resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 max-sm:w-full"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating || isSaving}
            className="flex w-max cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#ECF1F9] px-6 py-2.5 font-semibold text-[#4891F1] transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? "AI боловсруулж байна..." : "AI-аар үүсгэх"}
            <Sparkles className="h-4 w-4 fill-current" />
          </button>

          {!sortedSubjects.length ? (
            <p className="text-sm text-amber-600">
              Танд хуваарилагдсан хичээл алга. Админ эхлээд хичээл оноох шаардлагатай.
            </p>
          ) : null}
        </div>

        <div className="relative min-h-[44rem] flex-1 rounded-2xl border border-gray-100 bg-[#F1F5F980] px-10 py-8 shadow-sm">
          <div className="absolute right-8 top-8">
            <div className="flex items-center gap-2 rounded-full bg-black px-6 py-2 text-[13px] font-medium text-white">
              {(generatedSubjectName || selectedSubjectName) || "Хичээл сонгоно уу"} хичээлээр{" "}
              {questionCount} асуулт үүсгэхэд бэлэн.
            </div>
          </div>

          <div className="mt-12 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-800">SmartExam.v2.0</h2>
              <p className="mt-1 text-[14px] text-gray-500">
                AI-аар асуулт үүсгээд багш эхлээд шалгаж, дараа нь өөрийн хувийн санд хадгална.
              </p>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>{successMessage}</span>
                  <Button asChild variant="outline" className="h-9 rounded-full px-4">
                    <Link href="/educator/question-bank/private">Хувийн сан руу очих</Link>
                  </Button>
                </div>
              </div>
            ) : null}

            {isGenerating ? (
              <div className="rounded-2xl border border-white/70 bg-white/80 p-6">
                <AiLoading
                  size={220}
                  label="AI боловсруулж байна..."
                  className="py-8"
                />
              </div>
            ) : drafts.length > 0 ? (
              <div className="space-y-5 rounded-2xl border border-white/70 bg-white/80 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                    {drafts.length} draft
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {selectedDraftIds.length} сонгосон
                  </span>
                  {selectedSummary.invalid > 0 ? (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                      {selectedSummary.invalid} алдаатай
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      usedSampleContext
                        ? "bg-[#EEF3FF] text-[#2F4C98]"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {usedSampleContext
                      ? "Жишиг шалгалтын контекст ашигласан"
                      : "Ерөнхий AI generation"}
                  </span>
                </div>

                <QuestionDraftReviewList
                  drafts={drafts}
                  onDraftsChange={setDrafts}
                  selectable
                  selectedDraftIds={selectedDraftIds}
                  onSelectedDraftIdsChange={setSelectedDraftIds}
                  emptyMessage="AI-аар үүсгэсэн draft үлдээгүй байна."
                  removeLabel="Энэ draft-ийг хасах"
                />

                <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerate}
                    disabled={!canGenerate || isGenerating || isSaving}
                    className="rounded-full px-5"
                  >
                    Дахин үүсгэх
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={
                      isGenerating ||
                      isSaving ||
                      selectedDraftIds.length === 0 ||
                      selectedSummary.invalid > 0
                    }
                    className="rounded-full bg-[#4891F1] px-5 text-white hover:bg-[#317fdd]"
                  >
                    {isSaving
                      ? "Хадгалж байна..."
                      : `Сонгосныг private bank-д хадгалах (${selectedDraftIds.length})`}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/70 bg-white/80 p-6">
                <h3 className="text-sm font-semibold text-gray-900">
                  Одоогийн тохиргоо
                </h3>
                <div className="mt-4 grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Хичээл
                    </p>
                    <p className="mt-1 font-medium text-gray-900">
                      {selectedSubjectName}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Асуултын төрөл
                    </p>
                    <p className="mt-1 font-medium text-gray-900">
                      {getQuestionTypeLabel(questionType)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Асуултын тоо
                    </p>
                    <p className="mt-1 font-medium text-gray-900">{questionCount}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Анги
                    </p>
                    <p className="mt-1 font-medium text-gray-900">
                      {grade === "all" ? "Бүх анги" : `${grade}-р анги`}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    Нэмэлт заавар
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                    {prompt.trim() || "Одоогоор нэмэлт заавар оруулаагүй байна."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
