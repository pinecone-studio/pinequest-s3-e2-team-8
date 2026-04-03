"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { mn } from "date-fns/locale";
import {
  Camera,
  CalendarDays,
  Clock3,
  Monitor,
  RefreshCw,
  Trophy,
} from "lucide-react";
import type {
  DevicePolicy,
  EvidenceMode,
  ProctoringMode,
} from "@/lib/proctoring";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  parseUlaanbaatarDateTime,
  splitDateTimeForUlaanbaatar,
} from "@/lib/utils/date";
import { cn } from "@/lib/utils";

type ExamScheduleSectionProps = {
  initialStartTime?: string | null;
  initialEndTime?: string | null;
  initialDurationMinutes?: number | null;
  onChange?: (payload: {
    startTime: string;
    endTime: string;
    durationMinutes: string;
    isValid: boolean;
  }) => void;
};

type ExamSettingsSectionProps = {
  initialPassingScore?: number | null;
  initialMaxAttempts?: number | null;
  initialShuffleQuestions?: boolean;
  initialShuffleOptions?: boolean;
  initialProctoringMode?: ProctoringMode | null;
  initialRequireFullscreen?: boolean;
  initialRequireCamera?: boolean;
  initialIdentityVerification?: boolean;
  initialEvidenceMode?: EvidenceMode | null;
  initialPostExamSimilarityEnabled?: boolean;
  initialDevicePolicy?: DevicePolicy | null;
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

const passingScoreOptions = [50, 60, 70, 80, 90, 100];

const timeHours = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);
const timeMinutes = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, "0"),
);

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
  hour: string;
  minute: string;
} {
  const now = new Date();
  const fallbackHour = now.getHours();
  const fallbackMinute = Math.floor(now.getMinutes() / 5) * 5;

  if (!/^\d{2}:\d{2}$/.test(value)) {
    return {
      hour: String(fallbackHour).padStart(2, "0"),
      minute: String(fallbackMinute).padStart(2, "0"),
    };
  }

  const [rawHour, rawMinute] = value.split(":").map(Number);
  const normalizedMinute = Math.floor(rawMinute / 5) * 5;

  return {
    hour: String(rawHour).padStart(2, "0"),
    minute: String(normalizedMinute).padStart(2, "0"),
  };
}

function formatDisplayTime(value: string) {
  if (!value) return "";

  const { hour, minute } = parseTimeValue(value);
  return `${hour}:${minute}`;
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
            !selectedDate && "text-zinc-500",
          )}
        >
          <span>
            {selectedDate
              ? format(selectedDate, "yyyy.MM.dd", { locale: mn })
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
          classNames={{
            selected:
              "[&>button]:!rounded-full [&>button]:!bg-[#4D97F8] [&>button]:!text-white [&>button]:font-semibold [&>button]:hover:!bg-[#3F88E8] [&>button]:hover:!text-white",
          }}
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
  const { hour, minute } = parseTimeValue(value);
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
            !displayValue && "text-zinc-500",
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
        className="w-[178px] rounded-[18px] border-zinc-200 bg-white p-1.5 shadow-[0_16px_40px_-20px_rgba(15,23,42,0.28)]"
      >
        <div className="mb-2 rounded-[12px] bg-zinc-50 px-3 py-2 text-center text-xs font-medium text-zinc-500">
          24 цагийн формат
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <TimePickerColumn
            values={cycleFromSelected(timeHours, hour)}
            selected={hour}
            onSelect={(nextHour) => onChange(`${nextHour}:${minute}`)}
          />
          <TimePickerColumn
            values={cycleFromSelected(timeMinutes, minute)}
            selected={minute}
            onSelect={(nextMinute) => onChange(`${hour}:${nextMinute}`)}
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
                ? "bg-[#4D97F8] text-white"
                : "bg-transparent text-zinc-950 hover:bg-zinc-100",
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

function SettingsSelectField({
  value,
  onChange,
  options,
  getLabel,
  widthClass = "w-[96px]",
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  getLabel?: (value: string) => string;
  widthClass?: string;
}) {
  return (
    <div className={widthClass}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          size="sm"
          className="relative h-9 w-full justify-center rounded-[12px] border border-[#E6EAF2] bg-white px-3 pr-8 text-[13px] font-medium text-[#111827] shadow-none transition focus:border-[#C7D3E5] focus:ring-0 [&>svg]:absolute [&>svg]:right-3 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&_[data-slot=select-value]]:w-full [&_[data-slot=select-value]]:justify-center [&_[data-slot=select-value]]:text-center"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="center"
          className="min-w-[var(--radix-select-trigger-width)] rounded-[12px] border border-[#D7E3F4] bg-white p-1 shadow-[0_16px_30px_rgba(148,163,184,0.18)]"
        >
          {options.map((option) => (
            <SelectItem
              key={option}
              value={option}
              className="justify-center rounded-[10px] px-3 py-2 text-center text-[13px] font-medium text-[#111827] focus:bg-[#4D97F8] focus:text-white data-[state=checked]:bg-[#4D97F8] data-[state=checked]:text-white [&>span:first-child]:hidden [&>span:last-child]:text-inherit focus:[&>span:last-child]:text-white data-[state=checked]:[&>span:last-child]:text-white"
            >
              {getLabel ? getLabel(option) : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SettingsToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-6 w-11 rounded-full border transition-colors",
        checked
          ? "border-[#4D97F8] bg-[#4D97F8]"
          : "border-[#DFE6F1] bg-[#EEF2F7]",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.16)] transition-all",
          checked ? "left-[21px]" : "left-0.5",
        )}
      />
    </button>
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
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[16px] border border-[#E9EEF5] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#F6F8FB] text-[#111827]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#111827]">{title}</p>
          {description ? (
            <p className="text-[11px] text-[#8A94A6]">{description}</p>
          ) : null}
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
  onChange,
}: ExamScheduleSectionProps) {
  const [startDate, setStartDate] = useState(
    splitDateTimeForUlaanbaatar(initialStartTime).date,
  );
  const [startClock, setStartClock] = useState(
    splitDateTimeForUlaanbaatar(initialStartTime).time,
  );
  const [endDate, setEndDate] = useState(
    splitDateTimeForUlaanbaatar(initialEndTime).date,
  );
  const [endClock, setEndClock] = useState(
    splitDateTimeForUlaanbaatar(initialEndTime).time,
  );
  const [durationMinutes, setDurationMinutes] = useState(
    initialDurationMinutes ? String(initialDurationMinutes) : "",
  );
  const hasCustomDuration = durationMinutes.trim().length > 0;

  const startTime = joinDateTime(startDate, startClock);
  const endTime = joinDateTime(endDate, endClock);

  const durationSummary = useMemo(() => {
    if (!startTime || !endTime) {
      return "Нээх болон хаах цагаа 24 цагийн форматаар тохируулна уу.";
    }

    const start = parseUlaanbaatarDateTime(startTime);
    const end = parseUlaanbaatarDateTime(endTime);

    if (!start || !end) {
      return "Огноо эсвэл цаг буруу байна";
    }

    const diff = Math.round((end.getTime() - start.getTime()) / 60000);
    if (diff <= 0) {
      return "Хаагдах хугацаа нээгдэхээс хойш байх ёстой";
    }

    return "Хуваарь амжилттай тохируулагдлаа. Нийтлэгдсэний дараа яг энэ цаг 24 форматаар харагдана.";
  }, [endTime, startTime]);

  useEffect(() => {
    const startMs =
      parseUlaanbaatarDateTime(startTime)?.getTime() ?? Number.NaN;
    const endMs = parseUlaanbaatarDateTime(endTime)?.getTime() ?? Number.NaN;
    const isValid =
      Boolean(startTime) &&
      Boolean(endTime) &&
      Boolean(durationMinutes.trim()) &&
      !Number.isNaN(startMs) &&
      !Number.isNaN(endMs) &&
      startMs < endMs &&
      Number(durationMinutes) > 0;

    onChange?.({
      startTime,
      endTime,
      durationMinutes,
      isValid,
    });
  }, [durationMinutes, endTime, onChange, startTime]);

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
                    ? "border-[#4D97F8] bg-[#4D97F8] text-white shadow-[0_12px_24px_rgba(77,151,248,0.22)] hover:bg-[#3F88E8] hover:text-white"
                    : "bg-white text-zinc-950 hover:bg-zinc-50",
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
              className={cn(
                "h-10 w-36 rounded-2xl border-zinc-200 px-3 text-center text-sm focus-visible:ring-zinc-200",
                hasCustomDuration ? "pr-12" : "pr-3",
              )}
            />
            {hasCustomDuration ? (
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                мин
              </span>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-sm text-zinc-500">{durationSummary}</p>
      </div>
    </div>
  );
}

export function ExamSettingsSection({
  initialPassingScore,
  initialMaxAttempts,
  initialProctoringMode,
  initialRequireFullscreen,
  initialRequireCamera,
  initialDevicePolicy,
}: ExamSettingsSectionProps) {
  const [passingScore, setPassingScore] = useState(
    String(initialPassingScore ?? 70),
  );
  const [attempts, setAttempts] = useState(String(initialMaxAttempts ?? 1));
  const [requireCamera, setRequireCamera] = useState(
    initialProctoringMode === "strict"
      ? true
      : Boolean(initialRequireCamera),
  );
  const [desktopOnly, setDesktopOnly] = useState(
    initialProctoringMode === "strict"
      ? true
      : Boolean(initialRequireFullscreen) ||
          initialDevicePolicy === "desktop_only",
  );
  const proctoringMode = requireCamera || desktopOnly ? "standard" : "off";

  return (
    <div className="rounded-[22px] border border-[#E2E8F0] bg-white p-5 shadow-[0_16px_30px_rgba(148,163,184,0.15)]">
      <input type="hidden" name="passing_score" value={passingScore} />
      <input type="hidden" name="max_attempts" value={attempts} />
      <input type="hidden" name="shuffle_questions" value="on" />
      <input type="hidden" name="proctoring_mode" value={proctoringMode} />
      <input
        type="hidden"
        name="device_policy"
        value={desktopOnly ? "desktop_only" : "mobile_preferred"}
      />
      {desktopOnly ? (
        <input type="hidden" name="require_fullscreen" value="on" />
      ) : null}
      {requireCamera ? (
        <input type="hidden" name="require_camera" value="on" />
      ) : null}

      <div className="space-y-4">
        <SettingsRow
          icon={Trophy}
          title="Тэнцэх оноо"
          description="Дундаж шаардлага"
        >
          <SettingsSelectField
            value={passingScore}
            onChange={setPassingScore}
            options={passingScoreOptions.map(String)}
            widthClass="w-[92px]"
          />
        </SettingsRow>

        <SettingsRow
          icon={RefreshCw}
          title="Оролдлогын тоо"
          description="Дахин өгөх боломж"
        >
          <SettingsSelectField
            value={attempts}
            onChange={setAttempts}
            options={Array.from({ length: 10 }, (_, index) =>
              String(index + 1),
            )}
            getLabel={(value) => `${value} удаа`}
            widthClass="w-[110px]"
          />
        </SettingsRow>

        <SettingsRow
          icon={Camera}
          title="Камер шаардлага"
          description="Camera/presence monitoring ашиглах эсэх"
        >
          <SettingsToggle
            checked={requireCamera}
            onCheckedChange={setRequireCamera}
          />
        </SettingsRow>

        <SettingsRow
          icon={Monitor}
          title="Зөвхөн desktop-оор өгөх"
          description="Гар утсаар шалгалтад орох боломжгүй."
        >
          <SettingsToggle
            checked={desktopOnly}
            onCheckedChange={setDesktopOnly}
          />
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
  initialProctoringMode,
  initialRequireFullscreen,
  initialRequireCamera,
  initialIdentityVerification,
  initialEvidenceMode,
  initialPostExamSimilarityEnabled,
  initialDevicePolicy,
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
        initialProctoringMode={initialProctoringMode}
        initialRequireFullscreen={initialRequireFullscreen}
        initialRequireCamera={initialRequireCamera}
        initialIdentityVerification={initialIdentityVerification}
        initialEvidenceMode={initialEvidenceMode}
        initialPostExamSimilarityEnabled={initialPostExamSimilarityEnabled}
        initialDevicePolicy={initialDevicePolicy}
      />
    </div>
  );
}
