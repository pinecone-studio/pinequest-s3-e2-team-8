"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Search, Trash2 } from "lucide-react";
import {
  bulkUpdateQuestionBankItems,
  deleteQuestionBankItem,
  importQuestionFromBank,
} from "@/lib/question/actions";
import type {
  Difficulty,
  QuestionBank,
  QuestionBankSummary,
  QuestionBankVisibility,
  Subject,
} from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import MathContent from "@/components/math/MathContent";
import EditQuestionBankDialog from "./EditQuestionBankDialog";

const typeLabels: Record<string, string> = {
  multiple_choice: "Сонголтот",
  multiple_response: "Олон зөв",
  true_false: "Үнэн/Худал",
  essay: "Нээлттэй",
  fill_blank: "Цоорхой",
  matching: "Холбох",
};

const difficultyLabels: Record<Difficulty, string> = {
  easy: "Хялбар",
  medium: "Дунд",
  hard: "Хэцүү",
};

interface QuestionBankBrowserProps {
  questions: QuestionBank[];
  summary: QuestionBankSummary;
  subjects: Subject[];
  viewerId: string | null;
  isAdmin: boolean;
  examId?: string;
  examTitle?: string;
  targetExamSubjectId?: string;
  importUnavailableMessage?: string | null;
}

interface StatCardProps {
  title: string;
  value: number;
  bgColor: string;
  darkColor: string;
}

function StatCard({ title, value, bgColor, darkColor }: StatCardProps) {
  return (
    <Card
      className={`relative h-full overflow-hidden rounded-2xl p-4 text-white shadow-lg ${bgColor}`}
    >
      <div
        className={`absolute left-[-20%] top-[-30%] h-[80%] w-[60%] rounded-[50%] opacity-60 ${darkColor}`}
      />
      <div
        className={`absolute bottom-[-30%] right-[-20%] h-[70%] w-[50%] rounded-[40%] opacity-70 ${darkColor}`}
      />
      <div className="absolute inset-0 rounded-full bg-white/10 opacity-30 blur-3xl" />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-bold tracking-tight opacity-90">
            {title}
          </h3>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function isManageable(
  question: QuestionBank,
  viewerId: string | null,
  isAdmin: boolean,
) {
  if (question.visibility === "admin_curated") {
    return isAdmin;
  }

  return isAdmin || question.created_by === viewerId;
}

function getDifficultyBadgeClassName(difficulty: Difficulty) {
  if (difficulty === "easy") {
    return "border-transparent bg-[#8BCF8A] text-white";
  }

  if (difficulty === "medium") {
    return "border-transparent bg-[#F7BC41] text-white";
  }

  return "border-transparent bg-[#E56B67] text-white";
}

export default function QuestionBankBrowser({
  questions,
  summary,
  subjects,
  viewerId,
  isAdmin,
  examId,
  examTitle,
  targetExamSubjectId,
  importUnavailableMessage,
}: QuestionBankBrowserProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [tagQuery, setTagQuery] = useState("");
  const [bulkVisibility, setBulkVisibility] = useState("__none");
  const [bulkDifficulty, setBulkDifficulty] = useState("__none");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(
    importUnavailableMessage ?? null,
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [lastImportedId, setLastImportedId] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTagQuery = tagQuery.trim().toLowerCase();
  const availableSubjects = useMemo(
    () =>
      Array.from(
        new Map(
          subjects.map((subject) => [subject.id, subject.name]),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1], "mn")),
    [subjects],
  );

  const filteredQuestions = useMemo(() => {
    return questions.filter((question) => {
      const tags = Array.isArray(question.tags) ? question.tags : [];
      const subjectName = question.subjects?.name ?? null;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        question.content.toLowerCase().includes(normalizedQuery) ||
        (question.explanation ?? "").toLowerCase().includes(normalizedQuery) ||
        tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)) ||
        (subjectName ?? "").toLowerCase().includes(normalizedQuery);

      const matchesType = typeFilter === "all" || question.type === typeFilter;
      const matchesDifficulty =
        difficultyFilter === "all" || question.difficulty === difficultyFilter;
      const matchesSubject =
        subjectFilter === "all" || question.subject_id === subjectFilter;
      const matchesVisibility =
        visibilityFilter === "all" || question.visibility === visibilityFilter;
      const matchesTag =
        normalizedTagQuery.length === 0 ||
        tags.some((tag) => tag.toLowerCase().includes(normalizedTagQuery));

      return (
        matchesQuery &&
        matchesType &&
        matchesDifficulty &&
        matchesSubject &&
        matchesVisibility &&
        matchesTag
      );
    });
  }, [
    difficultyFilter,
    normalizedQuery,
    normalizedTagQuery,
    questions,
    subjectFilter,
    typeFilter,
    visibilityFilter,
  ]);

  const visibleManageableIds = useMemo(
    () =>
      filteredQuestions
        .filter((question) => isManageable(question, viewerId, isAdmin))
        .map((question) => question.id),
    [filteredQuestions, isAdmin, viewerId],
  );

  const allVisibleManageableSelected =
    visibleManageableIds.length > 0 &&
    visibleManageableIds.every((id) => selectedIds.includes(id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleManageableSelected) {
        return prev.filter((id) => !visibleManageableIds.includes(id));
      }

      return Array.from(new Set([...prev, ...visibleManageableIds]));
    });
  }

  function handleImport(bankQuestionId: string) {
    if (!examId) {
      setError(
        importUnavailableMessage ?? "Импорт хийх шалгалт сонгогдоогүй байна",
      );
      return;
    }

    setError(null);
    setWarning(null);
    startTransition(() => {
      void (async () => {
        const result = await importQuestionFromBank(examId, bankQuestionId);
        if (result?.error) {
          setError(result.error);
          return;
        }

        setLastImportedId(bankQuestionId);
        setWarning(result?.warning ?? null);
        router.refresh();
      })();
    });
  }

  function applyBulkUpdate(payload: {
    visibility?: QuestionBankVisibility;
    difficulty?: Difficulty;
  }) {
    if (selectedIds.length === 0) {
      setError("Bulk update хийхийн өмнө дор хаяж 1 асуулт сонгоно уу.");
      return;
    }

    setError(null);
    setWarning(null);
    startTransition(() => {
      void (async () => {
        const result = await bulkUpdateQuestionBankItems(selectedIds, payload);
        if (result?.error) {
          setError(result.error);
          return;
        }

        if (payload.visibility) {
          setBulkVisibility("__none");
        }
        if (payload.difficulty) {
          setBulkDifficulty("__none");
        }
        setSelectedIds([]);
        router.refresh();
      })();
    });
  }

  function handleDelete(questionId: string) {
    setError(null);
    setWarning(null);
    startTransition(() => {
      void (async () => {
        const result = await deleteQuestionBankItem(questionId);
        if (result?.error) {
          setError(result.error);
          return;
        }

        setSelectedIds((prev) => prev.filter((id) => id !== questionId));
        router.refresh();
      })();
    });
  }
  return (
    <div className="space-y-6">
      {examId && examTitle ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium">Import mode идэвхтэй</p>
              <p className="text-sm text-muted-foreground">
                Асуултуудыг <span className="font-medium">{examTitle}</span>{" "}
                шалгалт руу шууд оруулна.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/educator/exams/${examId}/questions`}>
                Шалгалт руу буцах
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : importUnavailableMessage ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {importUnavailableMessage}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Нийт асуулт"
          value={summary.total}
          bgColor="bg-[#4F9DF7]"
          darkColor="bg-[#2F6BD7]"
        />

        <StatCard
          title="Удирдаж болох"
          value={summary.manageable}
          bgColor="bg-[#A855F7]"
          darkColor="bg-[#7E22CE]"
        />

        <StatCard
          title="Хуваалцсан / Curated"
          value={summary.shared_subject_count + summary.admin_curated_count}
          bgColor="bg-[#06B6D4]"
          darkColor="bg-[#0891B2]"
        />

        <StatCard
          title="Сүүлийн 30 хоног"
          value={summary.recently_used_count}
          bgColor="bg-[#FB923C]"
          darkColor="bg-[#EA580C]"
        />

        <StatCard
          title="Нийт ашиглалт"
          value={summary.total_usage_count}
          bgColor="bg-[#6366F1]"
          darkColor="bg-[#4338CA]"
        />
      </div>

      <div className="">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Хайх"
              className="h-11 rounded-2xl border-0 bg-muted pl-11 shadow-none font-medium"
            />
          </label>
          <label className="relative block">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-11 w-full appearance-none rounded-2xl border-0 bg-muted px-4 pr-10 text-sm shadow-none font-medium outline-none"
            >
              <option value="all">Бүх төрөл</option>
              <option value="multiple_choice">Сонголтот</option>
              <option value="multiple_response">Олон зөв</option>
              <option value="essay">Нээлттэй</option>
              <option value="fill_blank">Цоорхой</option>
              <option value="matching">Холбох</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>
          <label className="relative block">
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
              className="h-11 w-full appearance-none rounded-2xl font-medium border-0 bg-muted px-4 pr-10 text-sm shadow-none outline-none"
            >
              <option value="all">Бүх түвшин</option>
              <option value="easy">Хялбар</option>
              <option value="medium">Дунд</option>
              <option value="hard">Хэцүү</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>
          <label className="relative block">
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              className="h-11 w-full appearance-none font-medium rounded-2xl border-0 bg-muted px-4 pr-10 text-sm shadow-none outline-none"
            >
              <option value="all">Бүх хичээл</option>
              {availableSubjects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>

            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>
          <label className="relative block">
            <select
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value)}
              className="h-11 w-full appearance-none rounded-2xl font-medium border-0 bg-muted px-4 pr-10 text-sm shadow-none outline-none"
            >
              <option value="all">Бүх төлөв</option>
              <option value="private">Хувийн</option>
              <option value="shared_subject">Хичээлийн дундын</option>
              <option value="admin_curated">Баталгаажсан сан</option>
              <option value="archived">Архив</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>
        </div>

        {/* <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <p>
              {filteredQuestions.length} / {questions.length} асуулт харагдаж
              байна
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Хувийн {summary.private_count}</Badge>
              <Badge variant="secondary">
                Хуваалцсан {summary.shared_subject_count}
              </Badge>
              <Badge>Curated {summary.admin_curated_count}</Badge>
              <Badge variant="outline">Архив {summary.archived_count}</Badge>
            </div>
          </div>

          <div className="max-w-sm">
            <Input
              value={tagQuery}
              onChange={(event) => setTagQuery(event.target.value)}
              placeholder="Tag шүүх..."
              className="h-10 rounded-2xl border-0 bg-muted shadow-none"
            />
          </div> */}

        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      {warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {warning}
        </div>
      )}

      {/* {visibleManageableIds.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allVisibleManageableSelected}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4"
                  />
                  Харагдаж буй удирдах боломжтой асуултуудыг бүгдийг сонгох
                </label>
                <Badge variant="outline">{selectedIds.length} сонгосон</Badge>
              </div>
              {selectedIds.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSelectedIds([])}
                >
                  Сонголт цэвэрлэх
                </Button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <select
                value={bulkVisibility}
                onChange={(event) => setBulkVisibility(event.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="__none">Төлөв бөөнөөр солих</option>
                <option value="private">Хувийн</option>
                <option value="shared_subject">Хичээлийн дундын</option>
                {isAdmin && (
                  <option value="admin_curated">Баталгаажсан сан</option>
                )}
                <option value="archived">Архив</option>
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={
                  isPending ||
                  bulkVisibility === "__none" ||
                  selectedIds.length === 0
                }
                onClick={() =>
                  applyBulkUpdate({
                    visibility: bulkVisibility as QuestionBankVisibility,
                  })
                }
              >
                Төлөв шинэчлэх
              </Button>
              <select
                value={bulkDifficulty}
                onChange={(event) => setBulkDifficulty(event.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="__none">Түвшин бөөнөөр солих</option>
                <option value="easy">Хялбар</option>
                <option value="medium">Дунд</option>
                <option value="hard">Хэцүү</option>
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={
                  isPending ||
                  bulkDifficulty === "__none" ||
                  selectedIds.length === 0
                }
                onClick={() =>
                  applyBulkUpdate({
                    difficulty: bulkDifficulty as Difficulty,
                  })
                }
              >
                Түвшин шинэчлэх
              </Button>
            </div>
          </CardContent>
        </Card>
      )} */}

      {filteredQuestions.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          Шүүлтэд тохирох асуулт олдсонгүй.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuestions.map((question, idx) => {
            const canManage = isManageable(question, viewerId, isAdmin);
            const hasSubjectMismatch = Boolean(
              targetExamSubjectId &&
              question.subject_id &&
              question.subject_id !== targetExamSubjectId,
            );
            const canImport =
              question.visibility !== "archived" && !hasSubjectMismatch;

            return (
              <Card
                key={question.id}
                className="overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
              >
                <CardContent className="flex gap-4 p-1">
                  {canManage ? (
                    <label className=" flex items-start "></label>
                  ) : null}

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="rounded-full border border-[#D0D0D0] bg-white px-2.5 py-3 text-[13px] font-medium text-black shadow-none"
                        >
                          {typeLabels[question.type] ?? question.type}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`rounded-full px-2.5 py-3 text-[13px] font-medium shadow-none ${getDifficultyBadgeClassName(question.difficulty)}`}
                        >
                          {difficultyLabels[question.difficulty]}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full border-transparent bg-[#E6E6E6] px-2.5 py-3 text-[13px] font-medium text-black shadow-none"
                        >
                          {question.points} оноо
                        </Badge>
                        {lastImportedId === question.id && (
                          <Badge className="rounded-full px-6 py-2 text-base">
                            Импорт хийсэн
                          </Badge>
                        )}
                      </div>
                      <div className="flex shrink-0 items-start gap-4">
                        {canManage ? (
                          <>
                            <EditQuestionBankDialog
                              question={question}
                              subjects={subjects}
                              canAdminCurate={isAdmin}
                              trigger={
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-9 w-9 rounded-full text-slate-600 hover:bg-slate-100"
                                >
                                  <Pencil className="h-4 w-4" />
                                  <span className="sr-only">Засах</span>
                                </Button>
                              }
                            />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-9 w-9 rounded-full text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Устгах</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Энэ бичлэгийг устгах уу?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Асуултын сангаас бүр мөсөн устгана.
                                    Шалгалтад өмнө импортолсон хувилбарууд
                                    устахгүй.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Болих</AlertDialogCancel>
                                  <AlertDialogAction
                                    variant="destructive"
                                    onClick={() => handleDelete(question.id)}
                                    disabled={isPending}
                                  >
                                    {isPending ? "Устгаж байна..." : "Устгах"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex min-w-0 items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start gap-2 text-[13px] font-semibold text-foreground">
                          <span className="shrink-0">{idx + 1}.</span>
                          <MathContent
                            html={question.content_html}
                            text={question.content}
                            className="min-w-0 flex-1 break-words [&_p]:m-0 [&_p]:whitespace-normal"
                          />
                        </div>
                      </div>
                    </div>
                    {examId && !importUnavailableMessage ? (
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleImport(question.id)}
                          disabled={isPending || !canImport}
                          variant={canImport ? "default" : "outline"}
                        >
                          {question.visibility === "archived"
                            ? "Архивласан"
                            : hasSubjectMismatch
                              ? "Хичээл таарахгүй"
                              : isPending
                                ? "Импорт..."
                                : "Шалгалт руу оруулах"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
