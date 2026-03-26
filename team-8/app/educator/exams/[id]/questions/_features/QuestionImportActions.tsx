"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  importParsedQuestions,
  parseImportedQuestionFile,
} from "@/lib/question/actions";
import type {
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
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
  ChevronDown,
  File,
  FileSpreadsheet,
  Loader2,
  PlusCircle,
  Trash2,
  Upload,
} from "lucide-react";

type FileImportType = "excel" | "csv";

interface SelectedImportFile {
  name: string;
  type: FileImportType;
}

interface QuestionImportActionsProps {
  examId: string;
}

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Сонгох" },
  { value: "multiple_response", label: "Олон сонголттой" },
  { value: "fill_blank", label: "Нөхөх" },
  { value: "essay", label: "Задгай / Эссэ" },
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
  csv: {
    accept: ".csv,text/csv",
    label: "CSV",
    hint: ".csv",
    icon: File,
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
}: QuestionImportActionsProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<SelectedImportFile | null>(null);
  const [drafts, setDrafts] = useState<QuestionImportDraft[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isParsing, startParsingTransition] = useTransition();
  const [isImporting, startImportTransition] = useTransition();
  const inputRefs = useRef<Record<FileImportType, HTMLInputElement | null>>({
    excel: null,
    csv: null,
  });

  const summary = useMemo(() => {
    const invalidCount = drafts.filter((draft) => draft.errors.length > 0).length;

    return {
      total: drafts.length,
      invalid: invalidCount,
    };
  }, [drafts]);

  function openPicker(type: FileImportType) {
    inputRefs.current[type]?.click();
  }

  function clearImportState(resetSuccessMessage = true) {
    setSelectedFile(null);
    setDrafts([]);
    setError(null);
    if (resetSuccessMessage) {
      setSuccessMessage(null);
    }
    setPreviewOpen(false);
  }

  async function parseFile(file: File, type: FileImportType) {
    setError(null);
    setSuccessMessage(null);
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
      setError(result.error);
      return;
    }

    setDrafts(result.drafts ?? []);
    setPreviewOpen(true);
  }

  function handleFileSelect(
    type: FileImportType,
    event: React.ChangeEvent<HTMLInputElement>
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
                {draft.options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeOption(draft.draftId, index)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
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
              {draft.matchingPairs.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeMatchingPair(draft.draftId, index)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
        Энэ асуулт зөв хариултгүйгээр essay хэлбэрээр импортлогдоно.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h3 className="font-semibold">Асуултын сан ашиглах</h3>
            <p className="text-sm text-muted-foreground">
              Өмнө үүсгэсэн асуултуудаа сангаас эсвэл file-аар энэ шалгалт руу
              оруулж болно.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/educator/question-bank?examId=${examId}`}>
                Сангаас оруулах
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isParsing || isImporting}>
                  {isParsing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  File оруулах
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

        {selectedFile && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
            <div>
              <span className="font-medium">Сонгосон файл:</span> {selectedFile.name}
              <span className="ml-2 text-muted-foreground">
                ({importTypeMeta[selectedFile.type].label})
              </span>
              {drafts.length > 0 && (
                <span className="ml-2 text-muted-foreground">
                  · {drafts.length} draft
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {drafts.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                >
                  Preview / Edit
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => clearImportState()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Устгах
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mt-3 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}

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
              File-оос уншсан асуултуудыг шалгаад, шаардлагатайг нь зассаны дараа
              batch-аар import хийнэ.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{summary.total} draft</Badge>
            <Badge variant={summary.invalid > 0 ? "destructive" : "secondary"}>
              {summary.invalid > 0
                ? `${summary.invalid} алдаатай`
                : "Шууд импортлоход бэлэн"}
            </Badge>
            {selectedFile && (
              <Badge variant="ghost">{selectedFile.name}</Badge>
            )}
          </div>

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
                      <Badge variant="outline">Row {draft.sourceRow}</Badge>
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

                  {draft.errors.length > 0 && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      <p className="font-medium">Засах шаардлагатай</p>
                      <ul className="mt-2 list-disc pl-5">
                        {draft.errors.map((item) => (
                          <li key={`${draft.draftId}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

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
