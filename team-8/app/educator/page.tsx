import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CornerDownRight,
  FileText,
  Plus,
} from "lucide-react";
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
  // These hex codes match the colored glow/shadow at the bottom of the cards
  const shadowColor: Record<typeof color, string> = {
    blue: "rgba(59, 130, 246, 0.5)", // Blue glow
    orange: "rgba(249, 115, 22, 0.5)", // Orange glow
    yellow: "rgba(234, 179, 8, 0.5)", // Yellow glow
  };

  return (
    <div
      className="relative flex h-[119px] w-auto flex-col justify-between rounded-[32px] bg-white py-4 px-5 transition-transform hover:scale-[1.02]"
      style={{
        // This creates the specific "bottom-only" colored shadow effect
        boxShadow: `0px 10px 20px -5px ${shadowColor[color]}`,
        border: "1px solid rgba(0,0,0,0.05)",
      }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-[16px] font-medium text-gray-800 leading-tight">
          {label}
        </p>
        <p className="text-[24px] font-bold text-gray-900 tracking-tight">
          {value}
        </p>
      </div>

      <p className="text-sm font-medium text-[#4CAF50]">{sub}</p>
    </div>
  );
}

function QuickActionButton({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#d9d9d9] bg-white text-[15px] font-medium text-[#101010] shadow-[0_4px_10px_rgba(0,0,0,0.08)] transition-colors hover:bg-[#fafafa] ${className}`}
    >
      <span>{label}</span>
      <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
    </Link>
  );
}

function CreateQuestionPreview() {
  const tiles = [
    {
      title: "Загварууд",
      description: "Бэлэн загваруудаас сонгох",
      icon: BookOpen,
      iconColor: "text-[#F26A1B]",
    },
    {
      title: "Шинэ шалгалт",
      description: "Шалгалт үүсгэх",
      icon: FileText,
      iconColor: "text-[#18A661]",
    },
    {
      title: "Шинэ асуулт",
      description: "Асуултын санд асуулт нэмэх",
      icon: Plus,
      iconColor: "text-[#2C6DF2]",
    },
  ];

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {tiles.map((tile, index) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.title}
            className={`rounded-[14px] border border-dashed border-[#d6d6d6] bg-white px-4 py-4 shadow-[0_4px_10px_rgba(0,0,0,0.04)] ${
              index === 2 ? "md:col-span-1" : ""
            }`}
          >
            <Icon className={`h-6 w-6 ${tile.iconColor}`} strokeWidth={2.2} />
            <p className="mt-3 text-[15px] font-semibold text-[#111111]">
              {tile.title}
            </p>
            <p className="mt-1 text-[13px] text-[#7a7a7a]">
              {tile.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function GradeAnswerPreview() {
  return (
    <div className="relative mt-4 h-[253px] w-full overflow-hidden rounded-[18px] bg-[#eaf3ff] p-4">
      <Image
        src="/rate.svg"
        alt="Rate"
        fill
        className="object-contain"
        priority
      />
      <QuickActionButton
        href="/educator/grading"
        label="Шалгалт засаж эхлэх"
        className="absolute inset-x-0 bottom-0 mx-auto w-[470px] shadow-[0_6px_14px_rgba(0,0,0,0.08)]"
      />
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
    <article className="flex h-[350px] flex-col rounded-[18px] border border-[#dedede] bg-white p-4 shadow-[0_10px_28px_rgba(124,144,171,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-[18px] font-medium  text-[#111111]">{title}</h3>
          <p className=" text-[15px]  text-[#6f6f6f]">{description}</p>
        </div>

        {badgeLabel ? (
          <div className="shrink-0 rounded-[10px] border border-[#6ea6fb] bg-white px-4 py-[8px] text-[14px] font-medium text-[#4c87ef] shadow-[0_4px_12px_rgba(110,157,232,0.22)]">
            {badgeLabel}
          </div>
        ) : null}
      </div>

      <div className="flex-1">{preview}</div>
      {ctaLabel ? (
        <QuickActionButton href={href} label={ctaLabel} className="mt-4" />
      ) : null}
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
    <div className="flex flex-col gap-7.5 mb-18">
      <div className="grid gap-4 py-2 md:grid-cols-3">
        <StatCard
          label="Нийт жишиг даалгаврууд"
          value={stats.totalQuestions}
          sub="Асуултын санд "
          color="blue"
        />
        <StatCard
          label="Нийт шалгалтууд"
          value={stats.totalExams}
          sub="Үүсгэсэн шалгалтууд"
          color="orange"
        />
        <StatCard
          label="Оролцоо"
          value={stats.totalParticipants}
          sub="Хамрагдсан"
          color="yellow"
        />
      </div>
      <div className="relative overflow-hidden h-36.25 shadow-sm rounded-3xl bg-gradient-to-r from-[#ffffff] via-[#cedbed] to-[#5787c8] px-8 py-6">
        <div className="relative z-10 max-w-2xl space-y-2">
          <h2 className="text-[16px] font-medium tracking-tight ">
            Шинэ асуулт үүсгэх
          </h2>
          <p className="text-[14px] text-[#6B6B6B] md:text-base">
            AI-ийн тусламжтай шалгалтын асуултаа хялбархан үүсгэ.
          </p>
          <Link   href="/educator/question-bank/ai-create"
              className="text-[14px] font-medium text-[#648de4]">
          <div className="flex  items-center justify-center text-[#4891F1] font-medium h-10 w-36.25 bg-[#ECF1F9] rounded-lg cursor-pointer hover:bg-[#d0e4f8] transition-colors">
            <div className="flex gap-1.5 items-center">
              <p>AI-аар үүсгэх</p>
              <CornerDownRight size={14} />
            </div>
          </div></Link>
        </div>
        <div className="pointer-events-none absolute -bottom-15 right-6 hidden h-full w-auto scale-125 origin-bottom-right md:block">
          <Image
            src="/dash-image.svg"
            alt="Dashboard Image"
            width={290}
            height={270}
            className="h-auto w-auto"
          />
        </div>
      </div>
      <section className="space-y-5">
        <div className="grid gap-6 lg:grid-cols-2">
          <QuickActionCard
            title="Түргэн үйлдлүүд"
            description=""
            badgeLabel=""
            preview={<CreateQuestionPreview />}
            href="/educator/question-bank/private"
            ctaLabel=""
          />

          <QuickActionCard
            title="Шалгалтын хариулт засах"
            description="Тексттэй шалгалтыг хянаж засах."
            preview={<GradeAnswerPreview />}
            href="/educator/grading"
            ctaLabel=""
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
