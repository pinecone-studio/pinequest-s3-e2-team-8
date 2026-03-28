"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateLabelUB, formatDateTimeUB } from "@/lib/utils/date";

type StudentExamRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  max_attempts: number;
  mySessionStatus: string | null;
  myLifecycleStatus?: string | null;
  myLifecycleLabel?: string | null;
};

function groupByDate(exams: StudentExamRow[]) {
  const map = new Map<string, StudentExamRow[]>();

  for (const exam of exams) {
    const key = formatDateLabelUB(exam.start_time);

    const existing = map.get(key) ?? [];
    existing.push(exam);
    map.set(key, existing);
  }

  return map;
}

function getExamState(exam: StudentExamRow) {
  const lifecycle = exam.myLifecycleStatus ?? null;
  const persistedSessionStatus = exam.mySessionStatus ?? null;

  if (lifecycle === "in_progress") {
    return {
      label: "Үргэлжилж байна",
      badge: "secondary" as const,
      actionLabel: "Үргэлжлүүлэх",
      actionHref: `/student/exams/${exam.id}/take`,
    };
  }

  if (lifecycle === "submitted" || lifecycle === "graded") {
    return {
      label: lifecycle === "graded" ? "Дүн гарсан" : "Шалгагдаж байна",
      badge: "outline" as const,
      actionLabel: "Үр дүн",
      actionHref: `/student/exams/${exam.id}/result`,
    };
  }

  if (lifecycle === "excused") {
    return {
      label: "Чөлөөлөгдсөн",
      badge: "outline" as const,
      actionLabel: null,
      actionHref: null,
    };
  }

  if (lifecycle === "absent" || lifecycle === "timed_out") {
    return {
      label: lifecycle === "timed_out" ? "Хугацаа дууссан" : "Өгөөгүй",
      badge: "outline" as const,
      actionLabel:
        lifecycle === "timed_out" && persistedSessionStatus === "timed_out"
          ? "Үр дүн"
          : null,
      actionHref:
        lifecycle === "timed_out" && persistedSessionStatus === "timed_out"
          ? `/student/exams/${exam.id}/result`
          : null,
    };
  }

  if (lifecycle === "available" || lifecycle === "retake_available") {
    return {
      label:
        lifecycle === "retake_available"
          ? "Нөхөн өгөх боломжтой"
          : "Одоо эхлэх боломжтой",
      badge: "secondary" as const,
      actionLabel: lifecycle === "retake_available" ? "Нөхөн эхлэх" : "Эхлэх",
      actionHref: `/student/exams/${exam.id}/take`,
    };
  }

  if (lifecycle === "scheduled" || lifecycle === "retake_scheduled") {
    return {
      label:
        lifecycle === "retake_scheduled" ? "Нөхөн товлогдсон" : "Товлогдсон",
      badge: "outline" as const,
      actionLabel: null,
      actionHref: null,
    };
  }

  return {
    label: "Хугацаа дууссан",
    badge: "outline" as const,
    actionLabel: null,
    actionHref: null,
  };
}

export default function StudentScheduleBoard({
  exams,
}: {
  exams: StudentExamRow[];
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());

    updateNow();
    const intervalId = window.setInterval(updateNow, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const grouped = useMemo(() => groupByDate(exams), [exams]);
  const readyNowCount =
    now === null
      ? 0
      : exams.filter((exam) =>
          ["available", "retake_available", "in_progress"].includes(
            String(exam.myLifecycleStatus)
          )
        ).length;
  const nextSevenDaysCount =
    now === null
      ? 0
      : exams.filter((exam) => {
          const start = new Date(exam.start_time).getTime();
          return (
            ["scheduled", "retake_scheduled"].includes(
              String(exam.myLifecycleStatus)
            ) &&
            start >= now &&
            start <= now + 7 * 24 * 60 * 60 * 1000
          );
        }).length;
  const completedCount = exams.filter(
    (exam) =>
      ["submitted", "graded", "absent", "excused", "timed_out"].includes(
        String(exam.myLifecycleStatus)
      )
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6" />
            Миний хуваарь
          </h2>
          <p className="text-muted-foreground">
            Товлогдсон болон эхлэх боломжтой шалгалтуудаа өдөр өдрөөр нь харна.
          </p>
        </div>
        <Link href="/student/exams">
          <Button variant="outline">Шалгалтын жагсаалт</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Одоо эхлэх боломжтой</CardDescription>
            <CardTitle className="text-3xl">{readyNowCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Нээлттэй цонхонд орсон шалгалтууд
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>7 хоногийн дотор</CardDescription>
            <CardTitle className="text-3xl">{nextSevenDaysCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Удахгүй товлогдсон шалгалтууд
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Дууссан</CardDescription>
            <CardTitle className="text-3xl">{completedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Өгсөн эсвэл шалгагдаж буй шалгалтууд
            </p>
          </CardContent>
        </Card>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Одоогоор товлогдсон шалгалт алга.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([dateLabel, dateExams]) => (
            <div key={dateLabel} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {dateLabel}
              </h3>
              <div className="space-y-3">
                {dateExams.map((exam) => {
                  const examState = getExamState(exam);

                  return (
                    <Card key={exam.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <CardTitle className="text-base">{exam.title}</CardTitle>
                            <CardDescription className="flex flex-wrap items-center gap-2">
                              <span>{formatDateTimeUB(exam.start_time)}</span>
                              <span className="flex items-center gap-1">
                                <Clock3 className="h-3.5 w-3.5" />
                                {exam.duration_minutes} минут
                              </span>
                            </CardDescription>
                          </div>
                          <Badge variant={examState.badge}>{examState.label}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {exam.max_attempts} оролдлого
                          </Badge>
                          {exam.myLifecycleLabel && (
                            <Badge variant="outline">
                              {exam.myLifecycleLabel}
                            </Badge>
                          )}
                        </div>

                        {examState.actionHref ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={examState.actionHref}>
                              {examState.actionLabel}
                            </Link>
                          </Button>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Шалгалтын цонх нээгдэх үед эндээс шууд эхлэх боломжтой.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
