"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type FieldErrors = {
  title?: string;
  subject?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  duration?: string;
  activeDays?: string;
};

const weekDays = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];

type ExamDraft = {
  title: string;
  subjectId: string;
  selectedGroupIds: string[];
  startDate: string;
  startClock: string;
  endDate: string;
  endClock: string;
  durationMinutes: string;
  activeDays: string;
  description: string;
  passingScore: string;
  maxAttempts: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
};

const CREATE_EXAM_DRAFT_STORAGE_KEY = "educator:create-exam:draft:v2";

function parseExamDraft(rawValue: string | null): ExamDraft | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<ExamDraft>;

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      subjectId:
        typeof parsed.subjectId === "string" ? parsed.subjectId : "__none",
      selectedGroupIds: Array.isArray(parsed.selectedGroupIds)
        ? parsed.selectedGroupIds.filter(
            (groupId): groupId is string => typeof groupId === "string"
          )
        : [],
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : "",
      startClock:
        typeof parsed.startClock === "string" ? parsed.startClock : "",
      endDate: typeof parsed.endDate === "string" ? parsed.endDate : "",
      endClock: typeof parsed.endClock === "string" ? parsed.endClock : "",
      durationMinutes:
        typeof parsed.durationMinutes === "string" ? parsed.durationMinutes : "",
      activeDays:
        typeof parsed.activeDays === "string" && parsed.activeDays
          ? parsed.activeDays
          : "1",
      description:
        typeof parsed.description === "string" ? parsed.description : "",
      passingScore:
        typeof parsed.passingScore === "string" ? parsed.passingScore : "",
      maxAttempts:
        typeof parsed.maxAttempts === "string" && parsed.maxAttempts
          ? parsed.maxAttempts
          : "1",
      shuffleQuestions: Boolean(parsed.shuffleQuestions),
      shuffleOptions: Boolean(parsed.shuffleOptions),
    };
  } catch {
    return null;
  }
}

function getAutoEndDateTime(
  startDate: string,
  startClock: string,
  activeDays: string
) {
  const safeActiveDays = Number(activeDays);
  if (!startDate || !startClock || !Number.isInteger(safeActiveDays) || safeActiveDays <= 0) {
    return null;
  }

  const start = new Date(`${startDate}T${startClock}`);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start);
  end.setDate(end.getDate() + safeActiveDays);

  return {
    date: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    time: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
  };
}

function formatMinutesLabel(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return "Оруулаагүй";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    hours > 0 ? `${hours} цаг` : null,
    minutes > 0 ? `${minutes} минут` : null,
  ].filter(Boolean);

  return parts.join(" ");
}

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

function normalizeTimePart(value: string, max: number) {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 2);
  if (!digitsOnly) return "00";
  const safeNumber = Math.min(max, Number(digitsOnly));
  return String(Number.isNaN(safeNumber) ? 0 : safeNumber).padStart(2, "0");
}

function sanitizeTypingTimePart(value: string, max: number) {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 2);
  if (!digitsOnly) return "00";

  const typedNumber = Number(digitsOnly);
  if (Number.isNaN(typedNumber)) return "00";
  if (typedNumber > max) return String(max);
  return digitsOnly;
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
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("__none");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
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
  const [durationMinutes, setDurationMinutes] = useState("");
  const [activeDays, setActiveDays] = useState("1");
  const [passingScore, setPassingScore] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("1");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const startDatePickerRef = useRef<HTMLDivElement | null>(null);
  const startTimePickerRef = useRef<HTMLDivElement | null>(null);
  const endDatePickerRef = useRef<HTMLDivElement | null>(null);
  const endTimePickerRef = useRef<HTMLDivElement | null>(null);
  const hasRestoredDraftRef = useRef(false);

  const startTime = joinDateTime(startDate, startClock);
  const autoEnd = useMemo(
    () => getAutoEndDateTime(startDate, startClock, activeDays),
    [activeDays, startClock, startDate]
  );
  const calculatedEndDate = autoEnd?.date ?? "";
  const calculatedEndClock = autoEnd?.time ?? "";
  const endTime = joinDateTime(calculatedEndDate, calculatedEndClock);
  const startTimeParts = splitTimeParts(startClock);
  const endTimeParts = splitTimeParts(endClock);
  const startCalendarDays = buildCalendarDays(startMonth);
  const endCalendarDays = buildCalendarDays(endMonth);

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!openPicker) return;

      const target = event.target as Node;
      const activeRef =
        openPicker === "start-date"
          ? startDatePickerRef
          : openPicker === "start-time"
            ? startTimePickerRef
            : openPicker === "end-date"
              ? endDatePickerRef
              : endTimePickerRef;
      if (!activeRef.current?.contains(target)) {
        setOpenPicker(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [openPicker]);

  useEffect(() => {
    if (hasRestoredDraftRef.current) return;

    const storedDraft = parseExamDraft(
      window.sessionStorage.getItem(CREATE_EXAM_DRAFT_STORAGE_KEY)
    );
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      if (storedDraft) {
        const restoredSubjectId = storedDraft.subjectId || "__none";
        const allowedGroupIds = new Set(
          groups
            .filter(
              (group) =>
                restoredSubjectId !== "__none" &&
                (group.allowed_subject_ids.length === 0 ||
                  group.allowed_subject_ids.includes(restoredSubjectId))
            )
            .map((group) => group.id)
        );

        setTitle(storedDraft.title);
        setSubjectId(restoredSubjectId);
        setSelectedGroupIds(
          storedDraft.selectedGroupIds.filter((groupId) =>
            allowedGroupIds.has(groupId)
          )
        );
        setDescription(storedDraft.description);
        setStartDate(storedDraft.startDate);
        setStartClock(storedDraft.startClock);
        setEndDate(storedDraft.endDate);
        setEndClock(storedDraft.endClock);
        setDurationMinutes(storedDraft.durationMinutes);
        setActiveDays(storedDraft.activeDays);
        setPassingScore(storedDraft.passingScore);
        setMaxAttempts(storedDraft.maxAttempts);
        setShuffleQuestions(storedDraft.shuffleQuestions);
        setShuffleOptions(storedDraft.shuffleOptions);

        if (storedDraft.startDate) {
          setStartMonth(storedDraft.startDate.slice(0, 7));
        }

        if (storedDraft.endDate) {
          setEndMonth(storedDraft.endDate.slice(0, 7));
        }
      }

      hasRestoredDraftRef.current = true;
      setIsDraftReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [groups]);

  useEffect(() => {
    if (!isDraftReady) return;

    const draft: ExamDraft = {
      title,
      subjectId,
      selectedGroupIds,
      startDate,
      startClock,
      endDate,
      endClock,
      durationMinutes,
      activeDays,
      description,
      passingScore,
      maxAttempts,
      shuffleQuestions,
      shuffleOptions,
    };

    window.sessionStorage.setItem(
      CREATE_EXAM_DRAFT_STORAGE_KEY,
      JSON.stringify(draft)
    );
  }, [
    title,
    subjectId,
    selectedGroupIds,
    startDate,
    startClock,
    endDate,
    endClock,
    durationMinutes,
    activeDays,
    description,
    passingScore,
    maxAttempts,
    shuffleQuestions,
    shuffleOptions,
    isDraftReady,
  ]);

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function updateTitle(value: string) {
    setTitle(value);
    if (value.trim()) clearFieldError("title");
  }

  function updateDurationMinutes(value: string) {
    setDurationMinutes(value);
    if (value && Number(value) > 0) clearFieldError("duration");
  }

  function updateActiveDays(value: string) {
    setActiveDays(value);
    if (value && Number(value) > 0) clearFieldError("activeDays");
  }

  function updateStartDate(value: string) {
    setStartDate(value);
    if (value) clearFieldError("startDate");
  }

  function updateEndDate(value: string) {
    setEndDate(value);
    if (value) clearFieldError("endDate");
  }
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
        text: "Эхлэх өдөр, цаг болон идэвхтэй өдрөө бүрэн оруулна уу.",
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

    const days = Math.floor(diff / (24 * 60));
    const hours = Math.floor((diff % (24 * 60)) / 60);
    const minutes = diff % 60;
    const parts = [
      days > 0 ? `${days} өдөр` : null,
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
    if (nextSubjectId !== "__none") clearFieldError("subject");
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
    clearFieldError("startTime");
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
    clearFieldError("endTime");
  }

  function handleStartTimeInput(part: "hour" | "minute", value: string) {
    const hour =
      part === "hour"
        ? sanitizeTypingTimePart(value, 23)
        : sanitizeTypingTimePart(startTimeParts.hour, 23);
    const minute =
      part === "minute"
        ? sanitizeTypingTimePart(value, 59)
        : sanitizeTypingTimePart(startTimeParts.minute, 59);
    setStartClock(buildTimeValue(hour, minute));
    clearFieldError("startTime");
  }

  function handleEndTimeInput(part: "hour" | "minute", value: string) {
    const hour =
      part === "hour"
        ? sanitizeTypingTimePart(value, 23)
        : sanitizeTypingTimePart(endTimeParts.hour, 23);
    const minute =
      part === "minute"
        ? sanitizeTypingTimePart(value, 59)
        : sanitizeTypingTimePart(endTimeParts.minute, 59);
    setEndClock(buildTimeValue(hour, minute));
    clearFieldError("endTime");
  }

  function finalizeStartTimePart(part: "hour" | "minute") {
    const hour =
      part === "hour"
        ? normalizeTimePart(startTimeParts.hour, 23)
        : normalizeTimePart(startTimeParts.hour, 23);
    const minute =
      part === "minute"
        ? normalizeTimePart(startTimeParts.minute, 59)
        : normalizeTimePart(startTimeParts.minute, 59);
    setStartClock(buildTimeValue(hour, minute));
    clearFieldError("startTime");
  }

  function finalizeEndTimePart(part: "hour" | "minute") {
    const hour =
      part === "hour"
        ? normalizeTimePart(endTimeParts.hour, 23)
        : normalizeTimePart(endTimeParts.hour, 23);
    const minute =
      part === "minute"
        ? normalizeTimePart(endTimeParts.minute, 59)
        : normalizeTimePart(endTimeParts.minute, 59);
    setEndClock(buildTimeValue(hour, minute));
    clearFieldError("endTime");
  }

  async function handleSubmit(formData: FormData) {
    const nextErrors: FieldErrors = {};
    const nextTitle = String(formData.get("title") || "").trim();
    const derivedEnd = getAutoEndDateTime(startDate, startClock, activeDays);

    if (!nextTitle) nextErrors.title = "Шалгалтын нэрээ бөглөнө үү.";
    if (subjectId === "__none") nextErrors.subject = "Хичээлээ сонгоно уу.";
    if (!startDate) nextErrors.startDate = "Эхлэх өдрөө сонгоно уу.";
    if (!startClock) nextErrors.startTime = "Эхлэх цагаа оруулна уу.";
    if (!durationMinutes || Number(durationMinutes) <= 0) {
      nextErrors.duration = "Шалгалтын хугацааг зөв оруулна уу.";
    }
    if (!activeDays || Number(activeDays) <= 0) {
      nextErrors.activeDays = "Идэвхтэй байх өдрийн тоог оруулна уу.";
    }
    if (!derivedEnd && startDate && startClock && activeDays) {
      nextErrors.activeDays = "Идэвхтэй өдрийн утга буруу байна.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError("Дутуу бөглөсөн хэсгүүдийг улаанаар тэмдэглэлээ.");
      return;
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});

    formData.set("start_time", startTime);
    formData.set(
      "end_time",
      derivedEnd ? joinDateTime(derivedEnd.date, derivedEnd.time) : ""
    );
    formData.set("duration_minutes", durationMinutes);

    const result = await createExam(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  const isDurationValid =
    durationMinutes !== "" &&
    Number(durationMinutes) > 0 &&
    (durationSummary.minutes === "" ||
      Number(durationMinutes) <= Number(durationSummary.minutes));
  const examDurationLabel =
    durationMinutes && Number(durationMinutes) > 0
      ? formatMinutesLabel(Number(durationMinutes))
      : "Оруулаагүй";

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
            value={durationMinutes}
          />

          <div className="space-y-2">
            <Label htmlFor="title">Шалгалтын нэр *</Label>
            <Input
              id="title"
              name="title"
              placeholder="Жишээ: Математик - 1-р улирал"
              value={title}
              onChange={(e) => updateTitle(e.target.value)}
              className={fieldErrors.title ? "border-destructive" : undefined}
              required
            />
            {fieldErrors.title && (
              <p className="text-sm text-destructive">{fieldErrors.title}</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Хичээл *</Label>
              <Select value={subjectId} onValueChange={handleSubjectChange}>
                <SelectTrigger
                  className={fieldErrors.subject ? "border-destructive" : undefined}
                >
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
              {fieldErrors.subject && (
                <p className="text-sm text-destructive">{fieldErrors.subject}</p>
              )}
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                  <div className="relative" ref={startDatePickerRef}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPicker((prev) =>
                          prev === "start-date" ? null : "start-date"
                        )
                      }
                      className={`flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        fieldErrors.startDate
                          ? "border-destructive bg-destructive/5"
                          : ""
                      }`}
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
                                updateStartDate(day.value);
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

                  <div className="relative" ref={startTimePickerRef}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPicker((prev) =>
                          prev === "start-time" ? null : "start-time"
                        )
                      }
                      className={`flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        fieldErrors.startTime
                          ? "border-destructive bg-destructive/5"
                          : ""
                      }`}
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
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={2}
                                value={startTimeParts.hour}
                                onFocus={(event) => event.currentTarget.select()}
                                onBlur={() => finalizeStartTimePart("hour")}
                                onChange={(event) =>
                                  handleStartTimeInput("hour", event.target.value)
                                }
                                className="h-[52px] w-full rounded-xl border bg-background px-0 text-center text-2xl font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
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
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={2}
                                value={startTimeParts.minute}
                                onFocus={(event) => event.currentTarget.select()}
                                onBlur={() => finalizeStartTimePart("minute")}
                                onChange={(event) =>
                                  handleStartTimeInput("minute", event.target.value)
                                }
                                className="h-[52px] w-full rounded-xl border bg-background px-0 text-center text-2xl font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
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
                {(fieldErrors.startDate || fieldErrors.startTime) && (
                  <p className="text-sm text-destructive">
                    {fieldErrors.startDate ?? fieldErrors.startTime}
                  </p>
                )}

                <p className="text-sm text-muted-foreground">
                  {formatDateTime(startTime)}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border bg-background p-4">
                <p className="text-sm font-medium">Дуусах (автоматаар)</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative" ref={endDatePickerRef}>
                    <button
                      type="button"
                      disabled
                      onClick={() =>
                        setOpenPicker((prev) =>
                          prev === "end-date" ? null : "end-date"
                        )
                      }
                      className={`flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-70 ${
                        fieldErrors.endDate ? "border-destructive bg-destructive/5" : ""
                      }`}
                    >
                      <span>{formatDateLabel(calculatedEndDate)}</span>
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
                                updateEndDate(day.value);
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

                  <div className="relative" ref={endTimePickerRef}>
                    <button
                      type="button"
                      disabled
                      onClick={() =>
                        setOpenPicker((prev) =>
                          prev === "end-time" ? null : "end-time"
                        )
                      }
                      className={`flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-70 ${
                        fieldErrors.endTime ? "border-destructive bg-destructive/5" : ""
                      }`}
                    >
                      <span>{calculatedEndClock || "Цаг автоматаар гарна"}</span>
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
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={2}
                                value={endTimeParts.hour}
                                onFocus={(event) => event.currentTarget.select()}
                                onBlur={() => finalizeEndTimePart("hour")}
                                onChange={(event) =>
                                  handleEndTimeInput("hour", event.target.value)
                                }
                                className="h-[52px] w-full rounded-xl border bg-background px-0 text-center text-2xl font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
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
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={2}
                                value={endTimeParts.minute}
                                onFocus={(event) => event.currentTarget.select()}
                                onBlur={() => finalizeEndTimePart("minute")}
                                onChange={(event) =>
                                  handleEndTimeInput("minute", event.target.value)
                                }
                                className="h-[52px] w-full rounded-xl border bg-background px-0 text-center text-2xl font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
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
                {(fieldErrors.endDate || fieldErrors.endTime) && (
                  <p className="text-sm text-destructive">
                    {fieldErrors.endDate ?? fieldErrors.endTime}
                  </p>
                )}

                <p className="text-sm text-muted-foreground">
                  {formatDateTime(endTime)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Эхлэх цаг болон идэвхтэй өдрийн тооноос автоматаар бодогдоно.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Шалгалтын хугацаа</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="duration_input">Шалгалтын хугацаа (минут) *</Label>
                  <Input
                    id="duration_input"
                    type="number"
                    min="5"
                    max="300"
                    placeholder="Жишээ: 45"
                    value={durationMinutes}
                    onChange={(e) => updateDurationMinutes(e.target.value)}
                    className={fieldErrors.duration ? "border-destructive" : undefined}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Автоматаар тооцоолсон хугацаа: {examDurationLabel}
                  </p>
                  {fieldErrors.duration && (
                    <p className="text-sm text-destructive">{fieldErrors.duration}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="active_days">Идэвхтэй байх өдөр *</Label>
                  <Input
                    id="active_days"
                    name="active_days"
                    type="number"
                    min="1"
                    step="1"
                    max="30"
                    placeholder="Жишээ: 3"
                    value={activeDays}
                    onChange={(e) => updateActiveDays(e.target.value)}
                    className={fieldErrors.activeDays ? "border-destructive" : undefined}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Эхлэх цагаас хойш хэд хоног нээлттэй байхыг заана.
                  </p>
                  {fieldErrors.activeDays && (
                    <p className="text-sm text-destructive">{fieldErrors.activeDays}</p>
                  )}
                </div>
              </div>
              {durationMinutes && durationSummary.minutes && Number(durationMinutes) > Number(durationSummary.minutes) && (
                <p className="text-sm text-destructive">
                  Шалгалтын хугацаа нь нээлттэй цонхноос ({durationSummary.text}) урт байж болохгүй.
                </p>
              )}
              <p
                className={`text-sm ${
                  durationSummary.invalid
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                Нээлттэй цонх: {durationSummary.text}
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
                value={passingScore}
                onChange={(e) => setPassingScore(e.target.value)}
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
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="shuffle_questions"
                name="shuffle_questions"
                className="h-4 w-4 rounded border"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
              />
              <Label
                htmlFor="shuffle_questions"
                className="cursor-pointer font-normal"
              >
                Асуултыг санамсаргүй дарааллаар гаргах
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="shuffle_options"
                name="shuffle_options"
                className="h-4 w-4 rounded border"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
              />
              <Label
                htmlFor="shuffle_options"
                className="cursor-pointer font-normal"
              >
                Сонголтуудын дарааллыг холих
              </Label>
            </div>
          </div>

          <Button
            type="submit"
            loading={loading}
            disabled={durationSummary.invalid || !durationSummary.minutes || !isDurationValid}
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
