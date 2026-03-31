"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import MathContent from "@/components/math/MathContent";
import { submitStudentPracticeExam } from "@/lib/student-learning/actions";
import type { StudentPracticeQuestionForTake } from "@/types";

function parseStoredArray(value: string | undefined) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function parseMatchingOptions(options: string[] | null | undefined) {
  return (options ?? [])
    .map((option) => {
      const [left, ...rightParts] = String(option).split("|||");
      const right = rightParts.join("|||");
      if (!left || !right) return null;
      return { left, right };
    })
    .filter((item): item is { left: string; right: string } => Boolean(item));
}

function normalizeDraftAnswer(questionType: string, answer: string) {
  if (questionType === "multiple_choice") {
    return answer.trim() ? answer : null;
  }

  if (questionType === "essay" || questionType === "fill_blank") {
    return answer.trim() ? answer : null;
  }

  if (questionType === "multiple_response") {
    const nextAnswers = parseStoredArray(answer).filter((item) => item.trim());
    return nextAnswers.length > 0 ? JSON.stringify(nextAnswers) : null;
  }

  if (questionType === "matching") {
    try {
      const parsed = JSON.parse(answer) as Record<string, string>;
      const filteredEntries = Object.entries(parsed).filter(
        ([, value]) => String(value ?? "").trim() !== ""
      );

      return filteredEntries.length > 0
        ? JSON.stringify(Object.fromEntries(filteredEntries))
        : null;
    } catch {
      return null;
    }
  }

  return answer.trim() ? answer : null;
}

function isQuestionAnswered(
  question: StudentPracticeQuestionForTake,
  answer: string | undefined
) {
  return normalizeDraftAnswer(question.type, answer ?? "") !== null;
}

export default function PracticeExamTaker({
  practiceExamId,
  examTitle,
  subjectName,
  questions,
}: {
  practiceExamId: string;
  examTitle: string;
  subjectName: string;
  questions: StudentPracticeQuestionForTake[];
}) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};

    const saved = window.localStorage.getItem(`student-practice:${practiceExamId}:draft`);
    if (!saved) return {};

    try {
      return JSON.parse(saved) as Record<string, string>;
    } catch {
      window.localStorage.removeItem(`student-practice:${practiceExamId}:draft`);
      return {};
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const storageKey = `student-practice:${practiceExamId}:draft`;
  const currentQuestion = questions[currentIndex] ?? questions[0] ?? null;
  const currentQuestionId = currentQuestion?.id ?? "";
  const currentMultiAnswer = parseStoredArray(answers[currentQuestionId]);
  const matchingOptions = parseMatchingOptions(currentQuestion?.options);
  const currentMatchingAnswer = (() => {
    try {
      return JSON.parse(answers[currentQuestionId] ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  })();

  const answeredCount = useMemo(
    () => questions.filter((question) => isQuestionAnswered(question, answers[question.id])).length,
    [answers, questions]
  );

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(answers));
  }, [answers, storageKey]);

  if (!currentQuestion) {
    return null;
  }

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: value,
    }));
  };

  const handleMultipleResponseToggle = (questionId: string, option: string) => {
    setAnswers((current) => {
      const selected = parseStoredArray(current[questionId]);
      const next = selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option];

      return {
        ...current,
        [questionId]: JSON.stringify(next),
      };
    });
  };

  const handleMatchingChange = (questionId: string, leftValue: string, rightValue: string) => {
    setAnswers((current) => {
      let parsed: Record<string, string> = {};
      try {
        parsed = JSON.parse(current[questionId] ?? "{}") as Record<string, string>;
      } catch {
        parsed = {};
      }

      const next = {
        ...parsed,
        [leftValue]: rightValue,
      };

      return {
        ...current,
        [questionId]: JSON.stringify(next),
      };
    });
  };

  const handleSubmit = () => {
    if (!window.confirm("Practice шалгалтаа илгээх үү?")) return;

    startTransition(async () => {
      setError(null);
      const result = await submitStudentPracticeExam(practiceExamId, answers);
      if ("error" in result) {
        setError(result.error ?? "Practice шалгалтыг илгээхэд алдаа гарлаа.");
        return;
      }

      window.localStorage.removeItem(storageKey);
      router.push(result.redirectTo);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#4078C1]">{subjectName}</p>
          <h2 className="text-2xl font-bold tracking-tight">{examTitle}</h2>
          <p className="text-sm text-muted-foreground">
            Энэ practice-ийн дүн зөвхөн таны learning hub-д хадгалагдана.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{questions.length} асуулт</Badge>
          <Badge variant="secondary">{answeredCount} хариулсан</Badge>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Асуултын жагсаалт</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-5 gap-2 xl:grid-cols-4">
            {questions.map((question, index) => {
              const answered = isQuestionAnswered(question, answers[question.id]);
              const active = index === currentIndex;
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-[#4078C1] bg-[#ECF1F9] text-[#4078C1]"
                      : answered
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "hover:bg-zinc-50"
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">Асуулт {currentIndex + 1}</CardTitle>
              {currentQuestion.subtopic && <Badge variant="outline">{currentQuestion.subtopic}</Badge>}
            </div>
            <MathContent
              html={currentQuestion.content_html}
              text={currentQuestion.content}
              className="prose prose-sm max-w-none text-zinc-900"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {currentQuestion.type === "multiple_choice" &&
              (currentQuestion.options ?? []).map((option) => (
                <label
                  key={option}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                    answers[currentQuestion.id] === option
                      ? "border-[#4078C1] bg-[#ECF1F9]"
                      : "hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`question-${currentQuestion.id}`}
                    checked={answers[currentQuestion.id] === option}
                    onChange={() => handleAnswerChange(currentQuestion.id, option)}
                  />
                  <MathContent
                    text={option}
                    className="prose prose-sm max-w-none text-zinc-900"
                  />
                </label>
              ))}

            {currentQuestion.type === "multiple_response" &&
              (currentQuestion.options ?? []).map((option) => (
                <label
                  key={option}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                    currentMultiAnswer.includes(option)
                      ? "border-[#4078C1] bg-[#ECF1F9]"
                      : "hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={currentMultiAnswer.includes(option)}
                    onChange={() => handleMultipleResponseToggle(currentQuestion.id, option)}
                  />
                  <MathContent
                    text={option}
                    className="prose prose-sm max-w-none text-zinc-900"
                  />
                </label>
              ))}

            {currentQuestion.type === "fill_blank" && (
              <input
                value={answers[currentQuestion.id] ?? ""}
                onChange={(event) => handleAnswerChange(currentQuestion.id, event.target.value)}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none ring-0"
                placeholder="Хариултаа оруулна уу"
              />
            )}

            {currentQuestion.type === "matching" && (
              <div className="space-y-3">
                {matchingOptions.map((pair) => (
                  <div
                    key={pair.left}
                    className="grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_220px]"
                  >
                    <MathContent
                      text={pair.left}
                      className="prose prose-sm max-w-none text-zinc-900"
                    />
                    <select
                      className="rounded-lg border px-3 py-2 text-sm"
                      value={currentMatchingAnswer[pair.left] ?? ""}
                      onChange={(event) =>
                        handleMatchingChange(currentQuestion.id, pair.left, event.target.value)
                      }
                    >
                      <option value="">Сонгох</option>
                      {matchingOptions.map((choice) => (
                        <option key={choice.right} value={choice.right}>
                          {choice.right}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {currentQuestion.type === "essay" && (
              <Textarea
                value={answers[currentQuestion.id] ?? ""}
                onChange={(event) => handleAnswerChange(currentQuestion.id, event.target.value)}
                placeholder="Хариултаа бичнэ үү"
                className="min-h-40"
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
                >
                  Өмнөх
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentIndex === questions.length - 1}
                  onClick={() =>
                    setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))
                  }
                >
                  Дараах
                </Button>
              </div>

              <Button type="button" disabled={isPending} onClick={handleSubmit}>
                {isPending ? "Илгээж байна..." : "Practice дуусгах"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
