"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!showSuccessModal) return;

    const timeoutId = window.setTimeout(() => {
      router.push("/educator/exams");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [router, showSuccessModal]);

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

      if (result?.warning) {
        router.refresh();
        return;
      }

      setShowSuccessModal(true);
    });
  }

  return (
    <div className="relative shrink-0">
      <Button
        type="button"
        variant={isPublished ? "secondary" : "default"}
        onClick={handlePublish}
        disabled={isPublished}
        loading={isPending}
        loadingText="Үүсгэж байна..."
        className="h-[36px] min-w-[130px] rounded-[10px] bg-[#6EA8FE] px-5 text-[12px] font-medium text-white shadow-none hover:bg-[#5C99F6] disabled:bg-[#D9E8FF] disabled:text-[#5F7AA7]"
      >
        {isPublished ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Нийтлэгдсэн
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Шалгалт үүсгэх
          </>
        )}
      </Button>

      {feedback && feedback.type !== "success" ? (
        <div
          className={`absolute right-0 top-[44px] z-10 w-[320px] rounded-2xl border px-3 py-2 text-sm text-right ${getFeedbackClasses(
            feedback.type
          )}`}
        >
          <div className="flex items-start justify-end gap-2">
            {feedback.type === "error" || feedback.type === "warning" ? (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        </div>
      ) : null}

      {showSuccessModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-[448px] rounded-[8px] bg-white px-6 py-14 text-center shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-[4px] border-[#16C533] text-[#16C533]">
              <CheckCircle2 className="h-9 w-9" strokeWidth={2.5} />
            </div>
            <p className="mt-5 text-[22px] font-bold leading-tight text-[#111827]">
              Та амжилттай
              <br />
              шалгалтаа үүсгэлээ.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
