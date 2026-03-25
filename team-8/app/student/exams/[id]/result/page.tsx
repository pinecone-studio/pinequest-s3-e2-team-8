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

export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = await params;
  const data = await getExamResult(examId);

  if (!data) redirect("/student/exams");

  const totalScore = data.total_score ?? 0;
  const maxScore = data.max_score ?? 0;
  const percentage =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const passingScore = data.exams?.passing_score ?? 60;
  const passed = percentage >= passingScore;
  const isGraded = data.status === "graded";

  const answers = data.answers ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {/* Ерөнхий дүн */}
      <Card className="text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Шалгалтын үр дүн</CardTitle>
          {data.exams?.title && (
            <p className="text-muted-foreground">{data.exams.title}</p>
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
                    <MathContent text={String(q.content ?? "")} />
                  </div>

                  {/* Сурагчийн хариулт */}
                  <div className="rounded bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Таны хариулт: </span>
                    <span className={`font-medium ${
                      isEssay ? "" : isCorrect ? "text-green-700" : "text-red-700"
                    }`}>
                      {String(ans.answer || "Хариулаагүй")}
                    </span>
                  </div>

                  {/* Зөв хариулт (буруу үед) */}
                  {!isEssay && !isCorrect && q?.correct_answer && (
                    <div className="rounded bg-green-50 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Зөв хариулт: </span>
                      <span className="font-medium text-green-700">
                        {typeof q.correct_answer === "string"
                          ? String(q.correct_answer).replace(/^"|"$/g, "")
                          : JSON.stringify(q.correct_answer)}
                      </span>
                    </div>
                  )}

                  {/* Тайлбар */}
                  {q?.explanation && (
                    <p className="text-xs text-muted-foreground italic">
                      {String(q.explanation)}
                    </p>
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
