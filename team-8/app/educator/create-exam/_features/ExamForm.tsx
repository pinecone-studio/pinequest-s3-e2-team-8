"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  School2,
} from "lucide-react";
import { createExam } from "@/lib/exam/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SubjectOption {
  id: string;
  name: string;
  description: string | null;
}

interface GroupOption {
  id: string;
  name: string;
  grade: number | null;
  group_type: string;
  allowed_subject_ids: string[];
}

const weekDays = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];

function joinDateTime(date: string, time: string) {
  if (!date || !time) return "";
  return `${date}T${time}`;
}

function formatDateTime(value: string) {
  if (!value) return "Сонгоогүй";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Сонгоогүй";

  return new Intl.DateTimeFormat("mn-MN", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateLabel(dateValue: string) {
  if (!dateValue) return "Өдөр сонгох";

  const date = new Date(`${dateValue}T00:00`);
  if (Number.isNaN(date.getTime())) return "Өдөр сонгох";

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatMonthLabel(value: string) {
  const date = new Date(`${value}-01T00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildCalendarDays(monthValue: string) {
  const firstDay = new Date(`${monthValue}-01T00:00`);
  const year = firstDay.getFullYear();
  const month = firstDay.getMonth();

  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days: Array<{ value: string; day: number; muted: boolean }> = [];

  for (let i = startWeekday - 1; i >= 0; i -= 1) {
    const day = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, day);
    days.push({
      value: `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      muted: true,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({
      value: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      muted: false,
    });
  }

  while (days.length < 42) {
    const nextDay = days.length - (startWeekday + daysInMonth) + 1;
    const nextDate = new Date(year, month + 1, nextDay);
    days.push({
      value: `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`,
      day: nextDay,
      muted: true,
    });
  }

  return days;
}

function shiftMonth(monthValue: string, delta: number) {
  const date = new Date(`${monthValue}-01T00:00`);
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function splitTimeParts(value: string) {
  if (!value || !value.includes(":")) {
    return { hour: "00", minute: "00" };
  }

  const [hour, minute] = value.split(":");
  return { hour, minute };
}

function formatGroupTypeLabel(groupType: string) {
  if (groupType === "class") return "Анги";
  if (groupType === "elective") return "Сонгон";
  if (groupType === "mixed") return "Холимог";
  return groupType;
}

function buildTimeValue(hour: string, minute: string) {
  return `${hour}:${minute}`;
}

function cycleValue(current: string, max: number, step: 1 | -1) {
  const currentNumber = Number.isNaN(Number(current)) ? 0 : Number(current);
  const next = (currentNumber + step + (max + 1)) % (max + 1);
  return String(next).padStart(2, "0");
}

export default function ExamForm({
  subjects,
  groups,
}: {
  subjects: SubjectOption[];
  groups: GroupOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [subjectId, setSubjectId] = useState("__none");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [startClock, setStartClock] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endClock, setEndClock] = useState("");
  const [openPicker, setOpenPicker] = useState<
    null | "start-date" | "start-time" | "end-date" | "end-time"
  >(null);
  const [startMonth, setStartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [endMonth, setEndMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const startTime = joinDateTime(startDate, startClock);
  const endTime = joinDateTime(endDate, endClock);
  const startTimeParts = splitTimeParts(startClock);
  const endTimeParts = splitTimeParts(endClock);
  const startCalendarDays = buildCalendarDays(startMonth);
  const endCalendarDays = buildCalendarDays(endMonth);
  function getGroupsForSubject(nextSubjectId: string) {
    if (nextSubjectId === "__none") return [];
    return groups.filter(
      (group) =>
        group.allowed_subject_ids.length === 0 ||
        group.allowed_subject_ids.includes(nextSubjectId)
    );
  }
  const availableGroups = getGroupsForSubject(subjectId);
  const selectedGroups = groups.filter((group) =>
    selectedGroupIds.includes(group.id)
  );

  const durationSummary = useMemo(() => {
    if (!startTime || !endTime) {
      return {
        minutes: "",
        text: "Өдөр, цагаа бүрэн сонгоно уу.",
        invalid: false,
      };
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return {
        minutes: "",
        text: "Оруулсан өдөр эсвэл цаг буруу байна.",
        invalid: true,
      };
    }

    const diff = Math.round((end.getTime() - start.getTime()) / 60000);
    if (diff <= 0) {
      return {
        minutes: "",
        text: "Дуусах хугацаа нь эхлэх хугацаанаас хойш байх ёстой.",
        invalid: true,
      };
    }

    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    const parts = [
      hours > 0 ? `${hours} цаг` : null,
      minutes > 0 ? `${minutes} минут` : null,
    ].filter(Boolean);

    return {
      minutes: String(diff),
      text: parts.join(" "),
      invalid: false,
    };
  }, [endTime, startTime]);

  function handleSubjectChange(nextSubjectId: string) {
    const nextGroups = getGroupsForSubject(nextSubjectId);
    setSubjectId(nextSubjectId);
    setSelectedGroupIds((prev) =>
      prev.filter((groupId) => nextGroups.some((group) => group.id === groupId))
    );
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  }

  function adjustStartTime(part: "hour" | "minute", step: 1 | -1) {
    const hour =
      part === "hour"
        ? cycleValue(startTimeParts.hour, 23, step)
        : startTimeParts.hour;
    const minute =
      part === "minute"
        ? cycleValue(startTimeParts.minute, 59, step)
        : startTimeParts.minute;
    setStartClock(buildTimeValue(hour, minute));
  }

  function adjustEndTime(part: "hour" | "minute", step: 1 | -1) {
    const hour =
      part === "hour"
        ? cycleValue(endTimeParts.hour, 23, step)
        : endTimeParts.hour;
    const minute =
      part === "minute"
        ? cycleValue(endTimeParts.minute, 59, step)
        : endTimeParts.minute;
    setEndClock(buildTimeValue(hour, minute));
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    formData.set("start_time", startTime);
    formData.set("end_time", endTime);
    formData.set("duration_minutes", durationSummary.minutes);

    const result = await createExam(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-4xl">
      <CardHeader className="space-y-2">
        <CardTitle>Шалгалтын мэдээлэл</CardTitle>
        <CardDescription>
          Хичээл, бүлэг, хугацаагаа сонгоод дараагийн шатанд асуултаа нэмнэ.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <input type="hidden" name="start_time" value={startTime} />
          <input type="hidden" name="end_time" value={endTime} />
          <input
            type="hidden"
            name="duration_minutes"
            value={durationSummary.minutes}
          />

          <div className="space-y-2">
            <Label htmlFor="title">Шалгалтын нэр *</Label>
            <Input
              id="title"
              name="title"
              placeholder="Жишээ: Математик - 1-р улирал"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Хичээл *</Label>
              <Select value={subjectId} onValueChange={handleSubjectChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Хичээл сонгох" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Сонгоогүй</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="hidden"
                name="subject_id"
                value={subjectId === "__none" ? "" : subjectId}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-muted/15 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <Label>Оноох анги / бүлгүүд</Label>
                <p className="text-sm text-muted-foreground">
                  Нэг шалгалтыг хэд хэдэн анги, сонгон бүлэгт зэрэг оноож болно.
                </p>
              </div>
              <Badge variant="outline" className="h-auto py-1">
                {selectedGroupIds.length} бүлэг сонгосон
              </Badge>
            </div>

            {selectedGroupIds.map((groupId) => (
              <input key={groupId} type="hidden" name="group_ids" value={groupId} />
            ))}

            {subjectId === "__none" ? (
              <div className="rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
                Эхлээд хичээлээ сонгоод, дараа нь энэ хичээлд хамрагдах анги,
                сонгон бүлгүүдээ тэмдэглэнэ үү.
              </div>
            ) : availableGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
                Сонгосон хичээл дээр танд оноогдсон бүлэг одоогоор алга байна.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {availableGroups.map((group) => {
                  const selected = selectedGroupIds.includes(group.id);

                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:border-primary/40 hover:bg-muted/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{group.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {group.grade
                              ? `${group.grade}-р анги`
                              : "Анги заагаагүй"}
                            {` · ${formatGroupTypeLabel(group.group_type)}`}
                          </p>
                        </div>
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                            selected ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          <School2 className="h-4 w-4" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedGroups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedGroups.map((group) => (
                  <button
                    key={`selected-${group.id}`}
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="rounded-full border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Тайлбар</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Шалгалтын тухай товч мэдээлэл..."
              rows={3}
            />
          </div>

          <div className="rounded-2xl border p-5">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <p className="font-medium">Шалгалтын хугацаа</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border bg-background p-4">
                <p className="text-sm font-medium">Эхлэх</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPicker((prev) =>
                          prev === "start-date" ? null : "start-date"
                        )
                      }
                      className="flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span>{formatDateLabel(startDate)}</span>
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    </button>

                    {openPicker === "start-date" && (
                      <div className="absolute left-0 z-20 mt-2 w-[320px] rounded-2xl border bg-background p-4 shadow-xl">
                        <div className="mb-4 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() =>
                              setStartMonth((prev) => shiftMonth(prev, -1))
                            }
                            className="rounded-md p-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <p className="text-sm font-medium">
                            {formatMonthLabel(startMonth)}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setStartMonth((prev) => shiftMonth(prev, 1))
                            }
                            className="rounded-md p-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                          {weekDays.map((day) => (
                            <div key={day} className="py-2">
                              {day}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {startCalendarDays.map((day) => (
                            <button
                              key={`${day.value}-${day.day}`}
                              type="button"
                              onClick={() => {
                                setStartDate(day.value);
                                setOpenPicker(null);
                              }}
                              className={`h-10 rounded-xl text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                startDate === day.value
                                  ? "bg-black text-white"
                                  : day.muted
                                    ? "text-muted-foreground hover:bg-muted"
                                    : "hover:bg-muted"
                              }`}
                            >
                              {day.day}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPicker((prev) =>
                          prev === "start-time" ? null : "start-time"
                        )
                      }
                      className="flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span>{startClock || "Цаг сонгох"}</span>
                      <Clock3 className="h-4 w-4 text-muted-foreground" />
                    </button>

                    {openPicker === "start-time" && (
                      <div className="absolute left-0 z-20 mt-2 w-[220px] rounded-2xl border bg-background p-3 shadow-xl">
                        <div className="rounded-2xl border bg-muted/20 px-3 py-2">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div className="space-y-1 text-center">
                              <button
                                type="button"
                                onClick={() => adjustStartTime("hour", 1)}
                                className="flex w-full justify-center rounded-md py-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight className="h-4 w-4 -rotate-90" />
                              </button>
                              <div className="rounded-xl bg-background py-2 text-2xl font-semibold shadow-sm">
                                {startTimeParts.hour}
                              </div>
                              <button
                                type="button"
                                onClick={() => adjustStartTime("hour", -1)}
                                className="flex w-full justify-center rounded-md py-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight className="h-4 w-4 rotate-90" />
                              </button>
                            </div>

                            <div className="pt-1 text-2xl font-semibold text-muted-foreground">
                              :
                            </div>

                            <div className="space-y-1 text-center">
                              <button
                                type="button"
                                onClick={() => adjustStartTime("minute", 1)}
                                className="flex w-full justify-center rounded-md py-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight className="h-4 w-4 -rotate-90" />
                              </button>
                              <div className="rounded-xl bg-background py-2 text-2xl font-semibold shadow-sm">
                                {startTimeParts.minute}
                              </div>
                              <button
                                type="button"
                                onClick={() => adjustStartTime("minute", -1)}
                                className="flex w-full justify-center rounded-md py-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight className="h-4 w-4 rotate-90" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  {formatDateTime(startTime)}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border bg-background p-4">
                <p className="text-sm font-medium">Дуусах</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPicker((prev) =>
                          prev === "end-date" ? null : "end-date"
                        )
                      }
                      className="flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span>{formatDateLabel(endDate)}</span>
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    </button>

                    {openPicker === "end-date" && (
                      <div className="absolute left-0 z-20 mt-2 w-[320px] rounded-2xl border bg-background p-4 shadow-xl">
                        <div className="mb-4 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() =>
                              setEndMonth((prev) => shiftMonth(prev, -1))
                            }
                            className="rounded-md p-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <p className="text-sm font-medium">
                            {formatMonthLabel(endMonth)}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setEndMonth((prev) => shiftMonth(prev, 1))
                            }
                            className="rounded-md p-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                          {weekDays.map((day) => (
                            <div key={day} className="py-2">
                              {day}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {endCalendarDays.map((day) => (
                            <button
                              key={`${day.value}-${day.day}`}
                              type="button"
                              onClick={() => {
                                setEndDate(day.value);
                                setOpenPicker(null);
                              }}
                              className={`h-10 rounded-xl text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                endDate === day.value
                                  ? "bg-black text-white"
                                  : day.muted
                                    ? "text-muted-foreground hover:bg-muted"
                                    : "hover:bg-muted"
                              }`}
                            >
                              {day.day}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPicker((prev) =>
                          prev === "end-time" ? null : "end-time"
                        )
                      }
                      className="flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span>{endClock || "Цаг сонгох"}</span>
                      <Clock3 className="h-4 w-4 text-muted-foreground" />
                    </button>

                    {openPicker === "end-time" && (
                      <div className="absolute left-0 z-20 mt-2 w-[220px] rounded-2xl border bg-background p-3 shadow-xl">
                        <div className="rounded-2xl border bg-muted/20 px-3 py-2">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div className="space-y-1 text-center">
                              <button
                                type="button"
                                onClick={() => adjustEndTime("hour", 1)}
                                className="flex w-full justify-center rounded-md py-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight className="h-4 w-4 -rotate-90" />
                              </button>
                              <div className="rounded-xl bg-background py-2 text-2xl font-semibold shadow-sm">
                                {endTimeParts.hour}
                              </div>
                              <button
                                type="button"
                                onClick={() => adjustEndTime("hour", -1)}
                                className="flex w-full justify-center rounded-md py-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight className="h-4 w-4 rotate-90" />
                              </button>
                            </div>

                            <div className="pt-1 text-2xl font-semibold text-muted-foreground">
                              :
                            </div>

                            <div className="space-y-1 text-center">
                              <button
                                type="button"
                                onClick={() => adjustEndTime("minute", 1)}
                                className="flex w-full justify-center rounded-md py-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight className="h-4 w-4 -rotate-90" />
                              </button>
                              <div className="rounded-xl bg-background py-2 text-2xl font-semibold shadow-sm">
                                {endTimeParts.minute}
                              </div>
                              <button
                                type="button"
                                onClick={() => adjustEndTime("minute", -1)}
                                className="flex w-full justify-center rounded-md py-1 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight className="h-4 w-4 rotate-90" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  {formatDateTime(endTime)}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Хугацаа</p>
              </div>
              <p
                className={`mt-2 text-sm ${
                  durationSummary.invalid
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {durationSummary.text}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="passing_score">Тэнцэх оноо (%)</Label>
              <Input
                id="passing_score"
                name="passing_score"
                type="number"
                min="0"
                max="100"
                placeholder="60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_attempts">Оролдлогын тоо</Label>
              <Input
                id="max_attempts"
                name="max_attempts"
                type="number"
                min="1"
                max="10"
                placeholder="1"
                defaultValue="1"
              />
            </div>
          </div>

          <Button
            type="submit"
            loading={loading}
            disabled={durationSummary.invalid || !durationSummary.minutes}
            loadingText="Үүсгэж байна..."
            className="w-full"
          >
            Үүсгэх ба асуулт нэмэх →
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
