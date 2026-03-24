"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importQuestionFromBank } from "@/lib/question/actions";
import type { QuestionBank, Subject } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import MathContent from "@/components/math/MathContent";
import EditQuestionBankDialog from "./EditQuestionBankDialog";

const typeLabels: Record<string, string> = {
  multiple_choice: "Сонголтот",
  true_false: "Үнэн/Худал",
  essay: "Нээлттэй",
  fill_blank: "Цоорхой",
};

interface QuestionBankBrowserProps {
  questions: QuestionBank[];
  subjects: Subject[];
  examId?: string;
  examTitle?: string;
  importUnavailableMessage?: string | null;
}

export default function QuestionBankBrowser({
  questions,
  subjects,
  examId,
  examTitle,
  importUnavailableMessage,
}: QuestionBankBrowserProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [tagQuery, setTagQuery] = useState("");
  const [error, setError] = useState<string | null>(importUnavailableMessage ?? null);
  const [lastImportedId, setLastImportedId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTagQuery = tagQuery.trim().toLowerCase();
  const availableSubjects = Array.from(
    new Set(
      questions
        .map((question) => question.subjects?.name?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b, "mn"));

  const filteredQuestions = questions.filter((question) => {
    const tags = Array.isArray(question.tags) ? question.tags : [];
    const subjectName = question.subjects?.name ?? null;
    const matchesQuery =
      normalizedQuery.length === 0 ||
      question.content.toLowerCase().includes(normalizedQuery) ||
      (question.explanation ?? "").toLowerCase().includes(normalizedQuery) ||
      tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)) ||
      (subjectName ?? "").toLowerCase().includes(normalizedQuery);

    const matchesType =
      typeFilter === "all" || question.type === typeFilter;
    const matchesDifficulty =
      difficultyFilter === "all" || question.difficulty === difficultyFilter;
    const matchesSubject =
      subjectFilter === "all" || subjectName === subjectFilter;
    const matchesTag =
      normalizedTagQuery.length === 0 ||
      tags.some((tag) =>
        tag.toLowerCase().includes(normalizedTagQuery)
      );

    return (
      matchesQuery &&
      matchesType &&
      matchesDifficulty &&
      matchesSubject &&
      matchesTag
    );
  });

  function handleImport(bankQuestionId: string) {
    if (!examId) {
      setError(importUnavailableMessage ?? "Импорт хийх шалгалт сонгогдоогүй байна");
      return;
    }

    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await importQuestionFromBank(examId, bankQuestionId);
        if (result?.error) {
          setError(result.error);
          return;
        }

        setLastImportedId(bankQuestionId);
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
                Асуултуудыг <span className="font-medium">{examTitle}</span> шалгалт руу шууд оруулна.
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

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 md:grid-cols-5">
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
              <option value="true_false">Үнэн/Худал</option>
              <option value="essay">Нээлттэй</option>
              <option value="fill_blank">Цоорхой</option>
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
              {availableSubjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
            <Input
              value={tagQuery}
              onChange={(event) => setTagQuery(event.target.value)}
              placeholder="Tag шүүх..."
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {filteredQuestions.length} / {questions.length} асуулт харагдаж байна
          </p>
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {filteredQuestions.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          Шүүлтэд тохирох асуулт олдсонгүй.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuestions.map((question, idx) => (
            <Card key={question.id}>
              <CardContent className="flex items-start gap-4 pt-4">
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
                    <Badge variant="secondary">{question.difficulty}</Badge>
                    {question.image_url && (
                      <Badge variant="outline" className="text-xs">
                        Зурагтай
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {question.usage_count ?? 0} удаа ашигласан
                    </Badge>
                    {lastImportedId === question.id && (
                      <Badge>Импорт хийсэн</Badge>
                    )}
                  </div>
                  {Array.isArray(question.tags) && question.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {question.tags.map((tag) => (
                        <Badge key={`${question.id}-${tag}`} variant="secondary" className="text-xs">
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
                  <p className="text-xs text-muted-foreground">
                    {new Date(question.updated_at ?? question.created_at).toLocaleDateString("mn-MN")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <EditQuestionBankDialog
                    question={question}
                    subjects={subjects}
                  />
                  {examId && !importUnavailableMessage ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleImport(question.id)}
                      disabled={isPending}
                    >
                      {isPending ? "Импорт..." : "Шалгалт руу оруулах"}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
