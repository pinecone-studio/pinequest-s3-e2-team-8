"use client";

import { useMemo, useState, useTransition } from "react";
import { addTeacherSubject, removeTeacherSubject } from "@/lib/admin/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Subject,
  TeacherAssignmentTeacher,
} from "./teacher-assignment-types";

interface Props {
  teacher: TeacherAssignmentTeacher;
  allSubjects: Subject[];
}

function getTeacherInitials(name: string, email: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return email.slice(0, 2).toUpperCase();
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

export default function TeacherAssignmentPanel({
  teacher,
  allSubjects,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const assignedSubjectIds = new Set(
    teacher.subjects.map((subject) => subject.id),
  );
  const availableSubjects = allSubjects.filter(
    (subject) => !assignedSubjectIds.has(subject.id),
  );
  const subjectGrades = useMemo(() => {
    const nextMap = new Map<string, string[]>();

    for (const assignment of teacher.assignments) {
      const grade = assignment.student_groups?.grade;
      if (grade === null || grade === undefined) continue;

      const current = nextMap.get(assignment.subject_id) ?? [];
      const label = `${grade}-р анги`;

      if (!current.includes(label)) {
        current.push(label);
        current.sort(
          (left, right) =>
            Number.parseInt(left, 10) - Number.parseInt(right, 10),
        );
      }

      nextMap.set(assignment.subject_id, current);
    }

    return nextMap;
  }, [teacher.assignments]);
  const subjectChips = useMemo(() => {
    const chips: string[] = [`${teacher.subjects.length} хичээл`];

    teacher.subjects.forEach((subject) => {
      chips.push(subject.name);

      const grades = subjectGrades.get(subject.id) ?? [];
      grades.forEach((grade) => {
        if (!chips.includes(grade)) {
          chips.push(grade);
        }
      });
    });

    return chips;
  }, [subjectGrades, teacher.subjects]);

  function handleAddSubject() {
    if (!newSubjectId) return;

    setError(null);
    startTransition(async () => {
      const result = await addTeacherSubject(teacher.id, newSubjectId);
      if (result?.error) {
        setError(result.error);
        return;
      }

      setNewSubjectId("");
    });
  }

  function handleRemoveSubject(subjectId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeTeacherSubject(teacher.id, subjectId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-[24px] border border-transparent transition-all",
        isExpanded &&
          "border-[#edf2fb] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.08)]",
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <Avatar size="lg" className="mt-0.5 bg-[#eef4ff] text-[#3156a6]">
              <AvatarFallback className="bg-[#eef4ff] font-medium text-[#3156a6]">
                {getTeacherInitials(teacher.full_name || "", teacher.email)}
              </AvatarFallback>
            </Avatar>

            <div>
              <h4 className="text-[14px] font-medium text-zinc-950">
                {teacher.full_name || "(Нэргүй багш)"}
              </h4>
              <p className="text-[12px] font-medium text-zinc-500">
                {teacher.email}
              </p>

              {isExpanded ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {subjectChips.map((chip) => (
                    <Badge
                      key={chip}
                      variant="secondary"
                      className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[13px] font-medium text-zinc-700 shadow-none"
                    >
                      {chip}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className="flex items-center gap-2 self-end text-[16px] font-semibold text-[#5f89d8] transition-colors hover:text-[#4078C1] md:self-start"
            onClick={() => setIsExpanded((current) => !current)}
          >
            Дэлгэрэнгүй
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                isExpanded && "rotate-180",
              )}
            />
          </button>
        </div>

        {error ? (
          <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {isExpanded ? (
          <div className="space-y-4 border-t border-[#edf2fb] pt-1">
            <div className="space-y-3">
              {teacher.subjects.length > 0 ? (
                <div className="space-y-2">
                  {teacher.subjects.map((subject) => {
                    const gradeLabels = subjectGrades.get(subject.id) ?? [];

                    return (
                      <div
                        key={subject.id}
                        className="flex items-center justify-between gap-3 rounded-[12px] bg-[#f4f4f5] px-4 py-4"
                      >
                        <div>
                          <p className="text-[15px] font-semibold text-zinc-900">
                            {subject.name}
                          </p>
                          <p className="mt-1 text-[14px] text-zinc-500">
                            {gradeLabels.length > 0
                              ? gradeLabels.join(", ")
                              : "Анги оноогоогүй"}
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSubject(subject.id)}
                          disabled={isPending}
                          className="h-10 w-10 rounded-xl p-0 text-[#ef6b63] hover:bg-[#ffe9e7] hover:text-[#df5148]"
                          aria-label={`${subject.name} хичээлийг устгах`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
                  Одоогоор энэ багшид хичээл оноогоогүй байна.
                </div>
              )}
            </div>

            <div className="rounded-[16px] bg-[#eef5ff] px-4 py-4">
              <p className="text-sm font-semibold text-[#5f89d8]">
                Шинэ хичээл нэмэх
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Доорх жагсаалтаас сонгоод тухайн багшид шууд онооно.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <select
                  value={newSubjectId}
                  onChange={(event) => setNewSubjectId(event.target.value)}
                  className="h-12 flex-1 rounded-[12px] border border-[#d8e3f8] bg-white px-4 text-sm outline-none transition focus:border-[#9fc3ff]"
                >
                  <option value="">Хичээл сонгох</option>
                  {availableSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>

                <Button
                  type="button"
                  onClick={handleAddSubject}
                  disabled={isPending || !newSubjectId}
                  className="h-12 rounded-[12px] bg-[#6ea1f2] px-5 hover:bg-[#5b92eb]"
                >
                  Хичээл нэмэх
                </Button>
              </div>

              {availableSubjects.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  Нэмэх боломжтой өөр хичээл үлдээгүй байна.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
