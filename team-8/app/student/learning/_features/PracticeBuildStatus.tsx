"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { retryStudentPracticeExamBuild } from "@/lib/student-learning/actions";

export default function PracticeBuildStatus({
  practiceExamId,
  title,
  subjectName,
  status,
  error,
}: {
  practiceExamId: string;
  title: string;
  subjectName: string;
  status: "building" | "failed";
  error: string | null;
}) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (status !== "building") return;

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [router, status]);

  const handleRetry = () => {
    startTransition(async () => {
      setActionError(null);
      const result = await retryStudentPracticeExamBuild(practiceExamId);
      if ("error" in result) {
        setActionError(result.error ?? "Practice дахин бэлтгэхэд алдаа гарлаа.");
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="space-y-1">
        <p className="text-sm font-medium text-[#4078C1]">{subjectName}</p>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={status === "building" ? "secondary" : "outline"}>
                {status === "building" ? "Бэлтгэж байна" : "Алдаа гарсан"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {status === "building"
                ? "Practice шалгалтыг таньд зориулж бэлтгэж байна. Хэсэг хугацааны дараа автоматаар шинэчлэгдэнэ."
                : "Practice шалгалтыг бүрдүүлэх үед алдаа гарлаа. Дахин бэлтгээд үзэж болно."}
            </p>
          </div>
          <Link href="/student/learning">
            <Button variant="outline">Learning Hub</Button>
          </Link>
        </div>

        {status === "failed" && (error || actionError) ? (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {actionError ?? error}
          </div>
        ) : null}

        {status === "building" ? (
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
              >
                Сэдэв {index + 1}-ийн practice асуултуудыг бэлтгэж байна...
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleRetry} disabled={isPending}>
              {isPending ? "Дахин бэлтгэж байна..." : "Дахин бэлтгэх"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.refresh()}>
              Төлөв шинэчлэх
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
