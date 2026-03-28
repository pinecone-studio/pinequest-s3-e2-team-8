"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  importQuestionFromBank,
  importSampleExamToExam,
} from "@/lib/question/actions";
import type { QuestionBank, SampleExam, Subject } from "@/types";
import MathContent from "@/components/math/MathContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const typeLabels: Record<string, string> = {
  multiple_choice: "Сонголтот",
  multiple_response: "Олон зөв",
  essay: "Нээлттэй",
  fill_blank: "Нөхөх",
  matching: "Холбох",
};

const difficultyLabels: Record<number, string> = {
  1: "Хөнгөн",
  2: "Дунд",
  3: "Хүнд",
};

interface QuestionBankBrowserProps {
  certifiedQuestions: QuestionBank[];
  sampleExams: SampleExam[];
  subjects: Subject[];
  examId?: string;
  examTitle?: string;
  targetExamSubjectId?: string;
  importUnavailableMessage?: string | null;
}

type TabKey = "sample" | "bank";

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right, "mn"));
}

export default function QuestionBankBrowser({
  certifiedQuestions,
  sampleExams,
  subjects,
  examId,
  examTitle,
  targetExamSubjectId,
  importUnavailableMessage,
}: QuestionBankBrowserProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<TabKey>("sample");
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [subtopicFilter, setSubtopicFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(
    importUnavailableMessage ?? null
  );
  const [lastImportedQuestionId, setLastImportedQuestionId] = useState<string | null>(null);
  const [lastImportedSampleId, setLastImportedSampleId] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const subjectOptions = useMemo(
    () =>
      Array.from(
        new Map(subjects.map((subject) => [subject.id, subject.name])).entries()
      ).sort((left, right) => left[1].localeCompare(right[1], "mn")),
    [subjects]
  );

  const gradeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...certifiedQuestions.map((question) => question.grade_level),
            ...sampleExams.map((sampleExam) => sampleExam.grade_level),
          ].filter((grade): grade is number => Boolean(grade))
        )
      ).sort((left, right) => left - right),
    [certifiedQuestions, sampleExams]
  );

  const subtopicOptions = useMemo(
    () =>
      uniqueValues([
        ...certifiedQuestions.map((question) => question.subtopic),
        ...sampleExams.map((sampleExam) => sampleExam.subtopic),
      ]),
    [certifiedQuestions, sampleExams]
  );

  const filteredSampleExams = useMemo(() => {
    return sampleExams.filter((sampleExam) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        sampleExam.title.toLowerCase().includes(normalizedQuery) ||
        (sampleExam.description ?? "").toLowerCase().includes(normalizedQuery) ||
        (sampleExam.subtopic ?? "").toLowerCase().includes(normalizedQuery) ||
        (sampleExam.subjects?.name ?? "").toLowerCase().includes(normalizedQuery);

      const matchesSubject =
        subjectFilter === "all" || sampleExam.subject_id === subjectFilter;
      const matchesGrade =
        gradeFilter === "all" || String(sampleExam.grade_level) === gradeFilter;
      const matchesSubtopic =
        subtopicFilter === "all" || sampleExam.subtopic === subtopicFilter;
      const matchesDifficulty =
        difficultyFilter === "all" ||
        String(sampleExam.difficulty_level) === difficultyFilter;

      return (
        matchesQuery &&
        matchesSubject &&
        matchesGrade &&
        matchesSubtopic &&
        matchesDifficulty
      );
    });
  }, [
    difficultyFilter,
    gradeFilter,
    normalizedQuery,
    sampleExams,
    subjectFilter,
    subtopicFilter,
  ]);

  const filteredCertifiedQuestions = useMemo(() => {
    return certifiedQuestions.filter((question) => {
      const tags = Array.isArray(question.tags) ? question.tags : [];
      const matchesQuery =
        normalizedQuery.length === 0 ||
        question.content.toLowerCase().includes(normalizedQuery) ||
        (question.explanation ?? "").toLowerCase().includes(normalizedQuery) ||
        (question.subtopic ?? "").toLowerCase().includes(normalizedQuery) ||
        (question.subjects?.name ?? "").toLowerCase().includes(normalizedQuery) ||
        tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));

      const matchesSubject =
        subjectFilter === "all" || question.subject_id === subjectFilter;
      const matchesGrade =
        gradeFilter === "all" || String(question.grade_level ?? "") === gradeFilter;
      const matchesSubtopic =
        subtopicFilter === "all" || question.subtopic === subtopicFilter;
      const matchesDifficulty =
        difficultyFilter === "all" ||
        String(question.difficulty_level) === difficultyFilter;
      const matchesType = typeFilter === "all" || question.type === typeFilter;

      return (
        matchesQuery &&
        matchesSubject &&
        matchesGrade &&
        matchesSubtopic &&
        matchesDifficulty &&
        matchesType
      );
    });
  }, [
    certifiedQuestions,
    difficultyFilter,
    gradeFilter,
    normalizedQuery,
    subjectFilter,
    subtopicFilter,
    typeFilter,
  ]);

  function handleImportQuestion(questionId: string) {
    if (!examId) return;

    setMessage(null);
    startTransition(() => {
      void (async () => {
        const result = await importQuestionFromBank(examId, questionId);
        if (result?.error) {
          setMessage(result.error);
          return;
        }

        setLastImportedQuestionId(questionId);
        setLastImportedSampleId(null);
        router.refresh();
      })();
    });
  }

  function handleImportSampleExam(sampleExamId: string) {
    if (!examId) return;

    setMessage(null);
    startTransition(() => {
      void (async () => {
        const result = await importSampleExamToExam(examId, sampleExamId);
        if (result?.error) {
          setMessage(result.error);
          return;
        }

        setLastImportedSampleId(sampleExamId);
        setLastImportedQuestionId(null);
        router.refresh();
      })();
    });
  }

  return (
    <div className="space-y-5">
      {examId && examTitle ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium">Шалгалт руу оруулах горим</p>
              <p className="text-sm text-muted-foreground">{examTitle}</p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/educator/exams/${examId}/questions`}>
                Шалгалт руу буцах
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={tab === "sample" ? "default" : "outline"}
          onClick={() => setTab("sample")}
        >
          Жишиг шалгалт
        </Button>
        <Button
          type="button"
          variant={tab === "bank" ? "default" : "outline"}
          onClick={() => setTab("bank")}
        >
          Баталгаажсан сан
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="relative block xl:col-span-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Хайх"
            className="pl-10"
          />
        </label>

        <select
          value={subjectFilter}
          onChange={(event) => setSubjectFilter(event.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">Бүх хичээл</option>
          {subjectOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={gradeFilter}
          onChange={(event) => setGradeFilter(event.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">Бүх анги</option>
          {gradeOptions.map((grade) => (
            <option key={grade} value={String(grade)}>
              {grade}-р анги
            </option>
          ))}
        </select>

        <select
          value={subtopicFilter}
          onChange={(event) => setSubtopicFilter(event.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">Бүх дэд сэдэв</option>
          {subtopicOptions.map((subtopic) => (
            <option key={subtopic} value={subtopic}>
              {subtopic}
            </option>
          ))}
        </select>

        <select
          value={difficultyFilter}
          onChange={(event) => setDifficultyFilter(event.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">Бүх түвшин</option>
          <option value="1">1 · Хөнгөн</option>
          <option value="2">2 · Дунд</option>
          <option value="3">3 · Хүнд</option>
        </select>

        {tab === "bank" && (
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Бүх төрөл</option>
            <option value="multiple_choice">Сонголтот</option>
            <option value="multiple_response">Олон зөв</option>
            <option value="essay">Нээлттэй</option>
            <option value="fill_blank">Нөхөх</option>
            <option value="matching">Холбох</option>
          </select>
        )}
      </div>

      {message && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          {message}
        </div>
      )}

      {tab === "sample" ? (
        filteredSampleExams.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Жишиг шалгалт олдсонгүй.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSampleExams.map((sampleExam) => {
              const hasSubjectMismatch = Boolean(
                targetExamSubjectId &&
                  sampleExam.subject_id &&
                  sampleExam.subject_id !== targetExamSubjectId
              );

              return (
                <Card key={sampleExam.id}>
                  <CardContent className="space-y-4 pt-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <h3 className="font-semibold">{sampleExam.title}</h3>
                        <div className="flex flex-wrap gap-2">
                          {sampleExam.subjects?.name && (
                            <Badge variant="outline">{sampleExam.subjects.name}</Badge>
                          )}
                          <Badge variant="outline">
                            {sampleExam.grade_level}-р анги
                          </Badge>
                          {sampleExam.subtopic && (
                            <Badge variant="outline">{sampleExam.subtopic}</Badge>
                          )}
                          <Badge variant="secondary">
                            {difficultyLabels[sampleExam.difficulty_level]}
                          </Badge>
                          <Badge variant="outline">
                            {sampleExam.duration_minutes} минут
                          </Badge>
                          <Badge variant="outline">
                            {sampleExam.question_count} асуулт
                          </Badge>
                        </div>
                        {sampleExam.description && (
                          <p className="text-sm text-muted-foreground">
                            {sampleExam.description}
                          </p>
                        )}
                      </div>

                      {examId ? (
                        <Button
                          type="button"
                          onClick={() => handleImportSampleExam(sampleExam.id)}
                          disabled={isPending || hasSubjectMismatch}
                          variant={hasSubjectMismatch ? "outline" : "default"}
                        >
                          {lastImportedSampleId === sampleExam.id
                            ? "Оруулсан"
                            : hasSubjectMismatch
                              ? "Хичээл таарахгүй"
                              : isPending
                                ? "Оруулж байна..."
                                : "Шалгалт руу оруулах"}
                        </Button>
                      ) : null}
                    </div>

                    {sampleExam.sample_exam_items && sampleExam.sample_exam_items.length > 0 && (
                      <details className="rounded-lg border bg-muted/10 p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                          Агуулга харах
                        </summary>
                        <div className="mt-3 space-y-3">
                          {sampleExam.sample_exam_items
                            .sort((left, right) => left.order_index - right.order_index)
                            .map((item, index) => (
                              <div key={item.id} className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="font-medium">{index + 1}.</span>
                                  {item.question_bank?.type && (
                                    <Badge variant="outline">
                                      {typeLabels[item.question_bank.type] ?? item.question_bank.type}
                                    </Badge>
                                  )}
                                  {item.question_bank?.points ? (
                                    <Badge variant="outline">
                                      {item.question_bank.points} оноо
                                    </Badge>
                                  ) : null}
                                </div>
                                {item.question_bank && (
                                  <MathContent
                                    html={item.question_bank.content_html}
                                    text={item.question_bank.content}
                                    className="prose prose-sm max-w-none text-foreground"
                                  />
                                )}
                              </div>
                            ))}
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : filteredCertifiedQuestions.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Баталгаажсан бодлого олдсонгүй.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCertifiedQuestions.map((question) => {
            const hasSubjectMismatch = Boolean(
              targetExamSubjectId &&
                question.subject_id &&
                question.subject_id !== targetExamSubjectId
            );

            return (
              <Card key={question.id}>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {question.subjects?.name && (
                        <Badge variant="outline">{question.subjects.name}</Badge>
                      )}
                      {question.grade_level && (
                        <Badge variant="outline">{question.grade_level}-р анги</Badge>
                      )}
                      {question.subtopic && (
                        <Badge variant="outline">{question.subtopic}</Badge>
                      )}
                      <Badge variant="outline">
                        {typeLabels[question.type] ?? question.type}
                      </Badge>
                      <Badge variant="secondary">
                        {difficultyLabels[question.difficulty_level]}
                      </Badge>
                      <Badge variant="outline">{question.points} оноо</Badge>
                    </div>

                    {examId ? (
                      <Button
                        type="button"
                        onClick={() => handleImportQuestion(question.id)}
                        disabled={isPending || hasSubjectMismatch}
                        variant={hasSubjectMismatch ? "outline" : "default"}
                      >
                        {lastImportedQuestionId === question.id
                          ? "Оруулсан"
                          : hasSubjectMismatch
                            ? "Хичээл таарахгүй"
                            : isPending
                              ? "Оруулж байна..."
                              : "Шалгалт руу оруулах"}
                      </Button>
                    ) : null}
                  </div>

                  <MathContent
                    html={question.content_html}
                    text={question.content}
                    className="prose prose-sm max-w-none text-foreground"
                  />

                  {question.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={question.image_url}
                      alt="Асуултын зураг"
                      className="max-h-56 rounded-lg border"
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
