"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Users2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AdminScheduleExam = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
  subject_name: string | null;
  room: string | null;
  groups: { id: string; name: string }[];
  conflicts: { examTitle: string; reason: "shared_students" | "same_room" }[];
};

type ExamStatus = "live" | "scheduled" | "draft" | "completed";
type CalendarView = "month" | "week" | "day";

type CalendarExam = AdminScheduleExam & {
  dateKey: string;
  status: ExamStatus;
  startMs: number;
};

const ULAANBAATAR_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["Дав", "Мяг", "Лха", "Пүр", "Баа", "Бям", "Ням"];
const WEEKDAY_LONG_LABELS = [
  "Даваа",
  "Мягмар",
  "Лхагва",
  "Пүрэв",
  "Баасан",
  "Бямба",
  "Ням",
];
const VIEW_LABELS: Record<CalendarView, string> = {
  month: "Сар",
  week: "7 хоног",
  day: "Өдөр",
};

const STATUS_META: Record<
  ExamStatus,
  {
    label: string;
    pillClassName: string;
    eventClassName: string;
  }
> = {
  live: {
    label: "Явагдаж буй",
    pillClassName: "bg-[#2F80ED] text-white",
    eventClassName: "bg-[#dce9ff] text-[#3156a6]",
  },
  completed: {
    label: "Дууссан",
    pillClassName: "bg-[#4CAF50] text-white",
    eventClassName: "bg-[#d8f2da] text-[#367c3c]",
  },
  draft: {
    label: "Ноорог",
    pillClassName: "bg-[#F6C343] text-white",
    eventClassName: "bg-[#ffe7a4] text-[#9a6a06]",
  },
  scheduled: {
    label: "Товлогдсон",
    pillClassName: "bg-[#9cc2ff] text-[#3156a6]",
    eventClassName: "bg-[#dce9ff] text-[#3156a6]",
  },
};

function getSafeTimestamp(dateLike?: string | number | Date | null) {
  if (typeof dateLike === "number") {
    return Number.isFinite(dateLike) ? dateLike : Date.now();
  }

  if (dateLike instanceof Date) {
    const timestamp = dateLike.getTime();
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  }

  if (typeof dateLike === "string") {
    const timestamp = new Date(dateLike).getTime();
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  }

  return Date.now();
}

function parseDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  return parsed;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getUbDateParts(dateLike: string | number | Date) {
  const timestamp = getSafeTimestamp(dateLike);
  const shifted = new Date(timestamp + ULAANBAATAR_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    weekdayIndex: (shifted.getUTCDay() + 6) % 7,
  };
}

function toUbDateKey(dateLike: string | number | Date) {
  const { year, month, day } = getUbDateParts(dateLike);
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatTimeLabel(dateLike: string | number | Date) {
  const { hours, minutes } = getUbDateParts(dateLike);
  return `${pad(hours)}:${pad(minutes)}`;
}

function formatMonthDay(dateKey: string) {
  const date = parseDateKey(dateKey);
  return `${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`;
}

function formatDateLabel(dateKey: string) {
  const date = parseDateKey(dateKey);
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`;
}

function formatWeekday(dateKey: string, variant: "short" | "long" = "short") {
  const weekdayIndex = (parseDateKey(dateKey).getUTCDay() + 6) % 7;
  return variant === "long"
    ? WEEKDAY_LONG_LABELS[weekdayIndex] ?? ""
    : WEEKDAY_LABELS[weekdayIndex] ?? "";
}

function formatMonthLabel(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    const nowKey = toUbDateKey(Date.now()).slice(0, 7);
    const [year, month] = nowKey.split("-").map(Number);
    return `${year}.${pad(month)}`;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  return `${year}.${pad(month)}`;
}

function shiftDateKey(dateKey: string, amount: number) {
  const nextDate = parseDateKey(dateKey);
  nextDate.setUTCDate(nextDate.getUTCDate() + amount);
  return nextDate.toISOString().slice(0, 10);
}

function shiftMonthKey(monthKey: string, amount: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  const safeMonthKey = match ? monthKey : toUbDateKey(Date.now()).slice(0, 7);
  const [year, month] = safeMonthKey.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${nextMonth.getUTCFullYear()}-${String(
    nextMonth.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

function buildMonthGrid(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  const safeMonthKey = match ? monthKey : toUbDateKey(Date.now()).slice(0, 7);
  const [year, month] = safeMonthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));

  if (Number.isNaN(firstDay.getTime())) {
    return buildMonthGrid(toUbDateKey(Date.now()).slice(0, 7));
  }

  const weekOffset = (firstDay.getUTCDay() + 6) % 7;
  const startDate = new Date(Date.UTC(year, month - 1, 1 - weekOffset));

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(startDate);
    cellDate.setUTCDate(startDate.getUTCDate() + index);
    return cellDate.toISOString().slice(0, 10);
  });
}

function buildWeekGrid(dateKey: string) {
  const date = parseDateKey(dateKey);
  const weekOffset = (date.getUTCDay() + 6) % 7;
  const startDate = new Date(date);
  startDate.setUTCDate(date.getUTCDate() - weekOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const cellDate = new Date(startDate);
    cellDate.setUTCDate(startDate.getUTCDate() + index);
    return cellDate.toISOString().slice(0, 10);
  });
}

function getExamStatus(exam: AdminScheduleExam, nowMs: number): ExamStatus {
  if (!exam.is_published) {
    return "draft";
  }

  const startMs = new Date(exam.start_time).getTime();
  const endMs = new Date(exam.end_time).getTime();

  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs >= startMs && nowMs <= endMs) {
    return "live";
  }

  if (!Number.isNaN(startMs) && nowMs < startMs) {
    return "scheduled";
  }

  return "completed";
}

function getHeaderLabel(view: CalendarView, monthKey: string, dateKey: string) {
  if (view === "month") {
    return formatMonthLabel(monthKey);
  }

  if (view === "week") {
    const week = buildWeekGrid(dateKey);
    return `${formatMonthDay(week[0] ?? dateKey)} - ${formatMonthDay(week[6] ?? dateKey)}`;
  }

  return `${formatDateLabel(dateKey)} ${formatWeekday(dateKey)}`;
}

function getGroupsLabel(groups: { id: string; name: string }[]) {
  if (groups.length === 0) {
    return "Бүлэг оноогоогүй";
  }

  if (groups.length <= 2) {
    return groups.map((group) => group.name).join(", ");
  }

  return `${groups[0]?.name}, ${groups[1]?.name} +${groups.length - 2}`;
}

function CalendarEventPill({
  exam,
  compact = false,
}: {
  exam: CalendarExam;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-full px-3 py-1 text-center text-xs font-medium",
        STATUS_META[exam.status].eventClassName,
        compact ? "truncate px-2 py-0.5 text-[10px]" : ""
      )}
      title={`${exam.title} | ${formatTimeLabel(exam.start_time)} - ${formatTimeLabel(
        exam.end_time
      )}`}
    >
      {exam.title}
    </div>
  );
}

export default function AdminExamCalendar({
  scheduleRows,
  initialNowIso,
}: {
  scheduleRows: AdminScheduleExam[];
  initialNowIso?: string;
}) {
  const initialNowMs = getSafeTimestamp(initialNowIso);
  const initialTodayKey = toUbDateKey(initialNowMs);
  const [nowMs, setNowMs] = useState(initialNowMs);
  const [selectedDateKey, setSelectedDateKey] = useState(initialTodayKey);
  const [visibleMonthKey, setVisibleMonthKey] = useState(
    initialTodayKey.slice(0, 7)
  );
  const [view, setView] = useState<CalendarView>("month");

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const todayKey = useMemo(() => toUbDateKey(nowMs), [nowMs]);

  const exams = useMemo<CalendarExam[]>(() => {
    return scheduleRows
      .map((exam) => ({
        ...exam,
        dateKey: toUbDateKey(exam.start_time),
        status: getExamStatus(exam, nowMs),
        startMs: new Date(exam.start_time).getTime(),
      }))
      .sort((left, right) => left.startMs - right.startMs);
  }, [nowMs, scheduleRows]);

  const examsByDate = useMemo(() => {
    const nextMap = new Map<string, CalendarExam[]>();

    for (const exam of exams) {
      const existing = nextMap.get(exam.dateKey) ?? [];
      existing.push(exam);
      nextMap.set(exam.dateKey, existing);
    }

    return nextMap;
  }, [exams]);

  const monthGrid = useMemo(() => buildMonthGrid(visibleMonthKey), [visibleMonthKey]);
  const weekGrid = useMemo(() => buildWeekGrid(selectedDateKey), [selectedDateKey]);
  const selectedDateExams = examsByDate.get(selectedDateKey) ?? [];
  const selectedDateLiveCount = selectedDateExams.filter(
    (exam) => exam.status === "live"
  ).length;
  const selectedDateAttentionCount = selectedDateExams.filter(
    (exam) => exam.conflicts.length > 0 || exam.status === "draft"
  ).length;

  function handleNavigate(direction: number) {
    if (view === "month") {
      const nextMonthKey = shiftMonthKey(visibleMonthKey, direction);
      setVisibleMonthKey(nextMonthKey);
      setSelectedDateKey(`${nextMonthKey}-01`);
      return;
    }

    if (view === "week") {
      const nextDateKey = shiftDateKey(selectedDateKey, direction * 7);
      setSelectedDateKey(nextDateKey);
      setVisibleMonthKey(nextDateKey.slice(0, 7));
      return;
    }

    const nextDateKey = shiftDateKey(selectedDateKey, direction);
    setSelectedDateKey(nextDateKey);
    setVisibleMonthKey(nextDateKey.slice(0, 7));
  }

  function handleGoToday() {
    setSelectedDateKey(todayKey);
    setVisibleMonthKey(todayKey.slice(0, 7));
  }

  return (
    <div className="flex flex-col gap-7.5">
    <Card className="rounded-[28px] border-zinc-200 shadow-none">
      <CardContent className="p-4 md:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-semibold tracking-tight text-[#1d3d8f]">
                  Шалгалтын календарь
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-xl border-zinc-200 px-3 text-sm text-zinc-500"
                  onClick={handleGoToday}
                >
                  Өнөөдөр
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 text-[#1d3d8f]">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[#3156a6] transition-colors hover:bg-zinc-100"
                    onClick={() => handleNavigate(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[160px] text-center text-lg font-semibold">
                    {getHeaderLabel(view, visibleMonthKey, selectedDateKey)}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[#3156a6] transition-colors hover:bg-zinc-100"
                    onClick={() => handleNavigate(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="inline-flex rounded-xl border border-[#d9e5ff] bg-white p-1">
                  {(["month", "week", "day"] as CalendarView[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setView(option);
                        if (option !== "month") {
                          setVisibleMonthKey(selectedDateKey.slice(0, 7));
                        }
                      }}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                        view === option
                          ? "bg-[#2F80ED] text-white"
                          : "text-[#3156a6] hover:bg-[#eef4ff]"
                      )}
                    >
                      {VIEW_LABELS[option]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {view === "month" ? (
              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-7 border border-zinc-100 border-b-0">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <div
                        key={label}
                        className={cn(
                          "border-b border-r border-zinc-100 px-3 py-2 text-center text-sm font-medium",
                          index === 6 ? "border-r-0 text-[#ef4444]" : "text-[#3156a6]"
                        )}
                      >
                        {label}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 border-x border-b border-zinc-100">
                    {monthGrid.map((dateKey, index) => {
                      const dayExams = examsByDate.get(dateKey) ?? [];
                      const isCurrentMonth = dateKey.startsWith(visibleMonthKey);
                      const isSelected = selectedDateKey === dateKey;
                      const isToday = todayKey === dateKey;

                      return (
                        <button
                          key={dateKey}
                          type="button"
                          onClick={() => setSelectedDateKey(dateKey)}
                          className={cn(
                            "min-h-[92px] border-r border-t border-zinc-100 px-2.5 py-2.5 text-left align-top transition-colors",
                            index % 7 === 6 ? "border-r-0" : "",
                            !isCurrentMonth && "bg-zinc-50/60 text-zinc-300",
                            isSelected && "bg-[#f5f9ff]",
                            isToday && "shadow-[inset_0_0_0_1px_rgba(47,128,237,0.18)]"
                          )}
                        >
                          <div className="flex h-full flex-col">
                            <span
                              className={cn(
                                "text-right text-xs font-semibold",
                                isCurrentMonth ? "text-[#3156a6]" : "text-zinc-300"
                              )}
                            >
                              {parseDateKey(dateKey).getUTCDate()}
                            </span>

                            <div className="mt-2.5 space-y-1.5">
                              {dayExams.slice(0, 1).map((exam) => (
                                <CalendarEventPill key={exam.id} exam={exam} compact />
                              ))}
                              {dayExams.length > 1 ? (
                                <p className="px-1 text-xs font-medium text-zinc-400">
                                  +{dayExams.length - 1} бусад
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {view === "week" ? (
              <div className="grid gap-3 md:grid-cols-7">
                {weekGrid.map((dateKey) => {
                  const dayExams = examsByDate.get(dateKey) ?? [];
                  const isToday = dateKey === todayKey;
                  const isSelected = dateKey === selectedDateKey;

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => setSelectedDateKey(dateKey)}
                      className={cn(
                        "min-h-[180px] rounded-[20px] border border-zinc-100 px-3 py-3 text-left transition-colors",
                        isSelected ? "bg-[#f5f9ff] shadow-[inset_0_0_0_1px_rgba(47,128,237,0.2)]" : "bg-white",
                        isToday && "border-[#cfe0ff]"
                      )}
                    >
                      <p className="text-sm font-semibold text-[#3156a6]">
                        {formatWeekday(dateKey)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {formatMonthDay(dateKey)}
                      </p>

                      <div className="mt-3 space-y-1.5">
                        {dayExams.length > 0 ? (
                          dayExams.slice(0, 2).map((exam) => (
                            <div key={exam.id} className="space-y-1">
                              <CalendarEventPill exam={exam} compact />
                              <p className="px-1 text-[11px] text-zinc-400">
                                {formatTimeLabel(exam.start_time)} - {formatTimeLabel(exam.end_time)}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="pt-10 text-xs text-zinc-300">Шалгалтгүй</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {view === "day" ? (
              <div className="space-y-3">
                {selectedDateExams.length > 0 ? (
                  selectedDateExams.map((exam) => (
                    <div
                      key={exam.id}
                      className="flex items-center justify-between rounded-[20px] border border-zinc-100 px-3.5 py-3.5"
                    >
                      <div className="space-y-1">
                        <CalendarEventPill exam={exam} />
                        <p className="text-sm font-semibold text-zinc-900">
                          {exam.title}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {formatTimeLabel(exam.start_time)} - {formatTimeLabel(exam.end_time)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">
                    Энэ өдөрт товлогдсон шалгалт алга.
                  </div>
                )}
              </div>
            ) : null}
          </div>

      
        </div>
      </CardContent>
    </Card>
    <aside className="border-t border-zinc-100 pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
            <div className="space-y-1">
              <h4 className="text-xl font-semibold tracking-tight text-[#1d3d8f]">
                Өдрийн тойм
              </h4>
              <p className="text-xs text-zinc-400">
                {`${formatDateLabel(selectedDateKey)} · ${formatWeekday(selectedDateKey, "long")}`}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-[18px] bg-[#f6f9ff] px-3 py-3">
                <p className="text-[11px] text-zinc-500">Шалгалт</p>
                <p className="mt-1 text-xl font-semibold text-[#1d3d8f]">
                  {selectedDateExams.length}
                </p>
              </div>
              <div className="rounded-[18px] bg-[#f6f9ff] px-3 py-3">
                <p className="text-[11px] text-zinc-500">Явагдаж буй</p>
                <p className="mt-1 text-xl font-semibold text-[#1d3d8f]">
                  {selectedDateLiveCount}
                </p>
              </div>
              <div className="rounded-[18px] bg-[#fff7e5] px-3 py-3">
                <p className="text-[11px] text-zinc-500">Анхаарах</p>
                <p className="mt-1 text-xl font-semibold text-[#9a6a06]">
                  {selectedDateAttentionCount}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {selectedDateExams.length > 0 ? (
                selectedDateExams.map((exam) => (
                  <div
                    key={exam.id}
                    className="rounded-[22px] border border-zinc-100 px-3.5 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
                            STATUS_META[exam.status].pillClassName
                          )}
                        >
                          {STATUS_META[exam.status].label}
                        </span>
                        <p className="mt-2 text-sm font-semibold leading-5 text-zinc-900">
                          {exam.title}
                        </p>
                        {exam.subject_name ? (
                          <p className="mt-1 text-xs text-zinc-500">{exam.subject_name}</p>
                        ) : null}
                      </div>
                      <CalendarDays className="mt-1 h-4 w-4 shrink-0 text-zinc-300" />
                    </div>

                    <div className="mt-3 space-y-2 text-xs text-zinc-500">
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-3.5 w-3.5 text-zinc-400" />
                        <span>
                          {formatTimeLabel(exam.start_time)} - {formatTimeLabel(exam.end_time)}
                        </span>
                      </div>

                      {exam.room ? (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                          <span>{exam.room}</span>
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2">
                        <Users2 className="h-3.5 w-3.5 text-zinc-400" />
                        <span>{getGroupsLabel(exam.groups)}</span>
                      </div>
                    </div>

                    {exam.conflicts.length > 0 ? (
                      <div className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">
                        {exam.conflicts.length} зөрчил илэрсэн
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-zinc-200 px-4 py-7 text-sm text-zinc-400">
                  Сонгосон өдөрт шалгалтын тов алга.
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[22px] bg-[#f8fbff] px-4 py-4">
              <p className="text-sm font-semibold text-[#1d3d8f]">Төлөвийн тайлбар</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(STATUS_META).map(([status, meta]) => (
                  <span
                    key={status}
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
                      meta.pillClassName
                    )}
                  >
                    {meta.label}
                  </span>
                ))}
              </div>
            </div>
          </aside></div>
  );
}
