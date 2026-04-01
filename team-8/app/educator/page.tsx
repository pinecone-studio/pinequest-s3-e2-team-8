import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Pencil, Sparkles } from "lucide-react";
import { getEducatorStats } from "@/lib/dashboard/actions";
import { getExamSchedules } from "@/lib/schedule/actions";
import ExamScheduleClient from "./_components/ExamScheduleClient";

const TIMEZONE = "Asia/Ulaanbaatar";

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub: string;
  color: "blue" | "orange" | "yellow";
}) {
  const bg: Record<typeof color, string> = {
    blue: "#4F9DF7",
    orange: "#FF993A",
    yellow: "#FFD143",
  };
  const blob: Record<typeof color, string> = {
    blue: "#2F6BD7",
    orange: "#FF7E07",
    yellow: "#FFC000",
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg"
      style={{ backgroundColor: bg[color], minHeight: 90 }}
    >
      <div
        className="absolute rounded-[50%] opacity-60"
        style={{
          top: "-30%",
          left: "-20%",
          width: "60%",
          height: "80%",
          backgroundColor: blob[color],
        }}
      />
      <div
        className="absolute rounded-[40%] opacity-70"
        style={{
          bottom: "-30%",
          right: "-20%",
          width: "50%",
          height: "70%",
          backgroundColor: blob[color],
        }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold leading-tight opacity-90">
            {label}
          </p>
          <p className="mt-1 text-3xl font-semibold leading-none">{value}</p>
        </div>
        <p className="text-[10px] opacity-80">{sub}</p>
      </div>
    </div>
  );
}

function PreviewBar({ className }: { className: string }) {
  return <div className={`h-[14px] rounded-full bg-[#ece8e3] ${className}`} />;
}

function QuickActionButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="mt-4 flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#d9d9d9] bg-white text-[15px] font-medium text-[#101010] shadow-[0_4px_10px_rgba(0,0,0,0.08)] transition-colors hover:bg-[#fafafa]"
    >
      <span>{label}</span>
      <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
    </Link>
  );
}

function CreateQuestionPreview() {
  return (
    <div className="relative mt-4 min-h-[220px] overflow-hidden rounded-[18px] bg-[#eaf3ff] px-5 pt-4">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[88px] bg-gradient-to-r from-white/55 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[70px] bg-gradient-to-l from-white/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[90px] bg-gradient-to-t from-white/50 to-transparent" />

      <div className="relative z-10 mx-auto flex w-fit items-center gap-3 rounded-[18px] border border-[#8bb6fb] bg-white px-6 py-3 text-[17px] font-medium text-[#737373] shadow-[0_8px_18px_rgba(110,157,232,0.14)]">
        <Sparkles className="h-[18px] w-[18px] text-[#5f98f2]" strokeWidth={2.25} />
        <span>Эхлэх - Үүсгэх</span>
      </div>

      <div className="relative z-10 mx-auto h-[24px] w-px bg-[#90b9fd]" />

      <div className="relative z-10 mx-auto h-[126px] w-full max-w-[324px] overflow-hidden rounded-t-[10px] border border-[#79a9f6] bg-white">
        <div className="h-[24px] border-b border-[#ede5db] bg-[#faf6f1]" />
        <div className="grid grid-cols-[108px_1fr] gap-3 px-3 pb-4 pt-3">
          <div className="h-[68px] rounded-[8px] bg-gradient-to-r from-[#f0ebe5] to-[#fafafa]" />
          <div className="space-y-[12px] pt-1">
            <PreviewBar className="w-full" />
            <PreviewBar className="w-[84%]" />
            <PreviewBar className="w-[64%]" />
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-3">
            <PreviewBar className="w-[72%]" />
            <PreviewBar className="w-[66%]" />
            <PreviewBar className="w-[62%]" />
            <PreviewBar className="w-[56%]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function GradeAnswerPreview() {
  return (
    <div className="relative mt-4 min-h-[220px] overflow-hidden rounded-[18px] bg-[#eaf3ff] px-[18px] pt-[16px]">
      <div className="absolute right-8 top-4 z-10 flex h-[36px] w-[48px] items-center justify-center rounded-[16px] border border-[#b7d1fb] bg-white shadow-[0_8px_18px_rgba(110,157,232,0.14)]">
        <Pencil className="h-[16px] w-[16px] text-[#777777]" strokeWidth={2.5} />
      </div>

      <div className="mt-[50px] space-y-3">
        <div className="rounded-[10px] border border-[#79a9f6] bg-white px-4 py-4">
          <div className="space-y-[14px]">
            <PreviewBar className="w-[98%]" />
            <PreviewBar className="w-[95%]" />
          </div>
        </div>

        <div className="rounded-[10px] border border-[#79a9f6] bg-white px-4 py-4">
          <div className="space-y-[14px]">
            <PreviewBar className="w-[98%]" />
            <PreviewBar className="w-[93%]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  preview,
  href,
  ctaLabel,
  badgeLabel,
}: {
  title: string;
  description: string;
  preview: ReactNode;
  href: string;
  ctaLabel: string;
  badgeLabel?: string;
}) {
  return (
    <article className="flex min-h-[376px] flex-col rounded-[18px] border border-[#dedede] bg-white p-4 shadow-[0_10px_28px_rgba(124,144,171,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-medium leading-[1.25] text-[#111111]">
            {title}
          </h3>
          <p className="mt-2 text-[15px] leading-[1.25] text-[#6f6f6f]">
            {description}
          </p>
        </div>

        {badgeLabel ? (
          <div className="shrink-0 rounded-[10px] border border-[#6ea6fb] bg-white px-4 py-[8px] text-[14px] font-medium text-[#4c87ef] shadow-[0_4px_12px_rgba(110,157,232,0.22)]">
            {badgeLabel}
          </div>
        ) : null}
      </div>

      <div className="flex-1">{preview}</div>
      <QuickActionButton href={href} label={ctaLabel} />
    </article>
  );
}

export default async function EducatorDashboard() {
  const stats = await getEducatorStats();
  const scheduleRows = await getExamSchedules();
  const today = new Date();
  const todayKey = today.toLocaleDateString("en-CA", {
    timeZone: TIMEZONE,
  });
  const [, month, day] = todayKey.split("-");
  const dateLabel = `${Number(month)} сарын ${Number(day)}`;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#f9f9f9] via-[#cedbed] to-[#5787c8] px-8 py-6">
        <div className="relative z-10 max-w-2xl space-y-2">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Багшийн самбар
          </h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Шалгалт, асуулт, хуваарь, дүнгийн удирдлагаа нэг дороос хянаарай.
          </p>
        </div>
        <div className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-auto scale-125 origin-bottom-right md:block">
          <Image
            src="/educator-dash.png"
            alt="Dashboard Image"
            width={290}
            height={270}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Нийт жишиг даалгаврууд"
          value={stats.totalQuestions}
          sub="Асуултын сан"
          color="blue"
        />
        <StatCard
          label="Нийт шалгалтууд"
          value={stats.totalExams}
          sub="Үүсгэсэн"
          color="orange"
        />
        <StatCard
          label="Оролцоо"
          value={stats.totalParticipants}
          sub="Нийт оролцогч"
          color="yellow"
        />
      </div>

      <section className="space-y-5">
        <div className="max-w-[760px]">
          <h2 className="text-[22px] font-medium leading-none text-black">
            Эдгээр хэрэгтэй хэрэгслүүдийг ашиглаж эхэлцгээе
          </h2>
          <p className="mt-[6px] text-[15px] leading-none text-[#6f6f6f]">
            Шалгалт үүсгэх, шалгалтын хариултад засахад ашиглаж болох манай
            хэрэгслүүдийг судлаарай
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <QuickActionCard
            title="Шинэ асуулт үүсгэх"
            description="AI-ний тусламжтай шалгалтын асуултаа хялбархан үүсгэ."
            badgeLabel="Шинэ Онцлог"
            preview={<CreateQuestionPreview />}
            href="/educator/question-bank/private"
            ctaLabel="Асуулт үүсгэж эхлэх"
          />

          <QuickActionCard
            title="Шалгалтын хариулт засах"
            description="Тексттэй шалгалтыг хянаж засах."
            preview={<GradeAnswerPreview />}
            href="/educator/grading"
            ctaLabel="Шалгалт засаж эхлэх"
          />
        </div>
      </section>

      <ExamScheduleClient
        scheduleRows={scheduleRows}
        dateLabel={dateLabel}
        todayKey={todayKey}
      />
    </div>
  );
}
