import Link from "next/link";
import {
  CalendarRange,
  Clock3,
  School,
  ShieldAlert,
  Users,
} from "lucide-react";
import { getAdminStats } from "@/lib/admin/actions";
import { getExamSchedules } from "@/lib/schedule/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateLabelUB, formatDateStampUB, formatTimeUB } from "@/lib/utils/date";
import AdminExamCalendar from "./_features/AdminExamCalendar";

function getExamStatus(
  exam: {
    start_time: string;
    end_time: string;
    is_published: boolean;
  },
  nowMs: number
) {
  if (!exam.is_published) return "draft";

  const startMs = new Date(exam.start_time).getTime();
  const endMs = new Date(exam.end_time).getTime();

  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs >= startMs && nowMs <= endMs) {
    return "live";
  }

  if (!Number.isNaN(startMs) && startMs > nowMs) {
    return "scheduled";
  }

  return "completed";
}

export default async function AdminDashboard() {
  const [stats, scheduleRows] = await Promise.all([
    getAdminStats(),
    getExamSchedules(),
  ]);

  const now = new Date();
  const initialNowIso = now.toISOString();
  const nowMs = now.getTime();
  const todayKey = formatDateStampUB(now);
  const weekEndMs = nowMs + 7 * 24 * 60 * 60 * 1000;

  const todayCount = scheduleRows.filter(
    (exam) => formatDateStampUB(exam.start_time) === todayKey
  ).length;
  const liveCount = scheduleRows.filter(
    (exam) => getExamStatus(exam, nowMs) === "live"
  ).length;
  const upcomingWeekCount = scheduleRows.filter((exam) => {
    const startMs = new Date(exam.start_time).getTime();
    return !Number.isNaN(startMs) && startMs >= nowMs && startMs < weekEndMs;
  }).length;
  const attentionCount = scheduleRows.filter(
    (exam) => !exam.is_published || exam.conflicts.length > 0
  ).length;
  const draftCount = scheduleRows.filter((exam) => !exam.is_published).length;
  const conflictCount = scheduleRows.filter((exam) => exam.conflicts.length > 0).length;
  const nextExam =
    scheduleRows.find((exam) => {
      const startMs = new Date(exam.start_time).getTime();
      return !Number.isNaN(startMs) && startMs >= nowMs;
    }) ?? null;

  const overviewCards = [
    {
      title: "Өнөөдрийн шалгалт",
      value: todayCount,
      helper: todayCount > 0 ? "Өнөөдөр хуваарьтай" : "Өнөөдөр шалгалтгүй",
      icon: CalendarRange,
    },
    {
      title: "Яг одоо явагдаж буй",
      value: liveCount,
      helper: liveCount > 0 ? "Хяналт шаардлагатай" : "Одоогоор эхлээгүй",
      icon: Clock3,
    },
    {
      title: "Ирэх 7 хоног",
      value: upcomingWeekCount,
      helper: "Товлогдсон шалгалтууд",
      icon: CalendarRange,
    },
    {
      title: "Анхаарах зүйл",
      value: attentionCount,
      helper: `${draftCount} ноорог, ${conflictCount} зөрчил`,
      icon: ShieldAlert,
    },
  ];

  const systemCards = [
    {
      title: "Нийт хэрэглэгч",
      value: stats.totalUsers,
      helper: "Системд бүртгэлтэй",
      icon: Users,
    },
    {
      title: "Багш нар",
      value: stats.totalTeachers,
      helper: "Хичээл зааж буй багш",
      icon: School,
    },
    {
      title: "Сурагчид",
      value: stats.totalStudents,
      helper: "Идэвхтэй сурагчдын бүртгэл",
      icon: Users,
    },
    {
      title: "Нийт шалгалт",
      value: stats.totalExams,
      helper: `Шалгасан дүн: ${stats.totalSessions}`,
      icon: CalendarRange,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_top_left,_rgba(180,160,200,0.6),_transparent_40%),linear-gradient(135deg,#9b8aac_0%,#c4906a_45%,#e8824a_75%,#f0935a_100%)] p-5 text-white shadow-sm md:p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl space-y-3">
            <Badge className=" bg-white px-6.5 py-2 h-8.5 text-black text-[16px]">
              {formatDateLabelUB(now)}
            </Badge>
            <div className="space-y-2">
              <h2 className="text-[24px] font-semibold tracking-tight md:text-[2rem]">
                Сургалтын менежерийн dashboard
              </h2>
              <p className="text-[16px]  md:text-base">
                Өнөөдөр болон ирэх өдрүүдийн шалгалтын тов, анхаарах зөрчил,
                системийн ерөнхий төлөвийг нэг дороос хянахад зориулсан самбар.
              </p>
            </div>
            {/* <p className="text-sm text-blue-50/85">
              {nextExam
                ? `Дараагийн шалгалт: ${nextExam.title} · ${formatDateLabelUB(nextExam.start_time)} · ${formatTimeUB(nextExam.start_time)}`
                : "Ойрын хугацаанд товлогдсон шинэ шалгалт алга."}
            </p> */}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/admin/teachers">
              <Button className="h-11 w-full rounded-2xl bg-white text-[#1d3d8f] hover:bg-blue-50">
                <School className="mr-2 h-4 w-4" />
                Хичээл оноолт
              </Button>
            </Link>
            <Link href="/admin/users">
              <Button
                variant="outline"
                className="h-11 w-full rounded-2xl border-white/35 bg-white/8 text-white hover:bg-white/12 hover:text-white"
              >
                <Users className="mr-2 h-4 w-4" />
                Хэрэглэгч удирдах
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.title}
                className="rounded-[24px] border border-white/12 bg-white/10 px-4 py-4 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-blue-50/85">{card.title}</p>
                  <Icon className="h-4 w-4 text-blue-50/80" />
                </div>
                <p className="mt-3 text-3xl font-semibold leading-none">{card.value}</p>
                <p className="mt-2 text-sm text-blue-50/80">{card.helper}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {systemCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.title}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-4 shadow-none"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-500">{card.title}</p>
                <div className="rounded-full bg-[#eef4ff] p-2 text-[#3156a6]">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950">
                {card.value}
              </p>
              <p className="mt-2 text-sm text-zinc-500">{card.helper}</p>
            </div>
          );
        })}
      </section> */}

      <AdminExamCalendar scheduleRows={scheduleRows} initialNowIso={initialNowIso} />
    </div>
  );
}
