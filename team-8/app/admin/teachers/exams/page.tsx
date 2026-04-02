"use client";

import { useState } from "react";
import {
  Search,
  ChevronDown,
  Calculator,
  BookOpen,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "new", label: "Шинэ шалгалт" },
  { id: "approved", label: "Баталсан" },
  { id: "rejected", label: "Татгалзсан" },
];

const DIFFICULTY_META: Record<string, { label: string; className: string }> = {
  hard: { label: "Хүнд", className: "bg-red-500 text-white" },
  medium: { label: "Дунд", className: "bg-amber-400 text-white" },
  easy: { label: "Амархан", className: "bg-green-500 text-white" },
};

const ICON_META: Record<string, { bg: string; Icon: React.ElementType }> = {
  math: { bg: "bg-blue-500", Icon: Calculator },
  social: { bg: "bg-green-600", Icon: BookOpen },
  language: { bg: "bg-amber-400", Icon: GraduationCap },
};

const EXAMS = [
  {
    id: 1,
    iconType: "math",
    title: "Математик - Пифогорын теорем",
    subtitle: "Улирлын шалгалт",
    description: "Математикийн хүнл тэгшитгэлийн бодлогууд",
    questionCount: 20,
    difficulty: "hard",
    tags: ["Олон сонголттой"],
  },
  {
    id: 2,
    iconType: "social",
    title: "Нийгмийн ухаан сорил",
    subtitle: "Улирлын шалгалт",
    description: "Ахлах ангийн нийгмийн ухааны бататгах улирлын эцсийн шалгалт",
    questionCount: 30,
    difficulty: "medium",
    tags: ["Олон сонголттой", "Эссэ"],
  },
  {
    id: 3,
    iconType: "language",
    title: "Монгол хэл бичгийн шалгалт",
    subtitle: "Дунд ангийн сорил",
    description: "Монгол бичгийн мэдлэг, орчуулга",
    questionCount: 10,
    difficulty: "easy",
    tags: ["Богино хариулт", "Эссэ"],
  },
  {
    id: 4,
    iconType: "math",
    title: "Математик - Пифогорын теорем",
    subtitle: "Улирлын шалгалт",
    description: "Математикийн хүнл тэгшитгэлийн бодлогууд",
    questionCount: 20,
    difficulty: "hard",
    tags: ["Олон сонголттой"],
  },
  {
    id: 5,
    iconType: "social",
    title: "Нийгмийн ухаан сорил",
    subtitle: "Улирлын шалгалт",
    description: "Ахлах ангийн нийгмийн ухааны бататгах улирлын эцсийн шалгалт",
    questionCount: 30,
    difficulty: "medium",
    tags: ["Олон сонголттой", "Эссэ"],
  },
  {
    id: 6,
    iconType: "language",
    title: "Монгол хэл бичгийн шалгалт",
    subtitle: "Дунд ангийн сорил",
    description: "Монгол бичгийн мэдлэг, орчуулга",
    questionCount: 10,
    difficulty: "easy",
    tags: ["Богино хариулт", "Эссэ"],
  },
];

function ExamCard({ exam }: { exam: (typeof EXAMS)[0] }) {
  const iconMeta = ICON_META[exam.iconType];
  const diffMeta = DIFFICULTY_META[exam.difficulty];
  const { Icon } = iconMeta;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5 flex flex-col gap-3 shadow-sm">
      {/* Icon */}
      <div className="flex justify-center">
        <div
          className={cn(
            "h-14 w-14 rounded-full flex items-center justify-center",
            iconMeta.bg,
          )}
        >
          <Icon className="h-7 w-7 text-white" strokeWidth={1.8} />
        </div>
      </div>

      {/* Title */}
      <div className="text-center">
        <p className="text-[15px] font-bold text-zinc-900 leading-snug">
          {exam.title}
        </p>
        <p className="mt-0.5 text-[13px] text-zinc-400">{exam.subtitle}</p>
      </div>

      {/* Description */}
      <p className="text-[13px] text-zinc-500 leading-snug min-h-[36px]">
        {exam.description}
      </p>

      {/* Question count + difficulty */}
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-zinc-200 px-3 py-1 text-[12px] text-zinc-600">
          {exam.questionCount} асуулт
        </span>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[12px] font-medium",
            diffMeta.className,
          )}
        >
          {diffMeta.label}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {exam.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-zinc-200 px-3 py-1 text-[12px] text-zinc-600"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-1">
        <button className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
          Татгалзах
        </button>
        <button className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
          Батлах
        </button>
      </div>
    </div>
  );
}

export default function ExamReviewPage() {
  const [activeTab, setActiveTab] = useState("new");
  const [search, setSearch] = useState("");
  const filteredExams = EXAMS.filter((exam) =>
    exam.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center bg-[#F0EEEE] rounded-lg  p-1 gap-0.5 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-white text-black"
                  : "text-black hover:text-zinc-700",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[#F0EEEE] rounded-lg px-3 py-2 shadow-sm">
            <Search size={14} className="text-[#3C3C4399]" />
            <input
              type="text"
              placeholder="Хайх"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-[13px] outline-none w-36 placeholder:text-[#3C3C4399]"
            />
          </div>
          <button className="flex items-center gap-1.5 bg-[#F0EEEE]  font-medium rounded-lg px-3 py-2 text-[14px]  shadow-sm hover:bg-zinc-50 transition-colors">
            Бүх анги
            <ChevronDown size={14} />
          </button>
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
