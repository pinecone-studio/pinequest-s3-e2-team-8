"use client";

import { useState, useTransition } from "react";
import {
  addTeacherSubject,
  removeTeacherSubject,
  addTeachingAssignment,
  removeTeachingAssignment,
} from "@/lib/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Plus } from "lucide-react";

interface Subject {
  id: string;
  name: string;
}

interface Group {
  id: string;
  name: string;
  grade: number | null;
  group_type: string;
}

interface Assignment {
  id: string;
  group_id: string;
  subject_id: string;
  student_groups: Group | null;
  subjects: Subject | null;
}

interface Teacher {
  id: string;
  email: string;
  full_name: string;
  subjects: (Subject | null)[];
  assignments: Assignment[];
}

interface Props {
  teacher: Teacher;
  allSubjects: Subject[];
  allGroups: Group[];
}

export default function TeacherAssignmentPanel({ teacher, allSubjects, allGroups }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newAssignSubjectId, setNewAssignSubjectId] = useState("");

  const assignedSubjectIds = new Set(
    teacher.subjects.filter(Boolean).map((s) => s!.id)
  );
  const availableSubjects = allSubjects.filter((s) => !assignedSubjectIds.has(s.id));

  function handleAddSubject() {
    if (!newSubjectId) return;
    setError(null);
    startTransition(async () => {
      const result = await addTeacherSubject(teacher.id, newSubjectId);
      if (result?.error) setError(result.error);
      else setNewSubjectId("");
    });
  }

  function handleRemoveSubject(subjectId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeTeacherSubject(teacher.id, subjectId);
      if (result?.error) setError(result.error);
    });
  }

  function handleAddAssignment() {
    if (!newGroupId || !newAssignSubjectId) return;
    setError(null);
    startTransition(async () => {
      const result = await addTeachingAssignment(teacher.id, newGroupId, newAssignSubjectId);
      if (result?.error) setError(result.error);
      else {
        setNewGroupId("");
        setNewAssignSubjectId("");
      }
    });
  }

  function handleRemoveAssignment(assignmentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeTeachingAssignment(assignmentId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {teacher.full_name || "(Нэр байхгүй)"}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {teacher.email}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* ── Subjects ── */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Заах хичээлүүд</p>
          <div className="flex flex-wrap gap-2">
            {teacher.subjects.filter(Boolean).map((s) => (
              <Badge key={s!.id} variant="secondary" className="gap-1 pr-1">
                {s!.name}
                <button
                  type="button"
                  onClick={() => handleRemoveSubject(s!.id)}
                  disabled={isPending}
                  className="ml-1 rounded hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {teacher.subjects.filter(Boolean).length === 0 && (
              <span className="text-sm text-muted-foreground">Хичээл оноогдоогүй</span>
            )}
          </div>
          {availableSubjects.length > 0 && (
            <div className="flex gap-2">
              <select
                value={newSubjectId}
                onChange={(e) => setNewSubjectId(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Хичээл сонгох</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddSubject}
                disabled={isPending || !newSubjectId}
              >
                <Plus className="mr-1 h-3 w-3" /> Нэмэх
              </Button>
            </div>
          )}
        </div>

        {/* ── Teaching assignments ── */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Бүлгийн оноолт (хичээл → бүлэг)</p>
          <div className="space-y-1">
            {teacher.assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                <span>
                  <span className="font-medium">{a.subjects?.name ?? "—"}</span>
                  {" → "}
                  {a.student_groups?.name ?? "—"}
                  {a.student_groups?.grade ? ` (${a.student_groups.grade}-р анги)` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveAssignment(a.id)}
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {teacher.assignments.length === 0 && (
              <span className="text-sm text-muted-foreground">Бүлгийн оноолт байхгүй</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={newAssignSubjectId}
              onChange={(e) => setNewAssignSubjectId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Хичээл</option>
              {teacher.subjects.filter(Boolean).map((s) => (
                <option key={s!.id} value={s!.id}>{s!.name}</option>
              ))}
            </select>
            <select
              value={newGroupId}
              onChange={(e) => setNewGroupId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Бүлэг</option>
              {allGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.grade ? ` (${g.grade}-р анги)` : ""}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleAddAssignment}
              disabled={isPending || !newGroupId || !newAssignSubjectId}
            >
              <Plus className="mr-1 h-3 w-3" /> Оноох
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
