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
  QuestionImportMatchingPair,
  QuestionType,
} from "@/types";
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
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  PlusCircle,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

type FileImportType = "excel" | "word";

interface SelectedImportFile {
  name: string;
  type: FileImportType;
}

interface QuestionImportActionsProps {
  examId: string;
  aiVariantEnabled: boolean;
  aiVariantMode: AiQuestionVariantMode;
  onAiVariantEnabledChange: (value: boolean) => void;
  formulaToolOpen: boolean;
  onFormulaToolOpenChange: (value: boolean) => void;
}

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Нэг сонголттой" },
  { value: "multiple_response", label: "Олон сонголттой" },
  { value: "fill_blank", label: "Нөхөх" },
  { value: "essay", label: "Эссэ / задгай" },
  { value: "matching", label: "Холбох" },
];

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

function createEmptyMatchingPair(): QuestionImportMatchingPair {
  return { left: "", right: "" };
}

function resetDraftForType(
  draft: QuestionImportDraft,
  nextType: QuestionType
): QuestionImportDraft {
  const nextOptions = draft.options.length >= 2 ? draft.options : ["", ""];
  const nextPairs =
    draft.matchingPairs.length >= 2
      ? draft.matchingPairs
      : [createEmptyMatchingPair(), createEmptyMatchingPair()];

  if (nextType === "multiple_choice") {
    return {
      ...draft,
      type: nextType,
      options: nextOptions,
      correctAnswer: draft.correctAnswer || draft.multipleCorrectAnswers[0] || "",
      multipleCorrectAnswers: [],
      matchingPairs: [],
      errors: [],
    };
  }

  if (nextType === "multiple_response") {
    return {
      ...draft,
      type: nextType,
      options: nextOptions,
      correctAnswer: "",
      multipleCorrectAnswers:
        draft.multipleCorrectAnswers.length > 0
          ? draft.multipleCorrectAnswers
          : draft.correctAnswer
            ? [draft.correctAnswer]
            : [],
      matchingPairs: [],
      errors: [],
    };
  }

  if (nextType === "fill_blank") {
    return {
      ...draft,
      type: nextType,
      options: [],
      correctAnswer: draft.correctAnswer || draft.multipleCorrectAnswers[0] || "",
      multipleCorrectAnswers: [],
      matchingPairs: [],
      errors: [],
    };
  }

  if (nextType === "matching") {
    return {
      ...draft,
      type: nextType,
      options: [],
      correctAnswer: "",
      multipleCorrectAnswers: [],
      matchingPairs: nextPairs,
      errors: [],
    };
  }

  return {
    ...draft,
    type: nextType,
    options: [],
    correctAnswer: "",
    multipleCorrectAnswers: [],
    matchingPairs: [],
    errors: [],
  };
}

export default function QuestionImportActions({
  examId,
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

  const summary = useMemo(() => {
    const invalidCount = drafts.filter((draft) => draft.errors.length > 0).length;
    const warningCount = drafts.filter((draft) => draft.warnings.length > 0).length;

    return {
      total: drafts.length,
      invalid: invalidCount,
      warning: warningCount,
    };
  }, [drafts]);

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

  function updateDraft(
    draftId: string,
    updater: (draft: QuestionImportDraft) => QuestionImportDraft
  ) {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.draftId === draftId ? { ...updater(draft), errors: [] } : draft
      )
    );
  }

  function removeDraft(draftId: string) {
    setDrafts((prev) => prev.filter((draft) => draft.draftId !== draftId));
  }

  function updateOption(draftId: string, optionIndex: number, value: string) {
    updateDraft(draftId, (draft) => {
      const previousValue = draft.options[optionIndex];
      const nextOptions = [...draft.options];
      nextOptions[optionIndex] = value;

      return {
        ...draft,
        options: nextOptions,
        correctAnswer:
          draft.correctAnswer === previousValue ? value : draft.correctAnswer,
        multipleCorrectAnswers: draft.multipleCorrectAnswers.map((answer) =>
          answer === previousValue ? value : answer
        ),
      };
    });
  }

  function addOption(draftId: string) {
    updateDraft(draftId, (draft) => ({
      ...draft,
      options: [...draft.options, ""],
    }));
  }

  function removeOption(draftId: string, optionIndex: number) {
    updateDraft(draftId, (draft) => {
      const removedValue = draft.options[optionIndex];
      const nextOptions = draft.options.filter((_, index) => index !== optionIndex);

      return {
        ...draft,
        options: nextOptions.length >= 2 ? nextOptions : [...nextOptions, ""],
        correctAnswer:
          draft.correctAnswer === removedValue ? "" : draft.correctAnswer,
        multipleCorrectAnswers: draft.multipleCorrectAnswers.filter(
          (answer) => answer !== removedValue
        ),
      };
    });
  }

  function toggleMultipleAnswer(draftId: string, option: string) {
    updateDraft(draftId, (draft) => ({
      ...draft,
      multipleCorrectAnswers: draft.multipleCorrectAnswers.includes(option)
        ? draft.multipleCorrectAnswers.filter((item) => item !== option)
        : [...draft.multipleCorrectAnswers, option],
    }));
  }

  function updateMatchingPair(
    draftId: string,
    pairIndex: number,
    key: keyof QuestionImportMatchingPair,
    value: string
  ) {
    updateDraft(draftId, (draft) => ({
      ...draft,
      matchingPairs: draft.matchingPairs.map((pair, index) =>
        index === pairIndex ? { ...pair, [key]: value } : pair
      ),
    }));
  }

  function addMatchingPair(draftId: string) {
    updateDraft(draftId, (draft) => ({
      ...draft,
      matchingPairs: [...draft.matchingPairs, createEmptyMatchingPair()],
    }));
  }

  function removeMatchingPair(draftId: string, pairIndex: number) {
    updateDraft(draftId, (draft) => {
      const nextPairs = draft.matchingPairs.filter((_, index) => index !== pairIndex);

      return {
        ...draft,
        matchingPairs:
          nextPairs.length >= 2
            ? nextPairs
            : [...nextPairs, createEmptyMatchingPair()],
      };
    });
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

  function renderDraftFields(draft: QuestionImportDraft) {
    if (draft.type === "multiple_choice" || draft.type === "multiple_response") {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Сонголтууд</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addOption(draft.draftId)}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Сонголт нэмэх
            </Button>
          </div>

          {draft.options.map((option, index) => {
            const isChecked =
              draft.type === "multiple_choice"
                ? draft.correctAnswer === option && option.trim() !== ""
                : draft.multipleCorrectAnswers.includes(option) &&
                  option.trim() !== "";

            return (
              <div key={`${draft.draftId}-option-${index}`} className="flex items-center gap-2">
                <input
                  type={draft.type === "multiple_choice" ? "radio" : "checkbox"}
                  name={`${draft.draftId}-correct-option`}
                  checked={isChecked}
                  onChange={() =>
                    draft.type === "multiple_choice"
                      ? updateDraft(draft.draftId, (currentDraft) => ({
                          ...currentDraft,
                          correctAnswer: option,
                        }))
                      : toggleMultipleAnswer(draft.draftId, option)
                  }
                  className="h-4 w-4 shrink-0"
                  disabled={!option.trim()}
                />
                <Input
                  value={option}
                  onChange={(event) =>
                    updateOption(draft.draftId, index, event.target.value)
                  }
                  placeholder={`Сонголт ${index + 1}`}
                />
                {draft.options.length > 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeOption(draft.draftId, index)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    }

    if (draft.type === "fill_blank") {
      return (
        <div className="space-y-2">
          <Label>Зөв хариулт</Label>
          <Input
            value={draft.correctAnswer}
            onChange={(event) =>
              updateDraft(draft.draftId, (currentDraft) => ({
                ...currentDraft,
                correctAnswer: event.target.value,
              }))
            }
            placeholder="Зөв хариултаа бичнэ үү"
          />
        </div>
      );
    }

    if (draft.type === "matching") {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Холбох мөрүүд</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addMatchingPair(draft.draftId)}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Мөр нэмэх
            </Button>
          </div>

          {draft.matchingPairs.map((pair, index) => (
            <div
              key={`${draft.draftId}-pair-${index}`}
              className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] md:items-center"
            >
              <Input
                value={pair.left}
                onChange={(event) =>
                  updateMatchingPair(draft.draftId, index, "left", event.target.value)
                }
                placeholder={`Зүүн тал ${index + 1}`}
              />
              <span className="text-center text-sm text-muted-foreground">→</span>
              <Input
                value={pair.right}
                onChange={(event) =>
                  updateMatchingPair(draft.draftId, index, "right", event.target.value)
                }
                placeholder={`Баруун тал ${index + 1}`}
              />
              {draft.matchingPairs.length > 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeMatchingPair(draft.draftId, index)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
        Энэ асуулт одоогоор эссэ хэлбэрээр импортлогдоно. Шаардлагатай бол төрлийг нь
        өөрчилж засна уу.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 rounded-[24px] border border-dashed border-zinc-200 bg-zinc-50/80 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-950">
              Хурдан үйлдлүүд
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between rounded-full px-5 sm:w-[190px]"
                  disabled={isParsing || isImporting}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
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
                  className="w-full justify-between rounded-full px-5 sm:w-[190px]"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
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
            <Badge variant={summary.invalid > 0 ? "destructive" : "secondary"}>
              {summary.invalid > 0
                ? `${summary.invalid} алдаатай`
                : "Шууд импортлоход бэлэн"}
            </Badge>
            {summary.warning > 0 ? (
              <Badge variant="outline" className="border-amber-300 text-amber-700">
                {summary.warning} анхааруулах мөр
              </Badge>
            ) : null}
            {selectedFile ? <Badge variant="ghost">{selectedFile.name}</Badge> : null}
          </div>

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

          <div className="space-y-4">
            {drafts.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Импортлох draft үлдээгүй байна.
              </div>
            ) : (
              drafts.map((draft) => (
                <div key={draft.draftId} className="space-y-4 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">#{draft.sourceRow}</Badge>
                      <Badge
                        variant={draft.errors.length > 0 ? "destructive" : "secondary"}
                      >
                        {questionTypes.find((item) => item.value === draft.type)?.label}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeDraft(draft.draftId)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Энэ draft-ийг хасах
                    </Button>
                  </div>

                  {draft.warnings.length > 0 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      <p className="font-medium">Анхаарах зүйл</p>
                      <ul className="mt-2 list-disc pl-5">
                        {draft.warnings.map((warning) => (
                          <li key={`${draft.draftId}-${warning}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {draft.errors.length > 0 ? (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      <p className="font-medium">Засах шаардлагатай</p>
                      <ul className="mt-2 list-disc pl-5">
                        {draft.errors.map((item) => (
                          <li key={`${draft.draftId}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                    <div className="space-y-2">
                      <Label>Асуулт</Label>
                      <Textarea
                        value={draft.content}
                        onChange={(event) =>
                          updateDraft(draft.draftId, (currentDraft) => ({
                            ...currentDraft,
                            content: event.target.value,
                          }))
                        }
                        rows={4}
                        placeholder="Асуултын агуулга"
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Асуултын төрөл</Label>
                        <Select
                          value={draft.type}
                          onValueChange={(value) =>
                            updateDraft(draft.draftId, (currentDraft) =>
                              resetDraftForType(currentDraft, value as QuestionType)
                            )
                          }
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
                        <Label>Оноо</Label>
                        <Input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={draft.points}
                          onChange={(event) =>
                            updateDraft(draft.draftId, (currentDraft) => ({
                              ...currentDraft,
                              points: Number(event.target.value) || 1,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Тайлбар</Label>
                      <Textarea
                        value={draft.explanation}
                        onChange={(event) =>
                          updateDraft(draft.draftId, (currentDraft) => ({
                            ...currentDraft,
                            explanation: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="Тайлбар / solution"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Зураг URL</Label>
                      <Input
                        value={draft.imageUrl}
                        onChange={(event) =>
                          updateDraft(draft.draftId, (currentDraft) => ({
                            ...currentDraft,
                            imageUrl: event.target.value,
                          }))
                        }
                        placeholder="https://example.com/question-image.png"
                      />
                    </div>
                  </div>

                  {renderDraftFields(draft)}
                </div>
              ))
            )}
          </div>

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
