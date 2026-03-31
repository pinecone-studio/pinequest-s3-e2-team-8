"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createStudentPracticeExam } from "@/lib/student-learning/actions";
import type { StudentLearningTopicSummary } from "@/types";

type PracticeHistoryItem = {
  id: string;
  title: string;
  question_count: number;
  created_at: string;
  status: string;
  submitted_at: string | null;
  percentage: number | null;
};

const TIMEZONE = "Asia/Ulaanbaatar";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
}

export default function PracticeBuilder({
  subjectId,
  subjectName,
  topics,
  practiceHistory,
}: {
  subjectId: string;
  subjectName: string;
  topics: StudentLearningTopicSummary[];
  practiceHistory: PracticeHistoryItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaultSelection = useMemo(
    () => topics.slice(0, 3).map((topic) => topic.topic_key),
    [topics]
  );
  const [selectedTopicKeys, setSelectedTopicKeys] = useState<string[]>(defaultSelection);

  const toggleTopic = (topicKey: string) => {
    setSelectedTopicKeys((current) =>
      current.includes(topicKey)
        ? current.filter((value) => value !== topicKey)
        : [...current, topicKey]
    );
  };

  const handleCreatePractice = () => {
    startTransition(async () => {
      setError(null);
      const result = await createStudentPracticeExam({
        subjectId,
        topicKeys: selectedTopicKeys,
      });

      if ("error" in result) {
        setError(result.error ?? "Practice шалгалт үүсгэхэд алдаа гарлаа.");
        return;
      }

      router.push(result.redirectTo);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Хувийн Practice Шалгалт</h3>
            <p className="text-sm text-muted-foreground">
              {subjectName} хичээлийн сул сэдвүүдээр чинь шинэ practice бэлтгэнэ
            </p>
          </div>
          <Button
            type="button"
            onClick={handleCreatePractice}
            disabled={topics.length === 0 || selectedTopicKeys.length === 0 || isPending}
          >
            {isPending ? "Бэлтгэж байна..." : "Practice шалгалт үүсгэх"}
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {topics.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Topic-level сул талын data хангалтгүй байна. Шинэ labeled шалгалтын дүн эсвэл AI backfill
            орсны дараа practice санал болгоно.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-zinc-900">Practice-д оруулах сэдвүүд</p>
            <div className="grid gap-3 md:grid-cols-2">
              {topics.map((topic) => {
                const isSelected = selectedTopicKeys.includes(topic.topic_key);
                return (
                  <label
                    key={topic.topic_key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      isSelected ? "border-[#4078C1] bg-[#ECF1F9]" : "hover:bg-zinc-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-zinc-300"
                      checked={isSelected}
                      onChange={() => toggleTopic(topic.topic_key)}
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900">{topic.topic_label}</p>
                        <Badge variant={topic.mastery_score < 60 ? "secondary" : "outline"}>
                          {Math.round(topic.mastery_score)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Official: {topic.official_percentage ?? "—"}% · Practice:{" "}
                        {topic.practice_percentage ?? "—"}%
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Өмнөх Practice-ууд</h3>
            <p className="text-sm text-muted-foreground">
              Эдгээр нь зөвхөн таны learning hub дотор хадгалагдана
            </p>
          </div>
          <Badge variant="outline">{practiceHistory.length}</Badge>
        </div>

        {practiceHistory.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Одоогоор practice history алга.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {practiceHistory.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.question_count} асуулт · Үүсгэсэн: {formatDateTime(item.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {item.percentage !== null && (
                    <Badge variant="secondary">{item.percentage}%</Badge>
                  )}
                  <Link
                    href={
                      item.status === "graded"
                        ? `/student/learning/practice/${item.id}/result`
                        : `/student/learning/practice/${item.id}`
                    }
                  >
                    <Button size="sm" variant="outline">
                      {item.status === "graded" ? "Үр дүн" : "Үргэлжлүүлэх"}
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
