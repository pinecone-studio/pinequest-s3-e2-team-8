"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import MathContent from "@/components/math/MathContent";
import { gradeAnswer, finalizeGrading } from "@/lib/grading/actions";
import { gradeEssayWithAI, autoGradeSessionEssays } from "@/lib/ai/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import { Bot, Loader2, Sparkles } from "lucide-react";

const questionTypeLabels: Record<string, string> = {
  multiple_choice: "Сонгох",
  multiple_response: "Олон зөв",
  fill_blank: "Нөхөх",
  essay: "Нээлттэй",
  matching: "Холбох",
};

interface GradingFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answers: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proctorEvents: any[];
}

function getProctorEventLabel(eventType: string) {
  switch (eventType) {
    case "tab_hidden":
      return "Tab эсвэл app сольсон";
    case "window_blur":
      return "Цонхны focus алдсан";
    case "copy_attempt":
      return "Copy оролдлого";
    case "paste_attempt":
      return "Paste оролдлого";
    case "context_menu":
      return "Right click оролдлого";
    default:
      return eventType;
  }
}

function getProctorRiskScore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proctorEvents: any[]
) {
  return proctorEvents.reduce((score, event) => {
    switch (event.event_type) {
      case "tab_hidden":
        return score + 3;
      case "window_blur":
        return score + 2;
      case "copy_attempt":
      case "paste_attempt":
      case "context_menu":
        return score + 1;
      default:
        return score;
    }
  }, 0);
}

function getRiskBadge(
  riskScore: number
): { label: string; variant: "outline" | "secondary" | "destructive" } {
  if (riskScore >= 10) {
    return { label: "Өндөр эрсдэл", variant: "destructive" };
  }

  if (riskScore >= 4) {
    return { label: "Дунд эрсдэл", variant: "secondary" };
  }

  return { label: "Бага эрсдэл", variant: "outline" };
}

function formatProctorMetadata(
  metadata: Record<string, unknown> | null | undefined
) {
  if (!metadata) return "";

  const details: string[] = [];
  const questionNumber = metadata.question_number;
  const tabSwitchCount = metadata.tab_switch_count;
  const visibilityState = metadata.visibility_state;

  if (typeof questionNumber === "number") {
    details.push(`Асуулт ${questionNumber}`);
  }

  if (typeof tabSwitchCount === "number") {
    details.push(`Tab ${tabSwitchCount}`);
  }

  if (typeof visibilityState === "string" && visibilityState) {
    details.push(`State: ${visibilityState}`);
  }

  return details.join(" | ");
}

export default function GradingForm({
  session,
  answers,
  proctorEvents,
}: GradingFormProps) {
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
  const [aiGrading, setAiGrading] = useState<string | null>(null);
  const [aiGradingAll, setAiGradingAll] = useState(false);
  const [aiResults, setAiResults] = useState<Record<string, { score: number; feedback: string }>>({});

  const exam = session.exams;
  const profile = session.profiles;
  const proctorEventCounts = proctorEvents.reduce(
    (
      counts: Record<string, number>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: any
    ) => {
      counts[event.event_type] = (counts[event.event_type] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const riskScore = getProctorRiskScore(proctorEvents);
  const riskBadge = getRiskBadge(riskScore);

  const handleGrade = async (answerId: string, maxPoints: number) => {
    const score = Math.min(scores[answerId] ?? 0, maxPoints);
    setSaving(answerId);

    const result = await gradeAnswer(
      answerId,
      score,
      feedbacks[answerId] || null
    );

    setSaving(null);

    if (result.error) {
      alert(result.error);
    }
  };

  const handleAIGrade = async (answerId: string) => {
    setAiGrading(answerId);
    const result = await gradeEssayWithAI(answerId);
    setAiGrading(null);

    if (result.error) {
      alert(result.error);
      return;
    }

    if (result.score !== undefined && result.feedback) {
      setScores((p) => ({ ...p, [answerId]: result.score! }));
      setFeedbacks((p) => ({ ...p, [answerId]: result.feedback! }));
      setAiResults((p) => ({
        ...p,
        [answerId]: { score: result.score!, feedback: result.feedback! },
      }));
    }

    router.refresh();
  };

  const handleAIGradeAll = async () => {
    setAiGradingAll(true);
    const result = await autoGradeSessionEssays(session.id);
    setAiGradingAll(false);

    if (result.error) {
      alert(result.error);
      return;
    }

    if (result.errors && result.errors.length > 0) {
      alert(`${result.gradedCount} эссэ дүгнэгдлээ. Алдаа: ${result.errors.join(", ")}`);
    }

    router.refresh();
  };

  const essayCount = answers.filter((a) => {
    const q = a.questions;
    return q?.type === "essay" && a.answer?.trim() && a.score === null;
  }).length;

  const handleFinalize = async () => {
    const ungradedAnswers = answers.filter((a) => scores[a.id] === undefined);

    if (ungradedAnswers.length > 0) {
      const confirmed = confirm(
        `${ungradedAnswers.length} хариулт шалгагдаагүй байна. Шалгаагүй хариултуудад 0 оноо өгөгдөнө. Үргэлжлүүлэх үү?`
      );
      if (!confirmed) return;
    }

    setFinalizing(true);

    for (const a of ungradedAnswers) {
      const result = await gradeAnswer(a.id, 0, null);
      if (result.error) {
        alert(result.error);
        setFinalizing(false);
        return;
      }
    }

    const result = await finalizeGrading(session.id);
    if (result.error) {
      alert(result.error);
      setFinalizing(false);
      return;
    }

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
        <div className="flex items-center gap-2">
          {essayCount > 0 && (
            <Button
              variant="outline"
              onClick={handleAIGradeAll}
              disabled={aiGradingAll || finalizing}
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              {aiGradingAll ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AI дүгнэж байна...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI бүх эссэг дүгнэх ({essayCount})
                </>
              )}
            </Button>
          )}
          <Button onClick={handleFinalize} disabled={finalizing}>
            {finalizing ? "Хадгалж байна..." : "Дүн баталгаажуулах"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Integrity log</CardTitle>
              <p className="text-sm text-muted-foreground">
                Шалгалтын үеийн suspicious event бүртгэл
              </p>
            </div>
            <Badge variant={riskBadge.variant}>
              {riskBadge.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {proctorEvents.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {Object.entries(proctorEventCounts).map(([eventType, count]) => (
                  <Badge key={eventType} variant="outline">
                    {getProctorEventLabel(eventType)}: {count}
                  </Badge>
                ))}
              </div>

              <div className="space-y-2">
                {proctorEvents.slice(0, 10).map((event) => {
                  const metadataSummary = formatProctorMetadata(event.metadata);

                  return (
                    <div
                      key={event.id}
                      className="rounded-lg border bg-muted/30 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">
                          {getProctorEventLabel(event.event_type)}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTimeUB(event.created_at)}
                        </span>
                      </div>
                      {metadataSummary && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {metadataSummary}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {proctorEvents.length > 10 && (
                <p className="text-xs text-muted-foreground">
                  Сүүлийн 10 event-ийг харуулж байна.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Integrity event бүртгэгдээгүй байна.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {answers.map((a, i) => {
          const q = a.questions;
          const passage = q?.question_passages;
          const isAutoGraded =
            q?.type === "multiple_choice" ||
            q?.type === "multiple_response" ||
            q?.type === "fill_blank" ||
            q?.type === "matching";
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
                      {questionTypeLabels[String(q?.type ?? "")] ??
                        String(q?.type ?? "Асуулт")}
                    </Badge>
                    <Badge>{maxPoints} оноо</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {passage && (
                  <div className="space-y-3 rounded-xl border border-dashed bg-muted/30 p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Shared passage</Badge>
                      {passage.title && (
                        <span className="font-medium">{passage.title}</span>
                      )}
                    </div>
                    <MathContent
                      html={passage.content_html}
                      text={passage.content}
                      className="prose prose-sm max-w-none text-foreground"
                    />
                    {passage.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={passage.image_url}
                        alt="Passage зураг"
                        className="max-h-64 rounded-lg border"
                      />
                    )}
                  </div>
                )}

                <MathContent
                  html={q?.content_html}
                  text={q?.content}
                  className="prose prose-sm max-w-none text-foreground"
                />

                {q?.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.image_url}
                    alt="Асуултын зураг"
                    className="max-h-64 rounded-lg border"
                  />
                )}

                {q?.correct_answer && (
                  <p className="text-sm text-green-600">
                    Зөв хариулт: {q.correct_answer}
                  </p>
                )}

                <div className="rounded-lg bg-muted p-3">
                  <p className="text-sm font-medium text-muted-foreground">
                    Оюутны хариулт:
                  </p>
                  <p className="mt-1">{a.answer || "(хариулаагүй)"}</p>
                </div>

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

                {!isAutoGraded && (
                  <div className="space-y-3">
                    {aiResults[a.id] && (
                      <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
                          <Bot className="h-4 w-4" />
                          AI дүгнэлт: {aiResults[a.id].score}/{maxPoints} оноо
                        </div>
                        <p className="mt-1 text-sm text-purple-600">
                          {aiResults[a.id].feedback}
                        </p>
                      </div>
                    )}
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
                        className="border-purple-300 text-purple-700 hover:bg-purple-50"
                        onClick={() => handleAIGrade(a.id)}
                        disabled={aiGrading === a.id || saving === a.id}
                      >
                        {aiGrading === a.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Bot className="mr-1 h-4 w-4" />
                            AI
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGrade(a.id, maxPoints)}
                        disabled={saving === a.id}
                      >
                        {saving === a.id ? "..." : "Хадгалах"}
                      </Button>
                    </div>
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
