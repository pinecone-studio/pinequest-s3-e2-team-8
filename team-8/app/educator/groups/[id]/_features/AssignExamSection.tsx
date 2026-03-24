"use client";

import { useState } from "react";
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
  } | null;
}

interface AvailableExam {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
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
  const [selectedExamId, setSelectedExamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
              {availableExams.length > 0 ? (
                availableExams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id}>
                    {exam.title}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__empty" disabled>
                  Published шалгалт алга
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={loading || availableExams.length === 0}
            className="w-full sm:w-auto"
          >
            {loading ? "Оноож байна..." : "Шалгалт оноох"}
          </Button>
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

            return (
              <Card key={assignment.exam_id}>
                <CardContent className="flex items-start justify-between gap-4 pt-4">
                  <div className="space-y-2">
                    <p className="font-medium">{exam?.title || "Шалгалт"}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {exam?.duration_minutes ?? 0} мин
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
