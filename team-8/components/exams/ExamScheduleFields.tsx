"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { mn } from "date-fns/locale";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ExamScheduleSectionProps = {
  initialStartTime?: string | null;
  initialEndTime?: string | null;
  initialDurationMinutes?: number | null;
};

type ExamSettingsSectionProps = {
  initialPassingScore?: number | null;
  initialMaxAttempts?: number | null;
  initialShuffleQuestions?: boolean;
  initialShuffleOptions?: boolean;
};

type ExamScheduleFieldsProps = ExamScheduleSectionProps &
  ExamSettingsSectionProps;

const durationPresets = [
  { minutes: 30, label: "30 мин" },
  { minutes: 45, label: "45 мин" },
  { minutes: 60, label: "1 цаг" },
  { minutes: 90, label: "1.5 цаг" },
  { minutes: 120, label: "2 цаг" },
];

const timeHours = [
  "12",
  ...Array.from({ length: 11 }, (_, index) =>
    String(index + 1).padStart(2, "0")
  ),
];
const timeMinutes = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, "0")
);
const meridiems = ["AM", "PM"] as const;

function splitIsoForUlaanbaatar(iso?: string | null) {
  if (!iso) {
    return { date: "", time: "" };
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return {
    date: `${partMap.get("year")}-${partMap.get("month")}-${partMap.get("day")}`,
    time: `${partMap.get("hour")}:${partMap.get("minute")}`,
  };
}

function joinDateTime(date: string, time: string) {
  if (!date || !time) return "";
  return `${date}T${time}`;
}

function parseDateValue(value: string) {
  if (!value) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;

  return new Date(year, month - 1, day);
}

function parseTimeValue(value: string): {
  hour12: string;
  minute: string;
  meridiem: (typeof meridiems)[number];
} {
  const now = new Date();
  const fallbackHour = now.getHours();
  const fallbackMinute = now.getMinutes();

  if (!/^\d{2}:\d{2}$/.test(value)) {
    const meridiem = fallbackHour >= 12 ? "PM" : "AM";
    const hour12 = fallbackHour % 12 || 12;

    return {
      hour12: String(hour12).padStart(2, "0"),
      minute: String(fallbackMinute).padStart(2, "0"),
      meridiem,
    };
  }

  const [rawHour, rawMinute] = value.split(":").map(Number);
  const meridiem = rawHour >= 12 ? "PM" : "AM";
  const hour12 = rawHour % 12 || 12;
  const normalizedMinute = Math.floor(rawMinute / 5) * 5;

  return {
    hour12: String(hour12).padStart(2, "0"),
    minute: String(normalizedMinute).padStart(2, "0"),
    meridiem,
  };
}

function formatDisplayTime(value: string) {
  if (!value) return "";

  const { hour12, minute, meridiem } = parseTimeValue(value);
  return `${hour12}:${minute} ${meridiem}`;
}

function to24HourTime(
  hour12: string,
  minute: string,
  meridiem: (typeof meridiems)[number]
) {
  let hour = Number(hour12) % 12;
  if (meridiem === "PM") {
    hour += 12;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function cycleFromSelected(values: readonly string[], selected: string) {
  const selectedIndex = values.indexOf(selected);
  if (selectedIndex < 0) return [...values];

  return [...values.slice(selectedIndex), ...values.slice(0, selectedIndex)];
}

function DatePickerField({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "h-12 w-full justify-between rounded-[20px] border-zinc-200 bg-zinc-50/80 px-4 text-left text-sm font-medium text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition-colors hover:translate-y-0 hover:border-zinc-300 hover:bg-white hover:shadow-none focus-visible:border-zinc-300 focus-visible:ring-zinc-200/70",
            !selectedDate && "text-zinc-500"
          )}
        >
          <span>
            {selectedDate
              ? format(selectedDate, "MM/dd/yyyy", { locale: mn })
              : placeholder}
          </span>
          <CalendarDays className="h-4 w-4 text-zinc-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto rounded-[22px] border-zinc-200 bg-white p-0 shadow-[0_16px_40px_-20px_rgba(15,23,42,0.28)]"
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate ?? new Date()}
          locale={mn}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function TimePickerField({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { hour12, minute, meridiem } = parseTimeValue(value);
  const displayValue = formatDisplayTime(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "h-12 w-full justify-between rounded-[22px] border-zinc-200 bg-zinc-50/80 px-4 text-left text-sm font-medium text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition-colors hover:translate-y-0 hover:border-zinc-300 hover:bg-white hover:shadow-none focus-visible:border-zinc-300 focus-visible:ring-zinc-200/70",
            !displayValue && "text-zinc-500"
          )}
        >
          <span>{displayValue || placeholder}</span>
          <Clock3 className="h-4 w-4 text-zinc-500" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        avoidCollisions={false}
        className="w-[220px] rounded-[18px] border-zinc-200 bg-white p-1.5 shadow-[0_16px_40px_-20px_rgba(15,23,42,0.28)]"
      >
        <div className="grid grid-cols-[1fr_1fr_0.9fr] gap-1.5">
          <TimePickerColumn
            values={cycleFromSelected(timeHours, hour12)}
            selected={hour12}
            onSelect={(nextHour) =>
              onChange(to24HourTime(nextHour, minute, meridiem))
            }
          />
          <TimePickerColumn
            values={cycleFromSelected(timeMinutes, minute)}
            selected={minute}
            onSelect={(nextMinute) =>
              onChange(to24HourTime(hour12, nextMinute, meridiem))
            }
          />
          <TimePickerColumn
            values={cycleFromSelected(meridiems, meridiem)}
            selected={meridiem}
            onSelect={(nextMeridiem) =>
              onChange(
                to24HourTime(
                  hour12,
                  minute,
                  nextMeridiem as (typeof meridiems)[number]
                )
              )
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimePickerColumn({
  values,
  selected,
  onSelect,
}: {
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="max-h-[228px] space-y-1 overflow-y-auto pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {values.map((entry) => {
        const isActive = entry === selected;

        return (
          <button
            key={entry}
            type="button"
            onClick={() => onSelect(entry)}
            className={cn(
              "flex h-9 w-full items-center justify-center rounded-[8px] text-[0.95rem] font-medium transition-colors",
              isActive
                ? "bg-zinc-950 text-white"
                : "bg-transparent text-zinc-950 hover:bg-zinc-100"
            )}
          >
            {entry}
          </button>
        );
      })}
    </div>
  );
}

function DateTimeCard({
  title,
  dateId,
  timeId,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
}: {
  title: string;
  dateId: string;
  timeId: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  return (
    <div className="rounded-[30px] border border-zinc-200/90 bg-zinc-50/40 p-5">
      <div className="mb-4 flex items-center gap-3">
        <CalendarDays className="h-5 w-5 text-zinc-700" />
        <p className="text-sm font-semibold text-zinc-950">{title}</p>
      </div>

      <div className="space-y-4">
        <DatePickerField
          id={dateId}
          value={dateValue}
          placeholder="Огноо сонгох"
          onChange={onDateChange}
        />
        <TimePickerField
          id={timeId}
          value={timeValue}
          placeholder="Цаг сонгох"
          onChange={onTimeChange}
        />
      </div>
    </div>
  );
}

function SettingsRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-semibold text-zinc-950">{title}</p>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function ExamScheduleSection({
  initialStartTime,
  initialEndTime,
  initialDurationMinutes,
}: ExamScheduleSectionProps) {
  const [startDate, setStartDate] = useState(
    splitIsoForUlaanbaatar(initialStartTime).date
  );
  const [startClock, setStartClock] = useState(
    splitIsoForUlaanbaatar(initialStartTime).time
  );
  const [endDate, setEndDate] = useState(
    splitIsoForUlaanbaatar(initialEndTime).date
  );
  const [endClock, setEndClock] = useState(
    splitIsoForUlaanbaatar(initialEndTime).time
  );
  const [durationMinutes, setDurationMinutes] = useState(
    initialDurationMinutes ? String(initialDurationMinutes) : ""
  );

  const startTime = joinDateTime(startDate, startClock);
  const endTime = joinDateTime(endDate, endClock);

  const durationSummary = useMemo(() => {
    if (!startTime || !endTime) {
      return "Сурагч эхлүүлснээс хойш дуусах хугацаа";
    }

    const start = new Date(`${startTime}+08:00`);
    const end = new Date(`${endTime}+08:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "Огноо эсвэл цаг буруу байна";
    }

    const diff = Math.round((end.getTime() - start.getTime()) / 60000);
    if (diff <= 0) {
      return "Хаагдах хугацаа нээгдэхээс хойш байх ёстой";
    }

    return "Сурагч эхлүүлснээс хойш дуусах хугацаа";
  }, [endTime, startTime]);

  return (
    <div className="rounded-[28px] border border-zinc-100 bg-white p-6 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.16)] md:p-8">
      <input type="hidden" name="start_time" value={startTime} />
      <input type="hidden" name="end_time" value={endTime} />

      <div className="grid gap-5 md:grid-cols-2">
        <DateTimeCard
          title="Нээгдэх огноо"
          dateId="exam-start-date"
          timeId="exam-start-time"
          dateValue={startDate}
          timeValue={startClock}
          onDateChange={setStartDate}
          onTimeChange={setStartClock}
        />
        <DateTimeCard
          title="Хаагдах огноо"
          dateId="exam-end-date"
          timeId="exam-end-time"
          dateValue={endDate}
          timeValue={endClock}
          onDateChange={setEndDate}
          onTimeChange={setEndClock}
        />
      </div>

      <div className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <Clock3 className="h-5 w-5 text-zinc-700" />
          <Label
            htmlFor="duration_minutes"
            className="text-base font-semibold text-zinc-950"
          >
            Шалгалтын хугацаа
          </Label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {durationPresets.map((preset) => {
            const active = durationMinutes === String(preset.minutes);

            return (
              <Button
                key={preset.minutes}
                type="button"
                variant="outline"
                onClick={() => setDurationMinutes(String(preset.minutes))}
                className={cn(
                  "h-10 rounded-2xl border-zinc-200 px-4 text-sm hover:translate-y-0 hover:shadow-none",
                  active
                    ? "border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-900 hover:text-white"
                    : "bg-white text-zinc-950 hover:bg-zinc-50"
                )}
              >
                {preset.label}
              </Button>
            );
          })}

          <span className="px-1 text-sm text-zinc-500">эсвэл</span>

          <div className="relative">
            <Input
              id="duration_minutes"
              name="duration_minutes"
              type="number"
              min="5"
              max="300"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              placeholder="Минут оруулах"
              className="h-10 w-32 rounded-2xl border-zinc-200 px-3 pr-12 text-center text-sm focus-visible:ring-zinc-200"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
              мин
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm text-zinc-500">{durationSummary}</p>
      </div>
    </div>
  );
}

export function ExamSettingsSection(props: ExamSettingsSectionProps) {
  const { initialPassingScore, initialMaxAttempts } = props;
  const [attempts, setAttempts] = useState(String(initialMaxAttempts ?? 1));

  return (
    <div className="rounded-[28px] border border-zinc-100 bg-white p-6 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.16)] md:p-8">
      <div className="divide-y divide-zinc-200">
        <SettingsRow
          icon={Trophy}
          title="Тэнцэх оноо"
          description="Дундаж шаардлага"
        >
          <div className="relative">
            <Input
              id="passing_score"
              name="passing_score"
              type="number"
              min="0"
              max="100"
              defaultValue={initialPassingScore ?? 60}
              className="h-11 w-28 rounded-[20px] border-zinc-200 px-4 pr-9 text-center text-sm focus-visible:ring-zinc-200"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
              %
            </span>
          </div>
        </SettingsRow>

        <SettingsRow
          icon={RefreshCw}
          title="Оролдлогын тоо"
          description="Дахин өгөх боломж"
        >
          <div className="relative">
            <select
              value={attempts}
              onChange={(event) => setAttempts(event.target.value)}
              className="h-11 min-w-28 appearance-none rounded-[20px] border border-zinc-200 bg-white px-4 pr-10 text-sm text-zinc-950 outline-none focus:border-zinc-300"
            >
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (value) => (
                  <option key={value} value={value}>
                    {value} удаа
                  </option>
                )
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <input type="hidden" name="max_attempts" value={attempts} />
          </div>
        </SettingsRow>
      </div>
    </div>
  );
}

export default function ExamScheduleFields({
  initialStartTime,
  initialEndTime,
  initialDurationMinutes,
  initialPassingScore,
  initialMaxAttempts,
}: ExamScheduleFieldsProps) {
  return (
    <div className="space-y-6">
      <ExamScheduleSection
        initialStartTime={initialStartTime}
        initialEndTime={initialEndTime}
        initialDurationMinutes={initialDurationMinutes}
      />
      <ExamSettingsSection
        initialPassingScore={initialPassingScore}
        initialMaxAttempts={initialMaxAttempts}
      />
    </div>
  );
}
