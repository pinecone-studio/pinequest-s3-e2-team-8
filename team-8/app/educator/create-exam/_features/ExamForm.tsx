"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  NotebookPen,
  Settings,
} from "lucide-react";
import { createExam, updateExam } from "@/lib/exam/actions";
import {
  ExamScheduleSection,
  ExamSettingsSection,
} from "@/components/exams/ExamScheduleFields";
import type {
  DevicePolicy,
  EvidenceMode,
  ProctoringMode,
} from "@/lib/proctoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseUlaanbaatarDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

interface ExamFormProps {
  subjects: SubjectOption[];
  groups: GroupOption[];
  mode?: "create" | "edit";
  examId?: string;
  initialStep?: number;
  initialTitle?: string;
  initialDescription?: string;
  initialSubjectId?: string | null;
  initialGroupIds?: string[];
  initialStartTime?: string | null;
  initialEndTime?: string | null;
  initialDurationMinutes?: number | null;
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
  initialError?: string | null;
}

type VisualStep = {
  title: string;
  icon: LucideIcon;
  interactive: boolean;
};

const visualSteps: VisualStep[] = [
  { title: "Үндсэн мэдээлэл", icon: BookOpen, interactive: true },
  { title: "Хуваарь", icon: CalendarDays, interactive: true },
  { title: "Тохиргоо", icon: Settings, interactive: true },
  { title: "Асуулт нэмэх", icon: NotebookPen, interactive: false },
];

const tagColors = [
  { id: "red", className: "bg-[#F44E3B]" },
  { id: "green", className: "bg-[#4CAF50]" },
  { id: "yellow", className: "bg-[#F9B233]" },
  { id: "blue", className: "bg-[#38A3FF]" },
  { id: "gray", className: "bg-[#9CA3AF]" },
] as const;

function formatGroupTypeLabel(groupType: string) {
  if (groupType === "class") return "Анги";
  if (groupType === "elective") return "Сонгон";
  if (groupType === "mixed") return "Холимог";
  return groupType;
}

function StepRail({
  currentStep,
  onStepClick,
}: {
  currentStep: number;
  onStepClick: (stepIndex: number) => void;
}) {
  return (
    <div className="relative w-full max-w-[187px] pt-1">
      <div className="absolute bottom-[18px] left-[15px] top-[18px] w-px bg-[#C7D3E5]" />

      <div className="flex flex-col gap-[56px]">
        {visualSteps.map((step, index) => {
          const active = currentStep === index;
          const completed = currentStep > index;
          const clickable = step.interactive;

          return (
            <button
              key={step.title}
              type="button"
              onClick={() => clickable && onStepClick(index)}
              disabled={!clickable}
              className={cn(
                "relative flex w-full items-center gap-4 text-left",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "relative z-10 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full border transition-colors",
                  active || completed
                    ? "border-[#3F4F97] bg-[#3F4F97] text-white"
                    : "border-[#D7E1F0] bg-white text-[#7C8BA4]",
                )}
              >
                <Check className="h-4 w-4" strokeWidth={2.8} />
              </span>

              <span
                className={cn(
                  "text-[14px] font-medium whitespace-nowrap",
                  active || completed ? "text-[#111827]" : "text-[#6B7280]",
                )}
              >
                {step.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GroupMultiSelectField({
  subjectId,
  availableGroups,
  selectedGroupIds,
  onToggleGroup,
}: {
  subjectId: string;
  availableGroups: GroupOption[];
  selectedGroupIds: string[];
  onToggleGroup: (groupId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedGroups = availableGroups.filter((group) =>
    selectedGroupIds.includes(group.id),
  );

  const triggerText =
    subjectId === "__none"
      ? "Эхлээд хичээлээ сонгоод дараа нь анги бүлгээ сонгоно уу."
      : selectedGroups.length > 0
        ? selectedGroups.map((group) => group.name).join(", ")
        : "Эхлээд хичээлээ сонгоод дараа нь анги бүлгээ сонгоно уу.";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-[48px] w-full items-center justify-between rounded-[16px] border border-[#E2E8F0] bg-white px-4 text-left text-[14px] text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.02)] outline-none transition focus-visible:ring-2 focus-visible:ring-[#B7D4FF]"
        >
          <span
            className={cn(
              "truncate",
              selectedGroups.length === 0 ? "text-[#9CA3AF]" : "text-[#111827]",
            )}
          >
            {triggerText}
          </span>
          <ChevronDown className="h-4 w-4 text-[#6B7280]" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[640px] max-w-[90vw] rounded-[18px] border border-[#E2E8F0] p-2 shadow-[0_16px_30px_rgba(148,163,184,0.18)]"
      >
        {availableGroups.length === 0 ? (
          <div className="rounded-[14px] px-4 py-5 text-[14px] text-[#6B7280]">
            Энэ хичээлд тохирох бүлэг одоогоор алга байна.
          </div>
        ) : (
          <div className="grid gap-2">
            {availableGroups.map((group) => {
              const selected = selectedGroupIds.includes(group.id);

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => onToggleGroup(group.id)}
                  className={cn(
                    "flex items-center justify-between rounded-[14px] border px-4 py-3 text-left transition",
                    selected
                      ? "border-[#4D97F8] bg-[#EDF5FF]"
                      : "border-[#E5E7EB] bg-white hover:border-[#C7D2E3] hover:bg-[#FAFCFF]",
                  )}
                >
                  <div>
                    <p className="text-[14px] font-medium text-[#111827]">
                      {group.name}
                    </p>
                    <p className="mt-1 text-[12px] text-[#6B7280]">
                      {formatGroupTypeLabel(group.group_type)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border",
                      selected
                        ? "border-[#4D97F8] bg-[#4D97F8] text-white"
                        : "border-[#D1D5DB] bg-white text-transparent",
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BasicInfoSection({
  subjects,
  subjectId,
  onSubjectChange,
  availableGroups,
  selectedGroupIds,
  onToggleGroup,
  titleValue,
  onTitleChange,
  descriptionValue,
  onDescriptionChange,
  tagColor,
  onTagColorChange,
}: {
  subjects: SubjectOption[];
  subjectId: string;
  onSubjectChange: (value: string) => void;
  availableGroups: GroupOption[];
  selectedGroupIds: string[];
  onToggleGroup: (groupId: string) => void;
  titleValue: string;
  onTitleChange: (value: string) => void;
  descriptionValue: string;
  onDescriptionChange: (value: string) => void;
  tagColor: (typeof tagColors)[number]["id"];
  onTagColorChange: (value: (typeof tagColors)[number]["id"]) => void;
}) {
  return (
    <div className="h-full rounded-[22px] border border-[#E2E8F0] bg-white p-4 shadow-[0_16px_30px_rgba(148,163,184,0.15)] sm:p-5">
      <div className="flex h-full flex-col justify-between space-y-4">
        <div className="space-y-2">
          <Label
            htmlFor="title"
            className="text-[14px] font-semibold text-[#111827]"
          >
            Шалгалтын нэр
          </Label>
          <Input
            id="title"
            name="title"
            value={titleValue}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Жишээ: Математик - Хагас жилийн шалгалт"
            className="h-[48px] rounded-[16px] border-[#E2E8F0] bg-white px-4 text-[14px] shadow-none placeholder:text-[#9CA3AF] focus-visible:ring-[#B7D4FF]"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[14px] font-semibold text-[#111827]">
            Хичээл
          </Label>
          <Select value={subjectId} onValueChange={onSubjectChange}>
            <SelectTrigger className="h-[48px] w-full rounded-[16px] border-[#E2E8F0] bg-white px-4 text-[14px] shadow-none focus-visible:ring-[#B7D4FF]">
              <SelectValue placeholder="Сонгоогүй" />
            </SelectTrigger>
            <SelectContent className="rounded-[16px] border border-[#E2E8F0] bg-white shadow-[0_16px_30px_rgba(148,163,184,0.18)]">
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

        <div className="space-y-2">
          <Label className="text-[14px] font-semibold text-[#111827]">
            Оноох анги/Бүлгүүд
          </Label>

          {selectedGroupIds.map((groupId) => (
            <input key={groupId} type="hidden" name="group_ids" value={groupId} />
          ))}

          <GroupMultiSelectField
            subjectId={subjectId}
            availableGroups={availableGroups}
            selectedGroupIds={selectedGroupIds}
            onToggleGroup={onToggleGroup}
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="description"
            className="text-[14px] font-semibold text-[#111827]"
          >
            Тайлбар (заавал биш )
          </Label>
          <Textarea
            id="description"
            name="description"
            value={descriptionValue}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Шалгалтын тухай товч тайлбар"
            rows={3}
            className="min-h-[64px] rounded-[16px] border-[#E2E8F0] bg-white px-4 py-3 text-[14px] shadow-none placeholder:text-[#9CA3AF] focus-visible:ring-[#B7D4FF]"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[14px] font-semibold text-[#111827]">
            Шошгоны өнгө
          </Label>
          <input type="hidden" name="accent_color" value={tagColor} />
          <div className="flex justify-end gap-2.5">
            {tagColors.map((color) => {
              const active = color.id === tagColor;

              return (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => onTagColorChange(color.id)}
                  aria-label={`${color.id} өнгө`}
                  className="relative"
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-full transition-transform",
                      color.className,
                      active ? "scale-110" : "",
                    )}
                  />
                  {active ? (
                    <span className="absolute inset-0 flex items-center justify-center text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExamForm({
  subjects,
  groups,
  mode = "create",
  examId,
  initialStep = 0,
  initialTitle = "",
  initialDescription = "",
  initialSubjectId = null,
  initialGroupIds = [],
  initialStartTime,
  initialEndTime,
  initialDurationMinutes,
  initialPassingScore,
  initialMaxAttempts,
  initialShuffleQuestions = false,
  initialShuffleOptions = false,
  initialProctoringMode,
  initialRequireFullscreen,
  initialRequireCamera,
  initialIdentityVerification,
  initialEvidenceMode,
  initialPostExamSimilarityEnabled,
  initialDevicePolicy,
  initialError = null,
}: ExamFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const allowFinalSubmitRef = useRef(false);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(
    Math.min(Math.max(initialStep, 0), 2),
  );
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? "__none");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initialGroupIds,
  );
  const [titleValue, setTitleValue] = useState(initialTitle);
  const [descriptionValue, setDescriptionValue] = useState(initialDescription);
  const [tagColor, setTagColor] =
    useState<(typeof tagColors)[number]["id"]>("yellow");

  const isFinalStep = currentStep === 2;

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  function getGroupsForSubject(nextSubjectId: string) {
    if (nextSubjectId === "__none") return [];
    return groups.filter(
      (group) =>
        group.allowed_subject_ids.length === 0 ||
        group.allowed_subject_ids.includes(nextSubjectId),
    );
  }

  const availableGroups = getGroupsForSubject(subjectId);

  function handleSubjectChange(nextSubjectId: string) {
    const nextGroups = getGroupsForSubject(nextSubjectId);
    setSubjectId(nextSubjectId);
    setSelectedGroupIds((prev) =>
      prev.filter((groupId) => nextGroups.some((group) => group.id === groupId)),
    );
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }

  function handleScheduleChange({
    isValid,
  }: {
    startTime: string;
    endTime: string;
    durationMinutes: string;
    isValid: boolean;
  }) {
    if (!isValid || currentStep !== 1 || !error) return;

    setError(null);
  }

  function getFieldValue(name: string) {
    const field = formRef.current?.elements.namedItem(name);

    return field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
      ? field.value.trim()
      : "";
  }

  function validateStep(stepIndex: number) {
    if (stepIndex === 0) {
      if (!titleValue.trim()) {
        setError("Шалгалтын нэрээ оруулна уу.");
        return false;
      }

      if (subjectId === "__none") {
        setError("Хичээлээ сонгоно уу.");
        return false;
      }
    }

    if (stepIndex === 1) {
      const startTime = getFieldValue("start_time");
      const endTime = getFieldValue("end_time");
      const duration = getFieldValue("duration_minutes");

      if (!startTime || !endTime || !duration) {
        setError("Хуваарийн мэдээллээ бүрэн оруулна уу.");
        return false;
      }

      const startMs =
        parseUlaanbaatarDateTime(startTime)?.getTime() ?? Number.NaN;
      const endMs =
        parseUlaanbaatarDateTime(endTime)?.getTime() ?? Number.NaN;

      if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) {
        setError("Хаагдах хугацаа нээгдэх хугацаанаас хойш байх ёстой.");
        return false;
      }

      if (Number(duration) <= 0) {
        setError("Шалгалтын хугацаа 0-ээс их байх ёстой.");
        return false;
      }
    }

    setError(null);
    return true;
  }

  function moveToStep(targetStep: number) {
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
      return;
    }

    const safeTarget = Math.min(targetStep, 2);
    for (let stepIndex = currentStep; stepIndex < safeTarget; stepIndex += 1) {
      if (!validateStep(stepIndex)) {
        return;
      }
    }

    setCurrentStep(safeTarget);
  }

  function submitFinalStep() {
    if (loading) return;

    allowFinalSubmitRef.current = true;
    formRef.current?.requestSubmit();
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const result =
      mode === "edit" && examId
        ? await updateExam(examId, formData)
        : await createExam(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (mode === "edit" && examId) {
      router.push(`/educator/exams/${examId}/questions`);
      router.refresh();
    }
  }

  const pageTitle = "Шалгалтын мэдээлэл";
  const finalButtonLabel = "Үргэлжлүүлэх";
  const finalLoadingText = "Шилжүүлж байна...";

  return (
    <div className="flex w-full max-w-[1240px] flex-col gap-[30px] lg:h-[714px]">
      <div className="shrink-0">
        <Link
          href="/educator/exams"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-[#334155] transition hover:text-[#111827]"
        >
          <ArrowLeft className="h-4 w-4" />
          Шалгалтууд руу буцах
        </Link>
      </div>

      <h1 className="shrink-0 text-[18px] font-semibold text-[#111827] md:text-[20px]">
        {pageTitle}
      </h1>

      {error ? (
        <div className="-mt-3 rounded-[16px] border border-[#F6C8CF] bg-[#FFF5F6] px-4 py-3 text-sm text-[#A33C48]">
          {error}
        </div>
      ) : null}

      <form
        ref={formRef}
        action={handleSubmit}
        className="flex min-h-0 flex-1 flex-col lg:h-[587px] lg:flex-none"
        onSubmit={(event) => {
          if (!isFinalStep) {
            event.preventDefault();
            moveToStep(currentStep + 1);
            return;
          }

          if (!allowFinalSubmitRef.current) {
            event.preventDefault();
            return;
          }

          allowFinalSubmitRef.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && currentStep < 2) {
            const target = event.target as HTMLElement;
            if (target.tagName !== "TEXTAREA") {
              event.preventDefault();
            }
          }
        }}
      >
        <div className="grid min-h-0 flex-1 gap-6 lg:h-[587px] lg:grid-cols-[187px_1029px] lg:items-start">
          <div className="self-start lg:w-[187px]">
            <StepRail currentStep={currentStep} onStepClick={moveToStep} />
          </div>

          <div className="flex min-h-0 h-full flex-col gap-[18px]">
            <div className={currentStep === 0 ? "h-[488px]" : "hidden"}>
              <BasicInfoSection
                subjects={subjects}
                subjectId={subjectId}
                onSubjectChange={handleSubjectChange}
                availableGroups={availableGroups}
                selectedGroupIds={selectedGroupIds}
                onToggleGroup={toggleGroup}
                titleValue={titleValue}
                onTitleChange={setTitleValue}
                descriptionValue={descriptionValue}
                onDescriptionChange={setDescriptionValue}
                tagColor={tagColor}
                onTagColorChange={setTagColor}
              />
            </div>

            <div className={currentStep === 1 ? "shrink-0" : "hidden"}>
              <ExamScheduleSection
                initialStartTime={initialStartTime}
                initialEndTime={initialEndTime}
                initialDurationMinutes={initialDurationMinutes}
                onChange={handleScheduleChange}
              />
            </div>

            <div className={currentStep === 2 ? "shrink-0" : "hidden"}>
              <ExamSettingsSection
                initialPassingScore={initialPassingScore}
                initialMaxAttempts={initialMaxAttempts}
                initialShuffleQuestions={initialShuffleQuestions}
                initialShuffleOptions={initialShuffleOptions}
                initialProctoringMode={initialProctoringMode}
                initialRequireFullscreen={initialRequireFullscreen}
                initialRequireCamera={initialRequireCamera}
                initialIdentityVerification={initialIdentityVerification}
                initialEvidenceMode={initialEvidenceMode}
                initialPostExamSimilarityEnabled={initialPostExamSimilarityEnabled}
                initialDevicePolicy={initialDevicePolicy}
              />
            </div>

            <div className="flex h-[46px] items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => moveToStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                aria-label="Буцах"
                className="gap-0 rounded-full border-0 bg-[#F3F4F6] p-0 text-[0px] shadow-none hover:bg-[#F3F4F6] hover:shadow-none disabled:opacity-0"
              >
                <ArrowLeft className="h-[13px] w-[13px] shrink-0 text-[#111827]" />
                Буцах
              </Button>

              {!isFinalStep ? (
                <Button
                  type="button"
                  onClick={() => moveToStep(currentStep + 1)}
                  className="h-[46px] rounded-[10px] bg-[#4D97F8] px-5 text-[13px] font-semibold text-white shadow-[0_16px_32px_rgba(77,151,248,0.28)] hover:bg-[#3F88E8] hover:shadow-[0_16px_32px_rgba(77,151,248,0.28)]"
                >
                  Үргэлжлүүлэх
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={submitFinalStep}
                  loading={loading}
                  loadingText={finalLoadingText}
                  className="h-[46px] rounded-[10px] bg-[#4D97F8] px-5 text-[13px] font-semibold text-white shadow-[0_16px_32px_rgba(77,151,248,0.28)] hover:bg-[#3F88E8] hover:shadow-[0_16px_32px_rgba(77,151,248,0.28)]"
                >
                  {finalButtonLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
