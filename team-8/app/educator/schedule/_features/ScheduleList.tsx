"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setExamRoom } from "@/lib/schedule/actions";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Users,
  BookOpen,
} from "lucide-react";

type ConflictInfo = {
  examTitle: string;
  reason: "shared_students" | "same_room";
};

type ScheduleRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
  subject_name: string | null;
  room: string | null;
  groups: { id: string; name: string }[];
  conflicts: ConflictInfo[];
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByDate(rows: ScheduleRow[]) {
  const map = new Map<string, ScheduleRow[]>();
  for (const row of rows) {
    const dateKey = new Date(row.start_time).toLocaleDateString("mn-MN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
    });
    const existing = map.get(dateKey) ?? [];
    existing.push(row);
    map.set(dateKey, existing);
  }
  return map;
}

function RoomEditor({
  examId,
  initialRoom,
}: {
  examId: string;
  initialRoom: string | null;
}) {
  const [room, setRoom] = useState(initialRoom ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setExamRoom(examId, room || null);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          value={room}
          onChange={(e) => {
            setRoom(e.target.value);
            setSaved(false);
          }}
          placeholder="Танхим (жш: 201)"
          className="h-7 w-32 text-xs"
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={isPending}
          onClick={handleSave}
        >
          {isPending ? "..." : saved ? "✓" : "Хадгалах"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive pl-5">{error}</p>}
    </div>
  );
}

function conflictLabel(c: ConflictInfo): string {
  if (c.reason === "same_room") return `"${c.examTitle}" (ижил танхим)`;
  return `"${c.examTitle}" (нийтлэг сурагч)`;
}

export default function ScheduleList({ rows }: { rows: ScheduleRow[] }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());

    updateNow();
    const intervalId = window.setInterval(updateNow, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Хуваарьласан шалгалт байхгүй байна.
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByDate(rows);

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([dateKey, exams]) => (
        <div key={dateKey}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {dateKey}
          </h3>
          <div className="space-y-2">
            {exams.map((exam) => {
              const start = new Date(exam.start_time).getTime();
              const end = new Date(exam.end_time).getTime();
              const isActive = now !== null && now >= start && now <= end;
              const isPast = now !== null && now > end;
              const hasConflict = exam.conflicts.length > 0;

              return (
                <Card
                  key={exam.id}
                  className={`border ${
                    hasConflict
                      ? "border-orange-300 bg-orange-50/40"
                      : isActive
                      ? "border-green-300 bg-green-50/40"
                      : ""
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      {/* Зүүн: мэдээлэл */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">
                            {exam.title}
                          </span>
                          {!exam.is_published && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              Нийтлээгүй
                            </Badge>
                          )}
                          {isActive && (
                            <Badge className="text-xs bg-green-600 shrink-0">
                              Явагдаж байна
                            </Badge>
                          )}
                          {isPast && (
                            <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                              Дууссан
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {exam.subject_name && (
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              {exam.subject_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(exam.start_time)} –{" "}
                            {formatTime(exam.end_time)}{" "}
                            <span className="text-muted-foreground/70">
                              ({exam.duration_minutes} мин)
                            </span>
                          </span>
                          {exam.groups.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {exam.groups.map((g) => g.name).join(", ")}
                            </span>
                          )}
                        </div>

                        {/* Зөрчлийн анхааруулга */}
                        {hasConflict && (
                          <div className="flex items-start gap-1.5 rounded-md bg-orange-100 px-2 py-1 text-xs text-orange-700">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>
                              <strong>Зөрчил:</strong>{" "}
                              {exam.conflicts.map(conflictLabel).join("; ")}{" "}
                              шалгалттай ижил цагт
                            </span>
                          </div>
                        )}

                        {!hasConflict && exam.groups.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Зөрчилгүй
                          </div>
                        )}
                      </div>

                      {/* Баруун: танхим засварлах */}
                      <div className="shrink-0">
                        <RoomEditor
                          examId={exam.id}
                          initialRoom={exam.room}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
