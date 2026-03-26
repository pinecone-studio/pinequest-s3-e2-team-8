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
    return [];
  }
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
  const totalScore = data.total_score ?? 0;
  const maxScore = data.max_score ?? 0;
  const percentage =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const passingScore = examMeta?.passing_score ?? 60;
  const passed = percentage >= passingScore;
  const isGraded = data.status === "graded";

  const answers = data.answers ?? [];

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
              passed
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
                passed ? "text-green-600" : "text-red-600"
              }`}
            >
              {passed ? "Тэнцсэн" : "Тэнцээгүй"}
            </p>
          </div>

          {!isGraded && (
            <p className="text-sm text-muted-foreground">
              Нээлттэй хариулт (essay) асуултуудыг багш шалгасны дараа эцсийн
              оноо өөрчлөгдөж болно.
            </p>
          )}
          {isGraded && (
            <p className="text-sm font-medium text-green-600">
              ✓ Багш шалгаж дүн баталгаажсан
            </p>
          )}
        </CardContent>
      </Card>

      {/* Асуулт бүрийн хариулт */}
      {answers.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Асуулт бүрийн дүн</h3>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(answers as any[]).map((ans, idx: number) => {
            const q = Array.isArray(ans.questions)
              ? ans.questions[0]
              : ans.questions;
            if (!q) return null;

            const isEssay: boolean = q.type === "essay";
            const isCorrect: boolean | null = ans.is_correct ?? null;
            const score: number = Number(ans.score ?? 0);
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

                  {isEssay && !isGraded && (
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
