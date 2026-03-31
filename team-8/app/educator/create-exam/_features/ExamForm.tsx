"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Settings,
  Users,
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

const steps: Array<{
  title: string;
  icon: LucideIcon;
}> = [
  { title: "Үндсэн мэдээлэл", icon: BookOpen },
  { title: "Хуваарь", icon: CalendarDays },
  { title: "Тохиргоо", icon: Settings },
];

function formatGroupTypeLabel(groupType: string) {
  if (groupType === "class") return "Анги";
  if (groupType === "elective") return "Сонгон";
  if (groupType === "mixed") return "Холимог";
  return groupType;
}

function Stepper({
  currentStep,
  onStepClick,
}: {
  currentStep: number;
  onStepClick: (stepIndex: number) => void;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-y-4">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = currentStep === index;
        const completed = currentStep > index;

        return (
          <Fragment key={step.title}>
            <button
              type="button"
              onClick={() => onStepClick(index)}
              className="flex items-center gap-3 text-left"
            >
              <span
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border transition-colors",
                  active
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : completed
                      ? "border-zinc-950 bg-white text-zinc-950"
                      : "border-zinc-300 bg-white text-zinc-400"
                )}
              >
                {completed ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              <span
                className={cn(
                  "text-sm font-medium",
                  active || completed ? "text-zinc-950" : "text-zinc-500"
                )}
              >
                {step.title}
              </span>
            </button>

            {index < steps.length - 1 ? (
              <div className="mx-4 hidden items-center text-zinc-300 md:flex">
                <ChevronRight className="h-5 w-5" />
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
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
}) {
  return (
    <div className="rounded-[28px] border border-zinc-100 bg-white p-6 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.16)] md:p-8">
      <div className="space-y-6">
        <div className="space-y-2.5">
          <Label htmlFor="title" className="text-sm font-semibold text-zinc-950">
            Шалгалтын нэр
          </Label>
          <Input
            id="title"
            name="title"
            value={titleValue}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Жишээ: Математик - Хагас жилийн шалгалт"
            className="h-12 rounded-2xl border-zinc-200 bg-white px-4 text-sm shadow-none placeholder:text-zinc-400 focus-visible:ring-zinc-200"
          />
        </div>

        <div className="space-y-2.5">
          <Label className="text-sm font-semibold text-zinc-950">Хичээл</Label>
          <Select value={subjectId} onValueChange={onSubjectChange}>
            <SelectTrigger className="h-12 w-full rounded-2xl border-zinc-200 bg-white px-4 text-sm shadow-none focus-visible:ring-zinc-200">
              <SelectValue placeholder="Хичээл сонгох" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-black/8">
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

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-zinc-950">
            <Users className="h-4 w-4" />
            <Label className="text-sm font-semibold">Оноох анги / бүлгүүд</Label>
          </div>

          {selectedGroupIds.map((groupId) => (
            <input key={groupId} type="hidden" name="group_ids" value={groupId} />
          ))}

          {subjectId === "__none" ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-4 text-sm text-zinc-500">
              Эхлээд хичээлээ сонгоод, дараа нь анги бүлгээ сонгоно уу.
            </div>
          ) : availableGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-4 text-sm text-zinc-500">
              Энэ хичээлд тохирох бүлэг одоогоор алга байна.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {availableGroups.map((group) => {
                const selected = selectedGroupIds.includes(group.id);

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => onToggleGroup(group.id)}
                    className={cn(
                      "rounded-2xl border px-4 py-2.5 text-sm transition-colors",
                      selected
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-400 hover:bg-zinc-50"
                    )}
                    title={formatGroupTypeLabel(group.group_type)}
                  >
                    {group.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          <Label
            htmlFor="description"
            className="text-sm font-semibold text-zinc-950"
          >
            Тайлбар (заавал биш)
          </Label>
          <Textarea
            id="description"
            name="description"
            value={descriptionValue}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Шалгалтын тухай товч тайлбар..."
            rows={4}
            className="rounded-2xl border-zinc-200 bg-white px-4 py-3 text-sm shadow-none placeholder:text-zinc-400 focus-visible:ring-zinc-200"
          />
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
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(
    Math.min(Math.max(initialStep, 0), steps.length - 1)
  );
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? "__none");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initialGroupIds
  );
  const [titleValue, setTitleValue] = useState(initialTitle);
  const [descriptionValue, setDescriptionValue] = useState(initialDescription);
  const isFinalStep = currentStep === steps.length - 1;

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  function getGroupsForSubject(nextSubjectId: string) {
    if (nextSubjectId === "__none") return [];
    return groups.filter(
      (group) =>
        group.allowed_subject_ids.length === 0 ||
        group.allowed_subject_ids.includes(nextSubjectId)
    );
  }

  const availableGroups = getGroupsForSubject(subjectId);

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

      const startMs = parseUlaanbaatarDateTime(startTime)?.getTime() ?? Number.NaN;
      const endMs = parseUlaanbaatarDateTime(endTime)?.getTime() ?? Number.NaN;

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

    for (let stepIndex = currentStep; stepIndex < targetStep; stepIndex += 1) {
      if (!validateStep(stepIndex)) {
        return;
      }
    }

    setCurrentStep(targetStep);
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

  const pageTitle =
    mode === "edit" ? "Шалгалтын мэдээлэл" : "Шалгалт үүсгэх";
  const pageDescription =
    mode === "edit"
      ? "Шалгалтын мэдээллээ шинэчлэнэ үү"
      : "Шинэ шалгалтын тохиргоог оруулна уу";
  const finalButtonLabel =
    mode === "edit" ? "Хадгалаад буцах" : "Асуулт нэмэх";
  const finalLoadingText =
    mode === "edit" ? "Хадгалж байна..." : "Үүсгэж байна...";

  return (
    <div className="mx-auto max-w-5xl px-2 md:px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 md:text-3xl">
          {pageTitle}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 md:text-base">
          {pageDescription}
        </p>
      </div>

      <Stepper currentStep={currentStep} onStepClick={moveToStep} />

      <form
        ref={formRef}
        action={handleSubmit}
        className="space-y-8"
        onSubmit={(event) => {
          if (!isFinalStep) {
            event.preventDefault();
            moveToStep(currentStep + 1);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && currentStep < steps.length - 1) {
            const target = event.target as HTMLElement;
            if (target.tagName !== "TEXTAREA") {
              event.preventDefault();
            }
          }
        }}
      >
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className={currentStep === 0 ? "block" : "hidden"}>
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
          />
        </div>

        <div className={currentStep === 1 ? "block" : "hidden"}>
          <ExamScheduleSection
            initialStartTime={initialStartTime}
            initialEndTime={initialEndTime}
            initialDurationMinutes={initialDurationMinutes}
          />
        </div>

        <div className={currentStep === 2 ? "block" : "hidden"}>
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

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => moveToStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="h-auto px-0 text-sm font-medium text-zinc-950 hover:translate-y-0 hover:bg-transparent hover:text-zinc-700 hover:shadow-none disabled:opacity-0"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Буцах
          </Button>

          {!isFinalStep ? (
            <Button
              key={`continue-step-${currentStep}`}
              type="button"
              size="lg"
              onClick={() => moveToStep(currentStep + 1)}
              className="h-11 rounded-2xl bg-zinc-950 px-5 text-sm font-medium text-white hover:translate-y-0 hover:bg-zinc-800 hover:shadow-none"
            >
              Үргэлжлүүлэх
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              key="submit-final-step"
              type="submit"
              size="lg"
              loading={loading}
              loadingText={finalLoadingText}
              className="h-11 rounded-2xl bg-zinc-950 px-5 text-sm font-medium text-white hover:translate-y-0 hover:bg-zinc-800 hover:shadow-none"
            >
              {finalButtonLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
