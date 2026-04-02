"use client";

import { useMemo, useState } from "react";
import {
  Atom,
  BookOpen,
  Calculator,
  FlaskConical,
  Globe2,
  Laptop2,
  Search,
  Sigma,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminExamOverview } from "@/lib/admin/actions";

type TabId = "draft" | "published" | "finalized";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "draft", label: "Шинэ шалгалт" },
  { id: "published", label: "Баталсан" },
  { id: "finalized", label: "Дууссан" },
];

const LIFECYCLE_BADGE_CLASSNAME: Record<string, string> = {
  draft: "bg-[#f4f4f5] text-[#52525b]",
  ready: "bg-[#ecfdf3] text-[#166534]",
  published: "bg-[#eff6ff] text-[#1d4ed8]",
  live: "bg-[#dbeafe] text-[#1d4ed8]",
  grading: "bg-[#fff7ed] text-[#c2410c]",
  finalized: "bg-[#eef2ff] text-[#4338ca]",
};

function getTabForExam(exam: AdminExamOverview): TabId {
  const key = exam.lifecycle?.key;

  if (key === "finalized") return "finalized";
  if (key === "published" || key === "live" || key === "grading") {
    return "published";
  }

  return "draft";
}

function getSubjectPresentation(subjectName: string | null) {
  const subject = (subjectName ?? "").toLowerCase();

  if (subject.includes("мат")) {
    return { Icon: Sigma, iconClassName: "bg-[#4a90f5] text-white" };
  }

  if (subject.includes("физ")) {
    return { Icon: Atom, iconClassName: "bg-[#7c83fd] text-white" };
  }

  if (subject.includes("хими") || subject.includes("био")) {
    return { Icon: FlaskConical, iconClassName: "bg-[#2fb36d] text-white" };
  }

  if (
    subject.includes("мэдээлэл") ||
    subject.includes("информ") ||
    subject.includes("техно")
  ) {
    return { Icon: Laptop2, iconClassName: "bg-[#0ea5a4] text-white" };
  }

  if (
    subject.includes("монгол") ||
    subject.includes("англи") ||
    subject.includes("орос") ||
    subject.includes("хэл")
  ) {
    return { Icon: BookOpen, iconClassName: "bg-[#f4c95d] text-white" };
  }

  if (
    subject.includes("түүх") ||
    subject.includes("нийгэм") ||
    subject.includes("газарзүй") ||
    subject.includes("иргэн")
  ) {
    return { Icon: Globe2, iconClassName: "bg-[#56b85c] text-white" };
  }

  if (subject.includes("геометр") || subject.includes("алгебр")) {
    return { Icon: Calculator, iconClassName: "bg-[#4a90f5] text-white" };
  }

  return { Icon: BookOpen, iconClassName: "bg-[#8b8fa3] text-white" };
}

function ExamCard({ exam }: { exam: AdminExamOverview }) {
  const lifecycleKey = exam.lifecycle?.key ?? "draft";
  const lifecycleLabel = exam.lifecycle?.label ?? "Ноорог";
  const { Icon, iconClassName } = getSubjectPresentation(exam.subjectName);

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm mt-4">
      <div className="flex items-start justify-center">
        <div
          className={cn(
            "relative -top-10 flex h-15 w-15 items-center justify-center rounded-full",
            iconClassName,
          )}
        >
          <Icon className="h-7 w-7" strokeWidth={1.8} />
        </div>
      </div>

      <div className="flex justify-center font-semibold text-[16px] -mt-11">
        <p className="">{exam.subjectName ?? "Хичээлгүй"}</p> -{" "}
        <h3 className=" leading-snug text-zinc-950">{exam.title}</h3>
      </div>

      <p className="min-h-[40px] text-[13px] leading-snug text-zinc-500">
        {exam.description?.trim() || "Тайлбар оруулаагүй байна."}
      </p>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-zinc-200 px-3 py-1 text-[12px] text-zinc-600">
          {exam.questionCount} асуулт
        </span>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[12px] font-semibold",
            LIFECYCLE_BADGE_CLASSNAME[lifecycleKey] ??
              "bg-[#f4f4f5] text-[#52525b]",
          )}
        >
          {lifecycleLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3.5 font-medium">
        <div className="flex justify-center border border-gray-300 rounded-lg py-1 px-8.5 bg-[#FAFAFA]">
          Татгалзах
        </div>{" "}
        <div className="flex justify-center border border-gray-300 rounded-lg py-1 px-8.5 bg-[#FAFAFA]">
          Батлах
        </div>
      </div>
    </article>
  );
}

export default function ExamReviewBoard({
  exams,
}: {
  exams: AdminExamOverview[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>("draft");
  const [search, setSearch] = useState("");

  const filteredExams = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return exams.filter((exam) => {
      if (getTabForExam(exam) !== activeTab) return false;
      if (!normalized) return true;

      const haystack = [
        exam.title,
        exam.subjectName ?? "",
        exam.description ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [activeTab, exams, search]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-[#F0EEEE] p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-white text-black"
                  : "text-black hover:text-zinc-700",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-[#F0EEEE] px-3 py-2 shadow-sm">
          <Search size={14} className="text-[#3C3C4399]" />
          <input
            type="text"
            placeholder="Хайх"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-36 text-[13px] outline-none placeholder:text-[#3C3C4399] sm:w-56"
          />
        </div>
      </div>

      {filteredExams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-16 text-center text-zinc-500 shadow-sm">
          Илэрц олдсонгүй.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredExams.map((exam) => (
            <ExamCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </div>
  );
}
