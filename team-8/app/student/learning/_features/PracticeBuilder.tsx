"use client";

import Link from "next/link";
import { Eye, Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createStudentPracticeExam } from "@/lib/student-learning/actions";
import type { StudentLearningTopicSummary } from "@/types";

type PracticeHistoryItem = {
  id: string;
  title: string;
  question_count: number;
  created_at: string;
  status: "building" | "failed" | "in_progress" | "graded";
  submitted_at: string | null;
  percentage: number | null;
  build_error: string | null;
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

function SectionHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-2">
        <h3 className="text-[24px] font-semibold leading-[120%] text-black">
          {title}
        </h3>
        <p className="text-[14px] font-normal leading-[140%] text-[#6B6B6B]">
          {subtitle}
        </p>
      </div>
      {trailing}
    </div>
  );
}

function TopicSelectorCard({
  subjectName,
  topics,
  selectedTopicKeys,
  allSelected,
  isPending,
  onToggleTopic,
  onToggleAll,
  onCreatePractice,
}: {
  subjectName: string;
  topics: StudentLearningTopicSummary[];
  selectedTopicKeys: string[];
  allSelected: boolean;
  isPending: boolean;
  onToggleTopic: (topicKey: string) => void;
  onToggleAll: () => void;
  onCreatePractice: () => void;
}) {
  return (
    <article className="flex min-h-[300px] flex-col rounded-[20px] border border-[#ECECEC] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div>
        <h4 className="text-[18px] font-semibold leading-[120%] text-black">
          {subjectName}
        </h4>
        <div className="mt-4 border-t border-black/10" />
      </div>

      {topics.length === 0 ? (
        <div className="mt-5 rounded-[12px] border border-dashed border-[#D7D7D7] p-4 text-sm text-[#6B6B6B]">
          Topic-level сул талын data хангалтгүй байна. Шинэ labeled шалгалтын
          дүн эсвэл AI backfill орсны дараа practice санал болгоно.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] font-medium leading-[120%] text-[#6B6B6B]">
              Сонгосон сэдэв: {selectedTopicKeys.length}/{topics.length}
            </p>
            <button
              type="button"
              onClick={onToggleAll}
              className="text-[13px] font-medium text-[#7F32F5] hover:underline"
            >
              {allSelected ? "Болиулах" : "Бүгдийг сонгох"}
            </button>
          </div>
          {topics.map((topic) => {
            const isSelected = selectedTopicKeys.includes(topic.topic_key);
            return (
              <label
                key={topic.topic_key}
                className="flex cursor-pointer items-center justify-between gap-6 rounded-[12px] px-1 py-1"
              >
                <span className="text-[14px] font-normal leading-[130%] text-[#3D3D3D]">
                  {topic.topic_label}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isSelected}
                  onChange={() => onToggleTopic(topic.topic_key)}
                />
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                    isSelected
                      ? "border-[#7F32F5] bg-[#7F32F5]"
                      : "border-[#D0D0D0] bg-white"
                  }`}
                >
                  {isSelected ? (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="mt-auto flex justify-end pt-6">
        <Button
          type="button"
          onClick={onCreatePractice}
          disabled={
            topics.length === 0 || selectedTopicKeys.length === 0 || isPending
          }
          className="h-10 rounded-[8px] bg-black px-5 text-[14px] font-medium text-white hover:bg-black/90"
        >
          <Sparkles className="h-4 w-4 text-[#D7B9FF]" />
          {isPending ? "Бэлтгэж байна..." : "Практик шалгалт үүсгэх"}
        </Button>
      </div>
    </article>
  );
}

function getPracticeStatusLabel(status: PracticeHistoryItem["status"]) {
  if (status === "building") return "Бэлтгэж байна";
  if (status === "failed") return "Алдаатай";
  if (status === "graded") return "Дууссан";
  return "Үргэлжилж байна";
}

function getScorePillClassName(percentage: number | null) {
  if (percentage === null) {
    return "bg-[#F4F4F5] text-[#6B6B6B]";
  }
  if (percentage >= 75) {
    return "bg-[#DBF0DF] text-[#3B8748]";
  }
  if (percentage >= 50) {
    return "bg-[#FFF3D6] text-[#9A6B15]";
  }
  return "bg-[#FBE9E9] text-[#E05252]";
}

function PracticeHistoryRow({ item }: { item: PracticeHistoryItem }) {
  const href =
    item.status === "graded"
      ? `/student/learning/practice/${item.id}/result`
      : `/student/learning/practice/${item.id}`;

  return (
    <article className="flex items-center justify-between gap-5 rounded-[20px] border border-[#ECECEC] bg-white px-5 py-4 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-[15px] font-semibold leading-[120%] text-black">
          {item.title}
        </p>
        <p className="text-[13px] font-normal leading-[120%] text-[#6B6B6B]">
          {item.question_count} асуулт · {formatDateTime(item.created_at)}
        </p>
        {item.status === "failed" && item.build_error ? (
          <p className="text-xs text-destructive">{item.build_error}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-[13px] font-medium leading-[120%] text-[#6B6B6B]">
          {getPracticeStatusLabel(item.status)}
        </span>
        <span
          className={`inline-flex h-8 min-w-[58px] items-center justify-center rounded-full px-4 text-[13px] font-semibold ${getScorePillClassName(item.percentage)}`}
        >
          {item.percentage !== null ? `${item.percentage}%` : "—"}
        </span>
        <Link href={href}>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-[10px] border-[#D7D7D7] bg-white px-4 text-[13px] font-medium text-[#111111] hover:bg-zinc-50"
          >
            <Eye className="h-4 w-4 text-[#7F32F5]" />
            {item.status === "graded"
              ? "Үр дүн"
              : item.status === "failed"
                ? "Шалгах"
                : item.status === "building"
                  ? "Төлөв харах"
                  : "Үргэлжлүүлэх"}
          </Button>
        </Link>
      </div>
    </article>
  );
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
    [topics],
  );
  const [selectedTopicKeys, setSelectedTopicKeys] =
    useState<string[]>(defaultSelection);

  const allTopicKeys = useMemo(() => topics.map((topic) => topic.topic_key), [
    topics,
  ]);
  const allSelected =
    allTopicKeys.length > 0 && selectedTopicKeys.length === allTopicKeys.length;

  const toggleTopic = (topicKey: string) => {
    setSelectedTopicKeys((current) =>
      current.includes(topicKey)
        ? current.filter((value) => value !== topicKey)
        : [...current, topicKey],
    );
  };

  const handleSelectAll = () => {
    setSelectedTopicKeys(allSelected ? [] : allTopicKeys);
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
    });
  };

  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <SectionHeader
          title="Хувийн практик шалгалт"
          subtitle={`${subjectName} хичээлийн сул сэдвүүдээр чинь шинэ practice бэлтгэнэ`}
        />

        {error ? (
          <div className="rounded-[16px] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6">
          <TopicSelectorCard
            subjectName={subjectName}
            topics={topics}
            selectedTopicKeys={selectedTopicKeys}
            allSelected={allSelected}
            isPending={isPending}
            onToggleTopic={toggleTopic}
            onToggleAll={handleSelectAll}
            onCreatePractice={handleCreatePractice}
          />
        </div>
      </section>

      <section className="space-y-6">
        <SectionHeader
          title="Өмнөх практик шалгалтууд"
          subtitle="Эдгээр нь зөвхөн таны learning hub дотор хадгалагдана"
          trailing={
            <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-full bg-black/8 px-4 text-[13px] font-semibold text-black">
              {practiceHistory.length}
            </span>
          }
        />

        {practiceHistory.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#D7D7D7] bg-white px-6 py-8 text-[14px] text-[#6B6B6B]">
            Одоогоор practice history алга.
          </div>
        ) : (
          <div className="space-y-4">
            {practiceHistory.map((item) => (
              <PracticeHistoryRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
