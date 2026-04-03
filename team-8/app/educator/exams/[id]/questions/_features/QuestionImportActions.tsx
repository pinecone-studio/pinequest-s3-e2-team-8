"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  importParsedQuestions,
  parseImportedQuestionFile,
} from "@/lib/question/actions";
import type {
  AiQuestionVariantMode,
  QuestionImportDraft,
} from "@/types";
import QuestionDraftReviewList, {
  summarizeQuestionDrafts,
} from "@/app/educator/_components/QuestionDraftReviewList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import AIGenerateDialog from "./AIGenerateDialog";

type FileImportType = "excel" | "word";

interface SelectedImportFile {
  name: string;
  type: FileImportType;
}

interface QuestionImportActionsProps {
  examId: string;
  subjectName: string;
  sampleContext: string;
  aiVariantEnabled: boolean;
  aiVariantMode: AiQuestionVariantMode;
  onAiVariantEnabledChange: (value: boolean) => void;
  formulaToolOpen: boolean;
  onFormulaToolOpenChange: (value: boolean) => void;
}

const importTypeMeta: Record<
  FileImportType,
  {
    accept: string;
    label: string;
    hint: string;
    icon: typeof FileSpreadsheet;
  }
> = {
  excel: {
    accept:
      ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
    label: "Excel",
    hint: ".xlsx / .xls",
    icon: FileSpreadsheet,
  },
  word: {
    accept:
      ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word",
    hint: ".docx",
    icon: FileText,
  },
};

export default function QuestionImportActions({
  examId,
  subjectName,
  sampleContext,
  aiVariantEnabled,
  aiVariantMode,
  onAiVariantEnabledChange,
  formulaToolOpen,
  onFormulaToolOpenChange,
}: QuestionImportActionsProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<SelectedImportFile | null>(null);
  const [drafts, setDrafts] = useState<QuestionImportDraft[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isParsing, startParsingTransition] = useTransition();
  const [isImporting, startImportTransition] = useTransition();
  const inputRefs = useRef<Record<FileImportType, HTMLInputElement | null>>({
    excel: null,
    word: null,
  });

  const summary = useMemo(() => summarizeQuestionDrafts(drafts), [drafts]);

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  function openPicker(type: FileImportType) {
    inputRefs.current[type]?.click();
  }

  function clearImportState(resetSuccessMessage = true) {
    setSelectedFile(null);
    setDrafts([]);
    setParseWarnings([]);
    setError(null);
    if (resetSuccessMessage) {
      setSuccessMessage(null);
    }
    setPreviewOpen(false);
  }

  async function parseFile(file: File, type: FileImportType) {
    setError(null);
    setSuccessMessage(null);
    setParseWarnings([]);
    setSelectedFile({
      name: file.name,
      type,
    });

    const formData = new FormData();
    formData.set("file", file);

    const result = await parseImportedQuestionFile(examId, formData);
    if (result?.error) {
      setDrafts([]);
      setPreviewOpen(false);
      setParseWarnings([]);
      setError(result.error);
      return;
    }

    setDrafts(result.drafts ?? []);
    setParseWarnings(result.warnings ?? []);
    setPreviewOpen(true);
  }

  function handleFileSelect(
    type: FileImportType,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    startParsingTransition(() => {
      void parseFile(file, type);
    });

    event.target.value = "";
  }

  async function confirmImport() {
    setError(null);
    setSuccessMessage(null);

    const result = await importParsedQuestions(examId, JSON.stringify(drafts));
    if (result?.error) {
      setError(result.error);
      if (result.drafts) {
        setDrafts(
          result.drafts.map((draft) => ({
            ...draft,
            warnings: draft.warnings ?? [],
            errors: draft.errors.filter((item): item is string => Boolean(item)),
          }))
        );
        setPreviewOpen(true);
      }
      return;
    }

    clearImportState(false);
    setSuccessMessage(`${result.count ?? drafts.length} асуулт амжилттай импортлогдлоо.`);
    router.refresh();
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <AIGenerateDialog
              examId={examId}
              subjectName={subjectName}
              sampleContext={sampleContext}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full justify-between rounded-[10px] border-[#E5E7EB] bg-white px-4 text-[12px] font-medium text-[#374151] shadow-none sm:w-[160px]"
                  disabled={isParsing || isImporting}
                >
                  Асуулт нэмэх
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Эх сурвалж сонгох</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href={`/educator/question-bank/private?examId=${examId}`}>
                    <BookOpen className="h-4 w-4" />
                    Хувийн сангаас авах
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/educator/question-bank?examId=${examId}`}>
                    <BookOpen className="h-4 w-4" />
                    Баталгаажсан сан, жишиг шалгалт
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Upload className="h-4 w-4" />
                    Файл оруулах
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {(
                      Object.entries(importTypeMeta) as [
                        FileImportType,
                        (typeof importTypeMeta)[FileImportType],
                      ][]
                    ).map(([type, meta]) => {
                      const Icon = meta.icon;

                      return (
                        <DropdownMenuItem
                          key={`${type}-quick-action`}
                          onSelect={() => openPicker(type)}
                          disabled={isParsing || isImporting}
                        >
                          <Icon className="h-4 w-4" />
                          {meta.label}
                          <DropdownMenuShortcut>{meta.hint}</DropdownMenuShortcut>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full justify-between rounded-[10px] border-[#E5E7EB] bg-white px-4 text-[12px] font-medium text-[#374151] shadow-none sm:w-[160px]"
                >
                  Хэрэгслүүд
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Нээх хэрэгслүүд</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={aiVariantEnabled}
                  onCheckedChange={(checked) =>
                    onAiVariantEnabledChange(Boolean(checked))
                  }
                >
                  <Sparkles className="h-4 w-4" />
                  AI-аар хувилбар үүсгэх
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={formulaToolOpen}
                  onCheckedChange={(checked) =>
                    onFormulaToolOpenChange(Boolean(checked))
                  }
                >
                  f(x) Томьёо
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        {aiVariantEnabled ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              AI хувилбар идэвхтэй
            </Badge>
            <Badge variant="outline" className="border-amber-200 text-amber-700">
              {aiVariantMode === "two_fixed"
                ? "2 хувилбар"
                : "Сурагч бүрт өөр"}
            </Badge>
            <span>
              Түвшин өөрчлөхгүй, зөвхөн тоо, нэр, өгөгдөл, сонголтын текстийг хувиргана.
            </span>
          </div>
        ) : null}

        <div className="hidden">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-zinc-950">
              Асуулт нэмэх хурдан сонголтууд
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="justify-between rounded-full px-5">
              <Link href={`/educator/question-bank/private?examId=${examId}`}>
                Хувийн сангаас авах
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between rounded-full px-5"
                  disabled={isParsing || isImporting}
                >
                  {isParsing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Файл оруулах
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Файлын төрөл сонгох</DropdownMenuLabel>
                {(
                  Object.entries(importTypeMeta) as [
                    FileImportType,
                    (typeof importTypeMeta)[FileImportType],
                  ][]
                ).map(([type, meta]) => {
                  const Icon = meta.icon;

                  return (
                    <DropdownMenuItem
                      key={type}
                      onSelect={() => openPicker(type)}
                      disabled={isParsing || isImporting}
                    >
                      <Icon className="h-4 w-4" />
                      {meta.label}
                      <DropdownMenuShortcut>{meta.hint}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        </div>

        {selectedFile ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium text-zinc-950">
                Сонгосон файл: {selectedFile.name}
              </p>
              <p className="text-zinc-500">
                {importTypeMeta[selectedFile.type].label}
                {drafts.length > 0 ? ` · ${drafts.length} draft` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {drafts.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                >
                  Preview / Засах
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-zinc-500 hover:text-red-600"
                onClick={() => clearImportState()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Цэвэрлэх
              </Button>
            </div>
          </div>
        ) : null}

        {parseWarnings.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Parse анхааруулга
            </div>
            <ul className="list-disc pl-5">
              {parseWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {(Object.entries(importTypeMeta) as [
          FileImportType,
          (typeof importTypeMeta)[FileImportType],
        ][]).map(([type, meta]) => (
          <input
            key={type}
            ref={(node) => {
              inputRefs.current[type] = node;
            }}
            type="file"
            accept={meta.accept}
            className="hidden"
            onChange={(event) => handleFileSelect(type, event)}
          />
        ))}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Импортын preview</DialogTitle>
            <DialogDescription>
              Файлаас таньсан асуултуудаа шалгаад, шаардлагатайг зассаны дараа
              шалгалтдаа нэмнэ.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{summary.total} draft</Badge>
            {summary.invalid > 0 ? (
              <Badge variant="destructive">{summary.invalid} алдаатай</Badge>
            ) : summary.missingCorrectAnswer === 0 ? (
              <Badge variant="secondary">Шууд импортлоход бэлэн</Badge>
            ) : null}
            {summary.warning > 0 ? (
              <Badge variant="outline" className="border-amber-300 text-amber-700">
                {summary.warning} анхааруулах мөр
              </Badge>
            ) : null}
            {selectedFile ? <Badge variant="ghost">{selectedFile.name}</Badge> : null}
          </div>

          {summary.missingCorrectAnswer > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <span className="font-medium">
                    {summary.missingCorrectAnswer} асуулт дээр зөв хариулт
                    сонгогдоогүй байна.
                  </span>{" "}
                  Preview дээр зөв хариултыг сонгоод үргэлжлүүлнэ үү.
                </p>
              </div>
            </div>
          ) : null}

          {parseWarnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Parse үеийн анхааруулга
              </div>
              <ul className="list-disc pl-5">
                {parseWarnings.map((warning) => (
                  <li key={`preview-${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <QuestionDraftReviewList
            drafts={drafts}
            onDraftsChange={setDrafts}
            emptyMessage="Импортлох draft үлдээгүй байна."
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(false)}
            >
              Хаах
            </Button>
            <Button
              type="button"
              onClick={() =>
                startImportTransition(() => {
                  void confirmImport();
                })
              }
              disabled={drafts.length === 0 || isImporting || isParsing}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Импортлож байна...
                </>
              ) : (
                `Баталгаажуулаад импортлох (${drafts.length})`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
