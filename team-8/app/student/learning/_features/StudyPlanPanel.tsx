"use client";

import type { StudentSubjectStudyPlan } from "@/types";

function PlanColumnCard({
  accentColor,
  itemColor,
  title,
  items,
}: {
  accentColor: string;
  itemColor: string;
  title: string;
  items: string[];
}) {
  return (
    <article className="min-h-[242px] rounded-[10px] border border-[#ECECEC] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-2 pb-4">
        <span
          className="h-[10px] w-[10px] rounded-full"
          style={{ backgroundColor: accentColor }}
        />
        <h4 className="text-[14px] font-semibold leading-[120%] text-[#111111]">
          {title}
        </h4>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div
            className="rounded-[8px] px-3 py-3 text-[13px] leading-[150%] text-[#6B6B6B]"
            style={{ backgroundColor: itemColor }}
          >
            Одоогоор санал болгох зүйл алга.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item}
              className="rounded-[8px] px-3 py-3 text-[13px] leading-[150%] text-[#2F2F2F]"
              style={{ backgroundColor: itemColor }}
            >
              {item}
            </div>
          ))
        )}
      </div>
    </article>
  );
}

export default function StudyPlanPanel({
  plan,
  status,
  lastError,
  isRefreshing,
  disabled,
}: {
  subjectId: string;
  plan: StudentSubjectStudyPlan | null;
  isStale: boolean;
  status: "idle" | "pending" | "ready" | "failed";
  lastError: string | null;
  isRefreshing: boolean;
  disabled: boolean;
}) {
  const effectiveError = lastError;
  const hasPendingPlan = status === "pending";
  const introCopy =
    plan?.summary ??
    (disabled
      ? isRefreshing
        ? "Mastery profile шинэчлэгдэж байна. Дараа нь AI төлөвлөгөө гарна."
        : "Энэ хичээл дээр topic-level data хангалтгүй байна."
      : hasPendingPlan
        ? "AI таны хувийн төлөвлөгөөг бэлтгэж байна. Дуусмагц энэ хэсэг автоматаар шинэчлэгдэнэ."
        : "AI таны сул сэдвүүд дээр тулгуурлан 3 алхамтай хувийн төлөвлөгөө гаргана.");

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-[24px] font-semibold leading-[120%] text-black">
          AI Personalized Study Plan
        </h3>
        <p className="text-[14px] font-normal leading-[140%] text-[#6B6B6B]">
          Таны сул сэдвүүд дээр суурилсан хувийн төлөвлөгөө
        </p>
      </div>

      {effectiveError && status === "failed" ? (
        <div className="rounded-[16px] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {effectiveError}
        </div>
      ) : null}

      <div className="rounded-[8px] border border-[#D6E2EC] bg-[linear-gradient(90deg,#EEF5FF_0%,#EFF9F0_48%,#FFF0F7_100%)] px-6 py-5 text-[14px] leading-[160%] text-[#2E2E2E] shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
        {hasPendingPlan && plan
          ? "Шинэ AI төлөвлөгөө боловсруулж байна. Одоогоор өмнөх хадгалсан төлөвлөгөөг харуулж байна."
          : introCopy}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <PlanColumnCard
          accentColor="#6366F1"
          itemColor="#EEF2FF"
          title="3 алхамтай төлөвлөгөө"
          items={plan?.steps ?? []}
        />
        <PlanColumnCard
          accentColor="#6BBF7A"
          itemColor="#E3F3E5"
          title="Эхний анхаарах зүйлс"
          items={plan?.priorities ?? []}
        />
        <PlanColumnCard
          accentColor="#D86AD9"
          itemColor="#FEF0FE"
          title="Дараагийн practice focus"
          items={plan?.next_practice_focus ?? []}
        />
      </div>
    </section>
  );
}
