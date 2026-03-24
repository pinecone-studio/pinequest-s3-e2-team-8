"use client";

import { useEffect, useState } from "react";
import { assignExamToGroup, unassignExamFromGroup } from "@/lib/group/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Assignment {
  exam_id: string;
  exams?: {
    id: string;
    title: string;
    is_published: boolean;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    subjects?: { name: string } | { name: string }[] | null;
    questions?: { count: number }[] | null;
  } | null;
}

interface AvailableExam {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
  subjects?: { name: string } | { name: string }[] | null;
  questions?: { count: number }[] | null;
  conflict_error?: string | null;
}

interface AssignExamSectionProps {
  groupId: string;
  assignments: Assignment[];
  availableExams: AvailableExam[];
}

export default function AssignExamSection({
  groupId,
  assignments,
  availableExams,
}: AssignExamSectionProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const assignedExamIds = new Set(assignments.map((assignment) => assignment.exam_id));
  const unassignedExams = availableExams.filter(
    (exam) => !assignedExamIds.has(exam.id)
  );
  const selectableExams = unassignedExams.filter(
    (exam) => !exam.conflict_error
  );
  const conflictedExams = unassignedExams.filter((exam) => exam.conflict_error);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(Date.now());

    updateCurrentTime();
    const interval = window.setInterval(updateCurrentTime, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  function getSubjectName(
    subject?: { name: string } | { name: string }[] | null
  ) {
    if (Array.isArray(subject)) return subject[0]?.name ?? null;
    return subject?.name ?? null;
  }

  function getQuestionCount(
    questions?: { count: number }[] | null
  ) {
    return Array.isArray(questions) ? Number(questions[0]?.count ?? 0) : 0;
  }

  function getScheduleStatus(startTime?: string, endTime?: string) {
    if (!startTime || !endTime) {
      return { label: "Хуваарь дутуу", variant: "outline" as const };
    }

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    if (currentTime < start) {
      return { label: "Удахгүй", variant: "outline" as const };
    }

    if (currentTime <= end) {
      return { label: "Явагдаж байна", variant: "secondary" as const };
    }

    return { label: "Дууссан", variant: "secondary" as const };
  }

  async function handleAssign() {
    if (!selectedExamId) {
      setError("Оноох шалгалтаа сонгоно уу.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await assignExamToGroup(groupId, selectedExamId);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setSelectedExamId("");
    setLoading(false);
  }

  async function handleUnassign(examId: string) {
    setRemovingId(examId);
    await unassignExamFromGroup(groupId, examId);
    setRemovingId(null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Шалгалт оноох</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedExamId} onValueChange={setSelectedExamId}>
            <SelectTrigger>
              <SelectValue placeholder="Published шалгалт сонгох" />
            </SelectTrigger>
            <SelectContent>
              {selectableExams.length > 0 ? (
                selectableExams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id}>
                    {exam.title}
                    {getSubjectName(exam.subjects)
                      ? ` · ${getSubjectName(exam.subjects)}`
                      : ""}
                    {` · ${getQuestionCount(exam.questions)} асуулт`}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__empty" disabled>
                  Оноох боломжтой published шалгалт алга
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={loading || selectableExams.length === 0}
            className="w-full sm:w-auto"
          >
            {loading ? "Оноож байна..." : "Шалгалт оноох"}
          </Button>
          {conflictedExams.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">
                {conflictedExams.length} шалгалт хуваарийн зөрчлөөс болж түр түгжигдсэн байна.
              </p>
              <div className="mt-2 space-y-2">
                {conflictedExams.slice(0, 3).map((exam) => (
                  <div key={exam.id}>
                    <p className="font-medium">{exam.title}</p>
                    <p className="text-xs leading-relaxed text-amber-800">
                      {exam.conflict_error}
                    </p>
                  </div>
                ))}
                {conflictedExams.length > 3 && (
                  <p className="text-xs text-amber-800">
                    Бусад {conflictedExams.length - 3} шалгалт мөн зөрчилтэй.
                  </p>
                )}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="font-semibold">Оноогдсон шалгалтууд ({assignments.length})</h3>
        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Энэ бүлэгт шалгалт оноогоогүй байна.
          </div>
        ) : (
          assignments.map((assignment) => {
            const exam = assignment.exams;
            const scheduleStatus = getScheduleStatus(
              exam?.start_time,
              exam?.end_time
            );

            return (
              <Card key={assignment.exam_id}>
                <CardContent className="flex items-start justify-between gap-4 pt-4">
                  <div className="space-y-2">
                    <p className="font-medium">{exam?.title || "Шалгалт"}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {exam?.duration_minutes ?? 0} мин
                      </Badge>
                      {getSubjectName(exam?.subjects) && (
                        <Badge variant="secondary">
                          {getSubjectName(exam?.subjects)}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {getQuestionCount(exam?.questions)} асуулт
                      </Badge>
                      <Badge variant={scheduleStatus.variant}>
                        {scheduleStatus.label}
                      </Badge>
                      {exam?.is_published ? (
                        <Badge>Нийтлэгдсэн</Badge>
                      ) : (
                        <Badge variant="secondary">Ноорог</Badge>
                      )}
                    </div>
                    {exam?.start_time && exam?.end_time && (
                      <p className="text-sm text-muted-foreground">
                        {formatDateTimeUB(exam.start_time)} -{" "}
                        {formatDateTimeUB(exam.end_time)}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={removingId === assignment.exam_id}
                    onClick={() => handleUnassign(assignment.exam_id)}
                  >
                    {removingId === assignment.exam_id ? "..." : "Цуцлах"}
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
