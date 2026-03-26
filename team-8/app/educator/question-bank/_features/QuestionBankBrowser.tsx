"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkUpdateQuestionBankItems,
  importQuestionFromBank,
} from "@/lib/question/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
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

const visibilityLabels: Record<QuestionBankVisibility, string> = {
  private: "Хувийн",
  shared_subject: "Хичээлийн дундын",
  admin_curated: "Баталгаажсан сан",
  archived: "Архив",
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

function isManageable(
  question: QuestionBank,
  viewerId: string | null,
  isAdmin: boolean
) {
  if (question.visibility === "admin_curated") {
    return isAdmin;
  }

  return isAdmin || question.created_by === viewerId;
}

function getVisibilityBadgeVariant(
  visibility: QuestionBankVisibility
): "default" | "secondary" | "outline" {
  if (visibility === "admin_curated") return "default";
  if (visibility === "shared_subject") return "secondary";
  if (visibility === "archived") return "outline";
  return "outline";
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
    importUnavailableMessage ?? null
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [lastImportedId, setLastImportedId] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTagQuery = tagQuery.trim().toLowerCase();
  const availableSubjects = useMemo(
    () =>
      Array.from(
        new Map(subjects.map((subject) => [subject.id, subject.name])).entries()
      ).sort((a, b) => a[1].localeCompare(b[1], "mn")),
    [subjects]
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
    [filteredQuestions, isAdmin, viewerId]
  );

  const allVisibleManageableSelected =
    visibleManageableIds.length > 0 &&
    visibleManageableIds.every((id) => selectedIds.includes(id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

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
        importUnavailableMessage ?? "Импорт хийх шалгалт сонгогдоогүй байна"
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
        <Card>
          <CardContent className="space-y-1 pt-4">
            <p className="text-sm text-muted-foreground">Нийт асуулт</p>
            <p className="text-2xl font-semibold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-4">
            <p className="text-sm text-muted-foreground">Удирдаж болох</p>
            <p className="text-2xl font-semibold">{summary.manageable}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-4">
            <p className="text-sm text-muted-foreground">
              Хуваалцсан / Curated
            </p>
            <p className="text-2xl font-semibold">
              {summary.shared_subject_count + summary.admin_curated_count}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-4">
            <p className="text-sm text-muted-foreground">Сүүлийн 30 хоног</p>
            <p className="text-2xl font-semibold">
              {summary.recently_used_count}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-4">
            <p className="text-sm text-muted-foreground">Нийт ашиглалт</p>
            <p className="text-2xl font-semibold">
              {summary.total_usage_count}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Агуулга, тайлбар, tag хайх..."
            />
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="all">Бүх төрөл</option>
              <option value="multiple_choice">Сонголтот</option>
              <option value="multiple_response">Олон зөв</option>
              <option value="essay">Нээлттэй</option>
              <option value="fill_blank">Цоорхой</option>
              <option value="matching">Холбох</option>
            </select>
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="all">Бүх түвшин</option>
              <option value="easy">Хялбар</option>
              <option value="medium">Дунд</option>
              <option value="hard">Хэцүү</option>
            </select>
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="all">Бүх хичээл</option>
              {availableSubjects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="all">Бүх төлөв</option>
              <option value="private">Хувийн</option>
              <option value="shared_subject">Хичээлийн дундын</option>
              <option value="admin_curated">Баталгаажсан сан</option>
              <option value="archived">Архив</option>
            </select>
            <Input
              value={tagQuery}
              onChange={(event) => setTagQuery(event.target.value)}
              placeholder="Tag шүүх..."
            />
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
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

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {warning}
        </div>
      )}

      {visibleManageableIds.length > 0 && (
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
      )}

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
                question.subject_id !== targetExamSubjectId
            );
            const canImport =
              question.visibility !== "archived" && !hasSubjectMismatch;

            return (
              <Card key={question.id}>
                <CardContent className="flex items-start gap-4 pt-4">
                  {canManage ? (
                    <label className="mt-1 flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(question.id)}
                        onChange={() => toggleSelected(question.id)}
                        className="h-4 w-4"
                      />
                    </label>
                  ) : (
                    <span className="mt-1 h-4 w-4 rounded-full border border-dashed border-muted-foreground/40" />
                  )}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div className="flex-1 space-y-2">
                    <MathContent
                      html={question.content_html}
                      text={question.content}
                      className="prose prose-sm max-w-none text-foreground"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {typeLabels[question.type] ?? question.type}
                      </Badge>
                      <Badge variant="outline">{question.points} оноо</Badge>
                      {question.subjects?.name && (
                        <Badge variant="secondary">{question.subjects.name}</Badge>
                      )}
                      <Badge variant="secondary">
                        {difficultyLabels[question.difficulty]}
                      </Badge>
                      <Badge
                        variant={getVisibilityBadgeVariant(question.visibility)}
                      >
                        {visibilityLabels[question.visibility]}
                      </Badge>
                      {question.image_url && (
                        <Badge variant="outline" className="text-xs">
                          Зурагтай
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="text-xs text-muted-foreground"
                      >
                        {question.usage_count ?? 0} удаа ашигласан
                      </Badge>
                      {lastImportedId === question.id && (
                        <Badge>Импорт хийсэн</Badge>
                      )}
                    </div>
                    {Array.isArray(question.tags) && question.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {question.tags.map((tag) => (
                          <Badge
                            key={`${question.id}-${tag}`}
                            variant="secondary"
                            className="text-xs"
                          >
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {question.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={question.image_url}
                        alt="Асуултын зураг"
                        className="max-h-56 rounded-lg border"
                      />
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>
                        Шинэчилсэн:{" "}
                        {formatDateTimeUB(
                          question.updated_at ?? question.created_at
                        )}
                      </span>
                      <span>
                        Сүүлд ашигласан:{" "}
                        {question.last_used_at
                          ? formatDateTimeUB(question.last_used_at)
                          : "Ашиглаагүй"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {canManage ? (
                      <EditQuestionBankDialog
                        question={question}
                        subjects={subjects}
                        canAdminCurate={isAdmin}
                      />
                    ) : null}
                    {examId && !importUnavailableMessage ? (
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
