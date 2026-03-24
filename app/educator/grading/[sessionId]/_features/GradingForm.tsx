"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { gradeAnswer, finalizeGrading } from "@/lib/grading/actions";
import { formatDateTimeUB } from "@/lib/utils/date";

interface GradingFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answers: any[];
}

export default function GradingForm({ session, answers }: GradingFormProps) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const a of answers) {
      if (a.score !== null) init[a.id] = a.score;
    }
    return init;
  });
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const exam = session.exams;
  const profile = session.profiles;

  const handleGrade = async (answerId: string, maxPoints: number) => {
    const score = Math.min(scores[answerId] ?? 0, maxPoints);
    setSaving(answerId);
    await gradeAnswer(answerId, score, feedbacks[answerId] || null);
    setSaving(null);
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    // Бүх шалгаагүй хариултуудыг 0 оноогоор хадгалах
    for (const a of answers) {
      if (scores[a.id] === undefined) {
        await gradeAnswer(a.id, 0, null);
      }
    }
    await finalizeGrading(session.id);
    router.push("/educator/grading");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{exam?.title}</h2>
          <p className="text-muted-foreground">
            {profile?.full_name || profile?.email} | Илгээсэн:{" "}
            {session.submitted_at
              ? formatDateTimeUB(session.submitted_at)
              : "—"}
          </p>
        </div>
        <Button onClick={handleFinalize} disabled={finalizing}>
          {finalizing ? "Хадгалж байна..." : "Дүн баталгаажуулах"}
        </Button>
      </div>

      <div className="space-y-4">
        {answers.map((a, i) => {
          const q = a.questions;
          const isAutoGraded =
            q?.type === "multiple_choice" || q?.type === "true_false";
          const maxPoints = q?.points ?? 1;

          return (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Асуулт {i + 1}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {q?.type === "multiple_choice"
                        ? "Олон сонголт"
                        : q?.type === "true_false"
                          ? "Үнэн/Худал"
                          : q?.type === "essay"
                            ? "Нээлттэй"
                            : "Нөхөх"}
                    </Badge>
                    <Badge>{maxPoints} оноо</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-medium">{q?.content}</p>

                {/* Зөв хариулт */}
                {q?.correct_answer && (
                  <p className="text-sm text-green-600">
                    Зөв хариулт: {q.correct_answer}
                  </p>
                )}

                {/* Оюутны хариулт */}
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-sm font-medium text-muted-foreground">
                    Оюутны хариулт:
                  </p>
                  <p className="mt-1">{a.answer || "(хариулаагүй)"}</p>
                </div>

                {/* Авто шалгасан */}
                {isAutoGraded && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={a.is_correct ? "default" : "destructive"}
                      className={a.is_correct ? "bg-green-600" : ""}
                    >
                      {a.is_correct ? "Зөв" : "Буруу"}
                    </Badge>
                    <span className="text-sm">
                      {a.score ?? 0}/{maxPoints} оноо
                    </span>
                  </div>
                )}

                {/* Гараар шалгах (essay, fill_blank) */}
                {!isAutoGraded && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Оноо:</span>
                      <Input
                        type="number"
                        min={0}
                        max={maxPoints}
                        step={0.5}
                        value={scores[a.id] ?? ""}
                        onChange={(e) =>
                          setScores((p) => ({
                            ...p,
                            [a.id]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">
                        / {maxPoints}
                      </span>
                    </div>
                    <Input
                      placeholder="Тайлбар..."
                      value={feedbacks[a.id] ?? ""}
                      onChange={(e) =>
                        setFeedbacks((p) => ({
                          ...p,
                          [a.id]: e.target.value,
                        }))
                      }
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGrade(a.id, maxPoints)}
                      disabled={saving === a.id}
                    >
                      {saving === a.id ? "..." : "Хадгалах"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
