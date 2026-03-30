"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { StudentSubjectStudyPlan } from "@/types";
import { refreshStudentSubjectStudyPlan } from "@/lib/student-learning/actions";

export default function StudyPlanPanel({
  subjectId,
  plan,
  isStale,
  disabled,
}: {
  subjectId: string;
  plan: StudentSubjectStudyPlan | null;
  isStale: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = () => {
    startTransition(async () => {
      setError(null);
      const result = await refreshStudentSubjectStudyPlan(subjectId);
      if ("error" in result) {
        setError(result.error ?? "AI study plan боловсруулахад алдаа гарлаа.");
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">AI Personalized Study Plan</h3>
          <p className="text-sm text-muted-foreground">
            Таны сул сэдвүүд дээр суурилсан хувийн төлөвлөгөө
          </p>
        </div>
        <div className="flex items-center gap-2">
          {plan && (
            <Badge variant={isStale ? "outline" : "secondary"}>
              {isStale ? "Шинэчлэлт хэрэгтэй" : "Cache бэлэн"}
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant={plan ? "outline" : "default"}
            disabled={disabled || isPending}
            onClick={handleRefresh}
          >
            {isPending
              ? "AI боловсруулж байна..."
              : plan
                ? "Дахин боловсруулах"
                : "AI төлөвлөгөө гаргах"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!plan ? (
        <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {disabled
            ? "Энэ хичээл дээр topic-level data хангалтгүй байна."
            : "AI таны сул сэдвүүд дээр тулгуурлан 3 алхамтай хувийн төлөвлөгөө гаргана."}
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-sm leading-6 text-zinc-700">{plan.summary}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border p-4">
              <p className="text-sm font-semibold text-zinc-900">Эхний анхаарах зүйлс</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                {plan.priorities.map((item) => (
                  <li key={item} className="rounded-lg bg-zinc-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border p-4">
              <p className="text-sm font-semibold text-zinc-900">3 алхамтай төлөвлөгөө</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                {plan.steps.map((item) => (
                  <li key={item} className="rounded-lg bg-zinc-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border p-4">
              <p className="text-sm font-semibold text-zinc-900">Дараагийн practice focus</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {plan.next_practice_focus.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
