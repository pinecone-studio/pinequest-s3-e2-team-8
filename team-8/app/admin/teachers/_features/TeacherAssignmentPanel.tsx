"use client";

import { useMemo, useState, useTransition } from "react";
import { addTeacherSubject, removeTeacherSubject } from "@/lib/admin/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
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

  const assignedSubjectIds = new Set(teacher.subjects.map((subject) => subject.id));
  const availableSubjects = allSubjects.filter(
    (subject) => !assignedSubjectIds.has(subject.id)
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
        current.sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
      }

      nextMap.set(assignment.subject_id, current);
    }

    return nextMap;
  }, [teacher.assignments]);

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
    <Card className="rounded-[26px] border-zinc-200 py-0 shadow-none">
      <CardContent className="space-y-4 px-5 py-5">
        <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <Avatar size="lg" className="mt-0.5 bg-[#eef4ff] text-[#3156a6]">
              <AvatarFallback className="bg-[#eef4ff] font-medium text-[#3156a6]">
                {getTeacherInitials(teacher.full_name || "", teacher.email)}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-zinc-950">
                {teacher.full_name || "(Нэргүй багш)"}
              </h4>
              <p className="text-sm text-zinc-500">{teacher.email}</p>

              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full bg-[#f8fbff] text-[#3156a6]"
                >
                  {teacher.subjects.length} хичээл
                </Badge>
                {teacher.subjects.slice(0, 2).map((subject) => {
                  const gradeLabels = subjectGrades.get(subject.id) ?? [];

                  return (
                    <div key={subject.id} className="flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-zinc-100 text-zinc-600"
                      >
                        {subject.name}
                      </Badge>
                      {gradeLabels.length > 0 ? (
                        <Badge
                          variant="outline"
                          className="rounded-full bg-white text-zinc-500"
                        >
                          {gradeLabels.join(", ")}
                        </Badge>
                      ) : null}
                    </div>
                  );
                })}
                {teacher.subjects.length > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-full bg-zinc-100 text-zinc-600"
                  >
                    +{teacher.subjects.length - 2}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            onClick={() => setIsExpanded((current) => !current)}
          >
            Дэлгэрэнгүй
            <ChevronDown
              className={cn(
                "ml-2 h-4 w-4 transition-transform",
                isExpanded && "rotate-180"
              )}
            />
          </Button>
        </div>

        {error ? (
          <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {isExpanded ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700">Оноосон хичээлүүд</p>

              {teacher.subjects.length > 0 ? (
                <div className="space-y-2">
                  {teacher.subjects.map((subject) => {
                    const gradeLabels = subjectGrades.get(subject.id) ?? [];

                    return (
                      <div
                        key={subject.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/70 px-3 py-3"
                      >
                        <div>
                          <p className="font-medium text-zinc-900">{subject.name}</p>
                          <p className="text-xs text-zinc-500">
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
                          className="rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Устгах
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

            <div className="rounded-[24px] border border-dashed border-[#cfe0ff] bg-[#f8fbff] px-4 py-4">
              <p className="text-sm font-medium text-[#1d3d8f]">Шинэ хичээл нэмэх</p>
              <p className="mt-1 text-sm text-zinc-500">
                Доорх жагсаалтаас сонгоод тухайн багшид шууд онооно.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <select
                  value={newSubjectId}
                  onChange={(event) => setNewSubjectId(event.target.value)}
                  className="h-11 flex-1 rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-[#9fc3ff]"
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
                  className="h-11 rounded-2xl bg-[#2F80ED] px-4 hover:bg-[#256ed0]"
                >
                  <Plus className="mr-2 h-4 w-4" />
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
      </CardContent>
    </Card>
  );
}
