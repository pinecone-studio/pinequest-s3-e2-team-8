import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getExamResult } from "@/lib/student/actions";
import MathContent from "@/components/math/MathContent";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";

function parseStringArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as string[];
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizeTextValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function areArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function parseMatchingPairs(options: unknown) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      const [left, right] = String(option).split("|||");
      if (!left || !right) return null;
      return { left, right };
    })
    .filter(
      (item): item is { left: string; right: string } => Boolean(item)
    );
}

function renderAnswerValue(
  question: Record<string, unknown>,
  rawAnswer: unknown,
  fallback = "Хариулаагүй"
) {
  const type = String(question.type ?? "");

  if (!rawAnswer || String(rawAnswer).trim() === "") {
    return (
      <span className="font-medium text-muted-foreground">{fallback}</span>
    );
  }

  if (type === "multiple_response") {
    const values = parseStringArray(rawAnswer);
    if (values.length === 0) {
      return (
        <span className="font-medium text-muted-foreground">{fallback}</span>
      );
    }

    return (
      <div className="space-y-1">
        {values.map((value) => (
          <MathContent
            key={value}
            text={value}
            className="prose prose-sm max-w-none font-medium text-foreground"
          />
        ))}
      </div>
    );
  }

  if (type === "matching") {
    try {
      const parsed = JSON.parse(String(rawAnswer)) as Record<string, string>;
      const entries = Object.entries(parsed).filter(
        ([, value]) => String(value ?? "").trim() !== ""
      );

      if (entries.length === 0) {
        return (
          <span className="font-medium text-muted-foreground">{fallback}</span>
        );
      }

      return (
        <div className="space-y-1.5">
          {entries.map(([left, right]) => (
            <div key={left} className="grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <MathContent
                text={left}
                className="prose prose-sm max-w-none font-medium text-foreground"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <MathContent
                text={right}
                className="prose prose-sm max-w-none font-medium text-foreground"
              />
            </div>
          ))}
        </div>
      );
    } catch {
      return (
        <MathContent
          text={String(rawAnswer)}
          className="prose prose-sm max-w-none font-medium text-foreground"
        />
      );
    }
  }

  return (
    <MathContent
      text={String(rawAnswer)}
      className="prose prose-sm max-w-none font-medium text-foreground"
    />
  );
}

function renderCorrectAnswer(question: Record<string, unknown>) {
  const type = String(question.type ?? "");

  if (type === "matching") {
    const pairs = parseMatchingPairs(question.options);
    if (pairs.length === 0) return null;

    return (
      <div className="space-y-1.5">
        {pairs.map((pair) => (
          <div
            key={`${pair.left}-${pair.right}`}
            className="grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
          >
            <MathContent
              text={pair.left}
              className="prose prose-sm max-w-none font-medium text-green-700"
            />
            <span className="text-xs text-green-700">→</span>
            <MathContent
              text={pair.right}
              className="prose prose-sm max-w-none font-medium text-green-700"
            />
          </div>
        ))}
      </div>
    );
  }

  if (type === "multiple_response") {
    const values = parseStringArray(question.correct_answer);
    if (values.length === 0) return null;

    return (
      <div className="space-y-1">
        {values.map((value) => (
          <MathContent
            key={value}
            text={value}
            className="prose prose-sm max-w-none font-medium text-green-700"
          />
        ))}
      </div>
    );
  }

  if (!question.correct_answer) return null;

  return (
    <MathContent
      text={String(question.correct_answer)}
      className="prose prose-sm max-w-none font-medium text-green-700"
    />
  );
}

export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = await params;
  const data = await getExamResult(examId);

  if (!data) redirect("/student/exams");

  const examMeta = Array.isArray(data.exams) ? data.exams[0] : data.exams;
  const canViewDetailedFeedback =
    Boolean(data.can_view_detailed_feedback ?? true);
  const answers = canViewDetailedFeedback ? data.answers ?? [] : [];
  const derivedAnswers = answers.map((answer) => {
    const question = Array.isArray(answer.questions)
      ? answer.questions[0]
      : answer.questions;
    if (!question) {
      return {
        ...answer,
        derivedIsCorrect: answer.is_correct ?? null,
        derivedScore: Number(answer.score ?? 0),
      };
    }

    const type = String(question.type ?? "");
    const points = Number(question.points ?? 0);

    if (type === "multiple_choice" || type === "fill_blank") {
      const isCorrect =
        normalizeTextValue(answer.answer) ===
        normalizeTextValue(question.correct_answer);
      return {
        ...answer,
        derivedIsCorrect: isCorrect,
        derivedScore: isCorrect ? points : 0,
      };
    }

    if (type === "multiple_response") {
      const submitted = parseStringArray(answer.answer)
        .map((item) => normalizeTextValue(item))
        .filter(Boolean)
        .sort();
      const expected = parseStringArray(question.correct_answer)
        .map((item) => normalizeTextValue(item))
        .filter(Boolean)
        .sort();
      const isCorrect =
        submitted.length > 0 && areArraysEqual(submitted, expected);

      return {
        ...answer,
        derivedIsCorrect: isCorrect,
        derivedScore: isCorrect ? points : 0,
      };
    }

    if (type === "matching") {
      try {
        const submitted = JSON.parse(String(answer.answer ?? "{}")) as Record<
          string,
          string
        >;
        const expected = parseMatchingPairs(question.options);
        const isCorrect =
          expected.length > 0 &&
          expected.every(
            (pair) =>
              normalizeTextValue(submitted[pair.left]) ===
              normalizeTextValue(pair.right)
          );

        return {
          ...answer,
          derivedIsCorrect: isCorrect,
          derivedScore: isCorrect ? points : 0,
        };
      } catch {
        return {
          ...answer,
          derivedIsCorrect: false,
          derivedScore: 0,
        };
      }
    }

    return {
      ...answer,
      derivedIsCorrect: answer.is_correct ?? null,
      derivedScore: Number(answer.score ?? 0),
    };
  });

  const totalScore = canViewDetailedFeedback
    ? derivedAnswers.reduce(
        (sum, answer) => sum + Number(answer.derivedScore ?? 0),
        0
      )
    : Number(data.total_score ?? 0);
  const maxScore = canViewDetailedFeedback
    ? derivedAnswers.reduce((sum, answer) => {
        const question = Array.isArray(answer.questions)
          ? answer.questions[0]
          : answer.questions;
        return sum + Number(question?.points ?? 0);
      }, 0)
    : Number(data.max_score ?? 0);
  const percentage =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const passingScore = examMeta?.passing_score ?? 60;
  const passed = percentage >= passingScore;
  const hasEssayAnswers = derivedAnswers.some((answer) => {
    const question = Array.isArray(answer.questions)
      ? answer.questions[0]
      : answer.questions;
    return question?.type === "essay";
  });
  const isFinalized =
    data.status === "graded" ||
    (data.status === "timed_out" && canViewDetailedFeedback && !hasEssayAnswers);


  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {/* Ерөнхий дүн */}
      <Card className="text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Шалгалтын үр дүн</CardTitle>
          {examMeta?.title && (
            <p className="text-muted-foreground">{examMeta.title}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`mx-auto flex h-32 w-32 items-center justify-center rounded-full text-4xl font-bold ${
              !isFinalized
                ? "bg-slate-100 text-slate-700"
                : passed
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {percentage}%
          </div>

          <div className="space-y-1">
            <p className="text-lg">
              Оноо: <span className="font-bold">{totalScore}</span> / {maxScore}
            </p>
            <p
              className={`text-lg font-semibold ${
                !isFinalized
                  ? "text-slate-600"
                  : passed
                    ? "text-green-600"
                    : "text-red-600"
              }`}
            >
              {isFinalized ? (passed ? "Тэнцсэн" : "Тэнцээгүй") : "Урьдчилсан дүн"}
            </p>
          </div>

          {!isFinalized && (
            <p className="text-sm text-muted-foreground">
              Нээлттэй хариулт (essay) асуултуудыг багш шалгасны дараа эцсийн
              оноо өөрчлөгдөж болно.
            </p>
          )}
          {!canViewDetailedFeedback && (
            <p className="text-sm text-muted-foreground">
              Танд дахин оролдох боломж үлдсэн тул одоохондоо зөв хариулт,
              тайлбар, асуулт тус бүрийн задрал харагдахгүй. Одоогийн хамгийн
              өндөр дүнг л үзүүлж байна.
            </p>
          )}
          {isFinalized && (
            <p className="text-sm font-medium text-green-600">
              ✓ Багш шалгаж дүн баталгаажсан
            </p>
          )}
          {Number(data.best_attempt_number ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              Харагдаж буй дүн: {Number(data.best_attempt_number)}-р оролдлого
              {Number(data.latest_attempt_number ?? 0) >
              Number(data.best_attempt_number ?? 0)
                ? ` · сүүлийн оролдлого ${Number(data.latest_attempt_number)}`
                : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Асуулт бүрийн хариулт */}
      {canViewDetailedFeedback && derivedAnswers.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Асуулт бүрийн дүн</h3>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(derivedAnswers as any[]).map((ans, idx: number) => {
            const q = Array.isArray(ans.questions)
              ? ans.questions[0]
              : ans.questions;
            if (!q) return null;

            const isEssay: boolean = q.type === "essay";
            const isCorrect: boolean | null = ans.derivedIsCorrect ?? ans.is_correct ?? null;
            const score: number = Number(ans.derivedScore ?? ans.score ?? 0);
            const points: number = Number(q.points ?? 0);

            return (
              <Card key={String(ans.id)} className={`border-l-4 ${
                isEssay
                  ? "border-l-blue-400"
                  : isCorrect
                  ? "border-l-green-500"
                  : "border-l-red-400"
              }`}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isEssay ? (
                        <MinusCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      ) : isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      )}
                      <span className="text-sm text-muted-foreground font-medium">
                        {idx + 1}-р асуулт
                      </span>
                    </div>
                    <span className="text-sm font-mono shrink-0">
                      {score} / {points} оноо
                    </span>
                  </div>

                  <div className="text-sm">
                    <MathContent
                      html={(q.content_html as string | null) ?? null}
                      text={String(q.content ?? "")}
                    />
                  </div>

                  {/* Сурагчийн хариулт */}
                  <div className="rounded bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Таны хариулт: </span>
                    <div
                      className={`mt-1 ${
                        isEssay ? "" : isCorrect ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {renderAnswerValue(q as Record<string, unknown>, ans.answer)}
                    </div>
                  </div>

                  {/* Зөв хариулт (буруу үед) */}
                  {!isEssay && !isCorrect && (
                    <div className="rounded bg-green-50 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Зөв хариулт: </span>
                      <div className="mt-1">{renderCorrectAnswer(q as Record<string, unknown>)}</div>
                    </div>
                  )}

                  {/* Тайлбар */}
                  {q?.explanation && (
                    <div className="text-xs italic text-muted-foreground">
                      <MathContent text={String(q.explanation)} />
                    </div>
                  )}

                  {/* Багшийн feedback (essay) */}
                  {isEssay && ans.feedback && (
                    <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
                      <span className="font-medium text-blue-700">Багшийн тайлбар: </span>
                      <span>{String(ans.feedback)}</span>
                    </div>
                  )}

                  {isEssay && !isFinalized && (
                    <Badge variant="outline" className="text-xs text-blue-600">
                      Багш шалгах хүлээгдэж байна
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Link href="/student/exams" className="flex-1">
          <Button variant="outline" className="w-full">
            Шалгалтууд руу
          </Button>
        </Link>
        <Link href="/student" className="flex-1">
          <Button className="w-full">Хянах самбар</Button>
        </Link>
      </div>
    </div>
  );
}
