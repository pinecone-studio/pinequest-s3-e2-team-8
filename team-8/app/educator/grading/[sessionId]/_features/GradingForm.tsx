"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import StudentIdentity from "@/components/profile/StudentIdentity";
import MathContent from "@/components/math/MathContent";
import { resolveReportedEssayReviews } from "@/lib/grading/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import { Bot } from "lucide-react";

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
      const baseScore = a.score ?? a.ai_score ?? 0;
      init[a.id] = Number(baseScore ?? 0);
    }
    return init;
  });
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const a of answers) {
      if (typeof a.feedback === "string" && a.feedback.trim().length > 0) {
        init[a.id] = a.feedback;
      }
    }
    return init;
  });
  const [finalizing, setFinalizing] = useState(false);

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

  const activeReviewCount = answers.length;

  const handleFinalize = async () => {
    setFinalizing(true);
    const result = await resolveReportedEssayReviews(
      session.id,
      answers.map((answer) => ({
        answerId: answer.id,
        score: Number(scores[answer.id] ?? answer.score ?? answer.ai_score ?? 0),
        feedback: feedbacks[answer.id] ?? null,
      })),
    );
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
          <div className="mt-2">
            <StudentIdentity
              name={profile?.full_name || profile?.email || "Оюутан"}
              email={profile?.email}
              avatarUrl={profile?.avatar_url}
              size="sm"
            />
          </div>
          <p className="text-muted-foreground">
            {profile?.full_name || profile?.email} | Илгээсэн:{" "}
            {session.submitted_at
              ? formatDateTimeUB(session.submitted_at)
              : "—"}
          </p>
        </div>
        <Button onClick={handleFinalize} disabled={finalizing}>
          {finalizing
            ? "Шийдвэрлэж байна..."
            : `Review дуусгах (${activeReviewCount})`}
        </Button>
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

                <div className="space-y-3">
                  <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
                      <Bot className="h-4 w-4" />
                      AI дүгнэлт: {a.ai_score ?? a.score ?? 0}/{maxPoints} оноо
                    </div>
                    <p className="mt-1 text-sm text-purple-600">
                      {a.ai_feedback || "AI тайлбар байхгүй байна."}
                    </p>
                  </div>

                  {a.review_reason ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                      <p className="font-medium text-amber-700">
                        Сурагчийн тайлбар
                      </p>
                      <p className="mt-1 text-amber-900">{a.review_reason}</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Сурагч тайлбар бичээгүй.
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
                          setScores((prev) => ({
                            ...prev,
                            [a.id]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        / {maxPoints}
                      </span>
                    </div>
                    <Badge variant="outline">
                      Request: {a.review_requested_at
                        ? formatDateTimeUB(a.review_requested_at)
                        : "—"}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Багшийн тайлбар
                    </p>
                    <Textarea
                      placeholder="Review шийдвэрийн тайлбар..."
                      value={feedbacks[a.id] ?? ""}
                      onChange={(e) =>
                        setFeedbacks((prev) => ({
                          ...prev,
                          [a.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
