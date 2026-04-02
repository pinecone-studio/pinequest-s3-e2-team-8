"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import MathContent from "@/components/math/MathContent";
import { requestEssayReview } from "@/lib/student/actions";

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
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function parseMatchingPairs(options: unknown) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      const [left, right] = String(option).split("|||");
      if (!left || !right) return null;
      return { left, right };
    })
    .filter((item): item is { left: string; right: string } => Boolean(item));
}

function renderAnswerValue(
  question: Record<string, unknown>,
  rawAnswer: unknown,
  fallback = "Хариулаагүй",
) {
  const type = String(question.type ?? "");
  const hasAnswer = Boolean(rawAnswer && String(rawAnswer).trim() !== "");

  if (type === "multiple_choice") {
    const options = Array.isArray(question.options)
      ? question.options.map((item) => String(item))
      : [];
    const selected = hasAnswer ? normalizeTextValue(rawAnswer) : "";

    if (options.length === 0) {
      return (
        <MathContent
          text={String(rawAnswer)}
          className="prose prose-sm max-w-none font-medium text-foreground"
        />
      );
    }

    return (
      <div className="space-y-4">
        {options.map((option) => {
          const isSelected =
            normalizeTextValue(option) === selected && selected.length > 0;
          return (
            <div
              key={option}
              className={`rounded-2xl px-5 py-4 text-sm ${
                isSelected
                  ? "bg-[#DDEFD9] text-slate-900"
                  : "bg-[#EDEDED] text-slate-900"
              }`}
            >
              <MathContent text={option} className="text-[16px]" />
            </div>
          );
        })}
      </div>
    );
  }

  if (type === "multiple_response") {
    const values = hasAnswer ? parseStringArray(rawAnswer) : [];
    const options = Array.isArray(question.options)
      ? question.options.map((item) => String(item))
      : [];
    if (options.length > 0) {
      const selectedSet = new Set(
        values.map((item) => normalizeTextValue(item)),
      );
      return (
        <div className="space-y-4">
          {options.map((option) => {
            const isSelected = selectedSet.has(normalizeTextValue(option));
            return (
              <div
                key={option}
                className={`rounded-2xl px-5 py-4 text-sm ${
                  isSelected
                    ? "bg-[#DDEFD9] text-slate-900"
                    : "bg-[#EDEDED] text-slate-900"
                }`}
              >
                <MathContent text={option} className="text-[16px]" />
              </div>
            );
          })}
        </div>
      );
    }

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
        ([, value]) => String(value ?? "").trim() !== "",
      );

      if (entries.length === 0) {
        return (
          <span className="font-medium text-muted-foreground">{fallback}</span>
        );
      }

      return (
        <div className="space-y-1.5">
          {entries.map(([left, right]) => (
            <div
              key={left}
              className="grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
            >
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

  if (!hasAnswer) {
    return (
      <span className="font-medium text-muted-foreground">{fallback}</span>
    );
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

interface QuestionStepperProps {
  answers: unknown[];
  canViewDetailedFeedback: boolean;
}

export default function QuestionStepper({
  answers,
  canViewDetailedFeedback,
}: QuestionStepperProps) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const items = (answers ?? []) as Record<string, unknown>[];

  if (!canViewDetailedFeedback || items.length === 0) {
    return null;
  }

  const safeIndex = Math.min(activeIndex, items.length - 1);
  const ans = items[safeIndex];
  const maybeQuestions = (ans as Record<string, unknown>).questions;
  let rawQ: unknown;
  if (Array.isArray(maybeQuestions)) {
    rawQ = maybeQuestions[0];
  } else {
    rawQ = maybeQuestions;
  }
  const q = (rawQ ?? null) as Record<string, unknown> | null;
  if (!q) return null;

  const isEssay: boolean = String(q.type ?? "") === "essay";
  const isCorrect: boolean | null = (ans.derivedIsCorrect ?? ans.is_correct ?? null) as boolean | null;
  const score: number = Number((ans as Record<string, unknown>).derivedScore ?? (ans as Record<string, unknown>).score ?? 0);
  const points: number = Number(q.points ?? 0);
  const scoreSource = String(ans.score_source ?? "objective");
  const aiFeedback = String(ans.ai_feedback ?? "").trim();
  const reviewStatus = String(ans.review_status ?? "none");
  const reviewRequestedAt = String(ans.review_requested_at ?? "");
  const canRequestReview = Boolean(ans.can_request_review);
  const isChoiceList =
    q.type === "multiple_choice" || q.type === "multiple_response";

  const handleRequestReview = () => {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof requestEssayReview>> | null = null;

      try {
        result = await requestEssayReview(
          String(ans.id),
          reviewNotes[String(ans.id)] ?? "",
        );
      } catch (error) {
        console.warn("[QuestionStepper] requestEssayReview failed", error);
        alert("Review request илгээх үед алдаа гарлаа. Дахин оролдоно уу.");
        return;
      }

      if (!result) {
        alert("Review request илгээх үед алдаа гарлаа. Дахин оролдоно уу.");
        return;
      }

      if (result.error) {
        alert(result.error);
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="pt-4 space-y-2">
          <div className="flex items-start justify-between gap-2 ">
            <div className="flex items-start gap-2 w-201">
              <span className="text-[20px] font-semibold">
                Aсуулт {safeIndex + 1}:
              </span>{" "}
              <div className="text-[20px] mb-15 ">
                <MathContent
                  html={(q.content_html as string | null) ?? null}
                  text={String(q.content ?? "")}
                />
              </div>
            </div>
            <span className="text-[12px] pt-2">
              {score} / {points} оноо
            </span>
          </div>
          <div
            className={
              isChoiceList ? "text-sm" : "rounded bg-muted/50 px-3 py-2 text-sm"
            }
          >
            {!isChoiceList && (
              <span className="text-muted-foreground">Таны хариулт: </span>
            )}
            <div
              className={
                isChoiceList
                  ? ""
                  : isEssay
                    ? ""
                    : isCorrect
                      ? "text-green-700"
                      : "text-red-700"
              }
            >
              {renderAnswerValue(q as Record<string, unknown>, ans.answer)}
            </div>
          </div>
          {!isEssay && !isCorrect && (
            <div className="rounded bg-green-50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Зөв хариулт: </span>
              <div className="mt-1">
                {renderCorrectAnswer(q as Record<string, unknown>)}
              </div>
            </div>
          )}
          {Boolean(q?.explanation) && (
            <div className="text-xs italic text-muted-foreground">
              <MathContent text={String(q.explanation)} />
            </div>
          )}
          {isEssay && scoreSource === "ai" && reviewStatus === "none" && (
            <Badge variant="outline" className="text-xs text-purple-700">
              AI үнэлсэн
            </Badge>
          )}
          {isEssay && reviewStatus === "requested" && (
            <Badge variant="outline" className="text-xs text-amber-700">
              Багшийн review хүлээгдэж байна
            </Badge>
          )}
          {isEssay && scoreSource === "teacher" && (
            <Badge variant="outline" className="text-xs text-green-700">
              Багш хянаж шийдвэрлэсэн
            </Badge>
          )}
          {isEssay && reviewStatus === "requested" && Boolean(ans.review_reason) && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <span className="font-medium text-amber-700">
                Илгээсэн тайлбар:
              </span>{" "}
              <span>{String(ans.review_reason)}</span>
            </div>
          )}
          {isEssay && aiFeedback && (
            <div className="rounded border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
              <span className="font-medium text-purple-700">
                AI тайлбар:
              </span>{" "}
              <span>{aiFeedback}</span>
            </div>
          )}
          {isEssay && scoreSource === "teacher" && Boolean(ans.feedback) && (
            <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
              <span className="font-medium text-blue-700">
                Багшийн тайлбар:{" "}
              </span>
              <span>{String((ans as Record<string, unknown>).feedback)}</span>
            </div>
          )}
          {isEssay && canRequestReview && (
            <div className="rounded border bg-muted/40 px-3 py-3 text-sm">
              <p className="font-medium text-foreground">
                AI оноотой санал нийлэхгүй бол багшид хянахаар илгээнэ.
              </p>
              <div className="mt-3 space-y-2">
                <Textarea
                  placeholder="Тайлбар optional..."
                  value={reviewNotes[String(ans.id)] ?? ""}
                  onChange={(event) =>
                    setReviewNotes((prev) => ({
                      ...prev,
                      [String(ans.id)]: event.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRequestReview}
                  disabled={isPending}
                >
                  {isPending ? "Илгээж байна..." : "Review request илгээх"}
                </Button>
              </div>
            </div>
          )}
          {isEssay && reviewStatus === "requested" && reviewRequestedAt && (
            <p className="text-xs text-muted-foreground">
              Request илгээсэн: {new Date(reviewRequestedAt).toLocaleString("mn-MN")}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
              disabled={safeIndex === 0}
            >
              Өмнөх хариулт
            </Button>
            <Button
              type="button"
              onClick={() =>
                setActiveIndex((prev) => Math.min(items.length - 1, prev + 1))
              }
              disabled={safeIndex === items.length - 1}
            >
              Дараах
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
