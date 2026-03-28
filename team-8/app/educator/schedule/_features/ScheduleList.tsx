"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setExamRoom } from "@/lib/schedule/actions";
import {
  formatDateLabelUB,
  formatDateStampUB,
  formatTimeUB,
} from "@/lib/utils/date";
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

function getOccupiedEndMs(row: Pick<ScheduleRow, "end_time" | "duration_minutes">) {
  const closeTimeMs = new Date(row.end_time).getTime();
  const durationMs = Number(row.duration_minutes ?? 0) * 60 * 1000;

  if (
    Number.isNaN(closeTimeMs) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return closeTimeMs;
  }

  return closeTimeMs + durationMs;
}

function groupByDate(rows: ScheduleRow[]) {
  const map = new Map<string, ScheduleRow[]>();
  for (const row of rows) {
    const dateKey = formatDateLabelUB(row.start_time);
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
  const [filter, setFilter] = useState<
    "all" | "today" | "next7" | "conflicts" | "live"
  >("all");

  useEffect(() => {
    const updateNow = () => setNow(Date.now());

    updateNow();
    const intervalId = window.setInterval(updateNow, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const filteredRows = useMemo(() => {
    if (now === null) return rows;

    const today = formatDateStampUB(new Date(now));

    return rows.filter((row) => {
      const start = new Date(row.start_time).getTime();
      const end = getOccupiedEndMs(row);
      const rowDate = formatDateStampUB(row.start_time);

      if (filter === "today") return rowDate === today;
      if (filter === "next7") {
        return start >= now && start <= now + 7 * 24 * 60 * 60 * 1000;
      }
      if (filter === "conflicts") return row.conflicts.length > 0;
      if (filter === "live") return now >= start && now <= end;
      return true;
    });
  }, [filter, now, rows]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Хуваарьласан шалгалт байхгүй байна.
        </CardContent>
      </Card>
    );
  }

  const todayCount =
    now === null
      ? 0
      : rows.filter((row) => {
          const rowDate = formatDateStampUB(row.start_time);
          const today = formatDateStampUB(new Date(now));
          return rowDate === today;
        }).length;
  const liveCount =
    now === null
      ? 0
      : rows.filter((row) => {
          const start = new Date(row.start_time).getTime();
          const end = getOccupiedEndMs(row);
          return now >= start && now <= end;
        }).length;
  const nextSevenDaysCount =
    now === null
      ? 0
      : rows.filter((row) => {
          const start = new Date(row.start_time).getTime();
          return start >= now && start <= now + 7 * 24 * 60 * 60 * 1000;
        }).length;
  const conflictCount = rows.filter((row) => row.conflicts.length > 0).length;

  const grouped = groupByDate(filteredRows);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">Өнөөдөр</p>
            <p className="text-3xl font-semibold">{todayCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">Явагдаж буй</p>
            <p className="text-3xl font-semibold">{liveCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">7 хоногийн дотор</p>
            <p className="text-3xl font-semibold">{nextSevenDaysCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">Давхцал</p>
            <p className="text-3xl font-semibold">{conflictCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "Бүгд" },
          { key: "today", label: "Өнөөдөр" },
          { key: "next7", label: "7 хоног" },
          { key: "live", label: "Явагдаж буй" },
          { key: "conflicts", label: "Давхцалтай" },
        ].map((item) => (
          <Button
            key={item.key}
            type="button"
            size="sm"
            variant={filter === item.key ? "secondary" : "outline"}
            onClick={() =>
              setFilter(
                item.key as "all" | "today" | "next7" | "conflicts" | "live"
              )
            }
          >
            {item.label}
          </Button>
        ))}
      </div>

      {filteredRows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Энэ шүүлтүүрт тохирох шалгалт алга.
          </CardContent>
        </Card>
      )}

      {[...grouped.entries()].map(([dateKey, exams]) => (
        <div key={dateKey}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {dateKey}
          </h3>
          <div className="space-y-2">
            {exams.map((exam) => {
              const start = new Date(exam.start_time).getTime();
              const end = getOccupiedEndMs(exam);
              const isActive = now !== null && now >= start && now <= end;
              const isPast = now !== null && now > end;
              const hasConflict = exam.conflicts.length > 0;

              return (
                <Card
                  key={exam.id}
                  className={`border ${
                    hasConflict
                      ? "border-amber-300 bg-amber-50/30"
                      : isActive
                      ? "border-slate-300 bg-slate-50"
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
                            <Badge variant="secondary" className="text-xs shrink-0">
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
                            {formatTimeUB(exam.start_time)} –{" "}
                            {formatTimeUB(exam.end_time)}{" "}
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
                          <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>
                              <strong>Зөрчил:</strong>{" "}
                              {exam.conflicts.map(conflictLabel).join("; ")}{" "}
                              шалгалттай ижил цагт
                            </span>
                          </div>
                        )}

                        {!hasConflict && exam.groups.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
