"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publishExam } from "@/lib/exam/actions";

type Feedback =
  | {
      type: "error" | "warning" | "success";
      message: string;
    }
  | null;

function getFeedbackClasses(type: NonNullable<Feedback>["type"]) {
  if (type === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (type === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function PublishExamButton({
  examId,
  isPublished,
}: {
  examId: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  function handlePublish() {
    if (isPublished) return;

    setFeedback(null);

    startTransition(async () => {
      const result = await publishExam(examId);

      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }

      setFeedback({
        type: result?.warning ? "warning" : "success",
        message: result?.warning ?? "Шалгалт амжилттай нийтлэгдлээ.",
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-2 md:items-end">
      <Button
        type="button"
        size="lg"
        variant={isPublished ? "secondary" : "default"}
        onClick={handlePublish}
        disabled={isPublished}
        loading={isPending}
        loadingText="Нийтэлж байна..."
        className="min-w-[190px]"
      >
        {isPublished ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Нийтлэгдсэн
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Шалгалт нийтлэх
          </>
        )}
      </Button>

      {feedback ? (
        <div
          className={`max-w-sm rounded-2xl border px-3 py-2 text-sm md:text-right ${getFeedbackClasses(
            feedback.type
          )}`}
        >
          <div className="flex items-start gap-2 md:justify-end">
            {feedback.type === "error" || feedback.type === "warning" ? (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        </div>
      ) : !isPublished ? (
        <p className="max-w-sm text-xs text-zinc-500 md:text-right">
          Нийтэлсний дараа энэ шалгалтын асуултуудыг түгжиж, сурагчдад оноох
          боломжтой болно.
        </p>
      ) : null}
    </div>
  );
}
