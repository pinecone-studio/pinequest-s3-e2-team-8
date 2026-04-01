import Link from "next/link";
import { getStudentStats } from "@/lib/dashboard/actions";
import { Button } from "@/components/ui/button";
import DashboardImage from "../_icons/DashboardImage";
import { formatTimeUB, ULAANBAATAR_TIME_ZONE } from "@/lib/utils/date";

type UpcomingExam = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  session_status: string | null;
  lifecycle_status: string;
  lifecycle_label: string;
};

function formatExamTimeLabel(
  startTime: string,
  durationMinutes: number,
): string {
  const now = new Date();

  const toUBDate = (d: Date) =>
    new Date(d.toLocaleString("en-US", { timeZone: ULAANBAATAR_TIME_ZONE }));

  const nowUB = toUBDate(now);
  const startUB = toUBDate(new Date(startTime));

  const nowMidnight = new Date(nowUB);
  nowMidnight.setHours(0, 0, 0, 0);
  const startMidnight = new Date(startUB);
  startMidnight.setHours(0, 0, 0, 0);

  const diffDays = Math.round(
    (startMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24),
  );

  const timeStr = formatTimeUB(startTime);

  let dayLabel: string;
  if (diffDays <= 0) {
    dayLabel = `Өнөөдөр ${timeStr}`;
  } else if (diffDays === 1) {
    dayLabel = `Маргааш ${timeStr}`;
  } else {
    dayLabel = `${diffDays} өдрийн дараа`;
  }

  return `${dayLabel} • ${durationMinutes} минут`;
}

const CARD_PALETTES = [
  "bg-blue-100",
  "bg-violet-100",
  "bg-emerald-100",
  "bg-orange-100",
  "bg-pink-100",
  "bg-teal-100",
  "bg-yellow-100",
  "bg-indigo-100",
];

const AVATAR_COLORS = [
  "bg-blue-400",
  "bg-violet-400",
  "bg-emerald-400",
  "bg-orange-400",
  "bg-pink-400",
];

function ExamCard({
  exam,
  paletteIndex,
  isActive,
}: {
  exam: UpcomingExam;
  paletteIndex: number;
  isActive: boolean;
}) {
  const bgColor = CARD_PALETTES[paletteIndex % CARD_PALETTES.length];
  const timeLabel = formatExamTimeLabel(exam.start_time, exam.duration_minutes);

  return (
    <article
      className={`relative h-[226px] w-full max-w-[340px] overflow-hidden rounded-[13px] ${bgColor} shadow-[0_2px_6px_rgba(0,0,0,0.25)]`}
    >
      <div
        className="absolute left-0 top-[68px] h-[158px] w-full bg-white shadow-[0_4px_10px_rgba(0,0,0,0.10)]"
        style={{
          clipPath:
            "polygon(0 0, 78% 0, 84% 22px, 100% 22px, 100% 100%, 0 100%)",
          borderTopLeftRadius: "13px",
          borderBottomLeftRadius: "13px",
          borderBottomRightRadius: "13px",
        }}
      />

      <svg
        className="pointer-events-none absolute left-0 top-[68px]"
        width="340"
        height="158"
        viewBox="0 0 340 158"
        fill="none"
      >
        <path
          d="M13 0H265.2L285.6 22H327C334.18 22 340 27.82 340 35V145C340 152.18 334.18 158 327 158H13C5.82 158 0 152.18 0 145V13C0 5.82 5.82 0 13 0Z"
          fill="none"
          stroke="rgba(0,0,0,0.20)"
          strokeWidth="1"
        />
      </svg>

      <div className="absolute left-5 top-[85px] flex h-[128px] w-[300px] flex-col items-start gap-[14px]">
        <div className="flex w-full flex-col items-start gap-3">
          <div className="flex w-full flex-col items-start gap-[10px]">
            <div className="h-[45px] w-full">
              <h4 className="line-clamp-1 text-[20px] leading-[120%] font-normal text-black">
                {exam.title}
              </h4>
              <p className="line-clamp-1 text-base leading-[120%] font-normal text-black/80">
                {exam.lifecycle_label}
              </p>
            </div>

            <div className="flex h-[17px] w-full items-center gap-2 text-sm leading-[120%] font-normal text-black/70">
              <span className="shrink-0">{timeLabel.split(" • ")[0]}</span>
              <span className="h-1 w-1 rounded-full bg-black/70" />
              <span className="shrink-0">{exam.duration_minutes} минут</span>
            </div>
          </div>

          <div className="w-full border-t border-black/30" />
        </div>

        <div className="flex h-8 w-full items-center justify-between">
          <div className="relative h-7 w-[63px]">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`absolute top-0 flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-white text-[10px] font-bold text-white ${
                  AVATAR_COLORS[(paletteIndex + i) % AVATAR_COLORS.length]
                }`}
                style={{ left: `${i === 0 ? 0 : i === 1 ? 18 : 35}px` }}
              >
                {["А", "Б", "В"][i]}
              </div>
            ))}
          </div>

          {isActive ? (
            <Link href={`/student/exams/${exam.id}/take`}>
              <Button
                size="sm"
                className="h-8 rounded-[10px] bg-[#6BBF7A] px-4 text-sm leading-[120%] font-normal text-white hover:bg-[#63b873]"
              >
                Шалгалт өгөх
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              className="h-8 cursor-default rounded-[10px] bg-[#E05252] px-4 text-sm leading-[120%] font-normal text-white hover:bg-[#E05252]"
              tabIndex={-1}
            >
              Идэвхгүй
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default async function StudentDashboard() {
  const stats = await getStudentStats();

  const activeExams = stats.upcomingExams.filter(
    (exam) =>
      exam.lifecycle_status === "available" ||
      exam.lifecycle_status === "retake_available" ||
      exam.lifecycle_status === "in_progress",
  );

  const scheduledExams = stats.upcomingExams.filter(
    (exam) =>
      exam.lifecycle_status === "scheduled" ||
      exam.lifecycle_status === "retake_scheduled",
  );

  return (
    <div className="relative space-y-6">
      {/* 1. The Background Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#ffffff] via-[#ffeac0] to-[#ffd474] px-8 py-6">
        <div className="relative z-0 max-w-2xl space-y-2">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Сурагчын самбар
          </h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Шалгалт, дүнгийн мэдээллээ нэг доороос хянаарай.
          </p>
        </div>
      </div>

      {/* 2. The Image Layer - Moved OUTSIDE the overflow-hidden div */}
      <div className="pointer-events-none absolute -top-32 right-0 z-[60] hidden h-full w-auto scale-77 origin-bottom-right md:block">
        <DashboardImage />
      </div>

      {/* Active Exams Section */}
      <section className="space-y-8">
        <div className="flex items-center gap-[26px]">
          <h3 className="text-[20px] leading-[120%] font-medium text-black">
            Идэвхтэй шалгалтууд
          </h3>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-[30px] bg-black/10 text-base leading-[120%] font-normal text-black">
            {activeExams.length}
          </span>
        </div>
        {activeExams.length === 0 ? (
          <p className="text-muted-foreground text-sm py-2">
            Одоогоор идэвхтэй шалгалт байхгүй байна.
          </p>
        ) : (
          <div className="grid grid-cols-1 justify-items-start gap-x-[34px] gap-y-6 lg:grid-cols-2">
            {activeExams.map((exam, index) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                paletteIndex={index}
                isActive={true}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Exams Section */}
      <section className="space-y-8">
        <div className="flex items-center gap-[26px]">
          <h3 className="text-[20px] leading-[120%] font-medium text-black">
            Удахгүй болох шалгалтууд
          </h3>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-[30px] bg-black/10 text-base leading-[120%] font-normal text-black">
            {scheduledExams.length}
          </span>
        </div>
        {scheduledExams.length === 0 ? (
          <p className="text-muted-foreground text-sm py-2">
            Удахгүй болох шалгалт байхгүй байна.
          </p>
        ) : (
          <div className="grid grid-cols-1 justify-items-start gap-x-[34px] gap-y-[22px] md:grid-cols-2 xl:grid-cols-3">
            {scheduledExams.map((exam, index) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                paletteIndex={index + 3}
                isActive={false}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
