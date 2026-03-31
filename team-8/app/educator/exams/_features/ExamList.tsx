"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteExam, publishExam } from "@/lib/exam/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BarChart2, MoreVertical, PlusCircle } from "lucide-react";
import type { ExamLifecycleSummary } from "@/lib/exam-lifecycle";

interface Exam {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
  max_attempts: number;
  shuffle_options: boolean;
  subjects?: { name: string } | null;
  questions: { count: number }[];
  lifecycle: ExamLifecycleSummary | null;
}

interface Props {
  exams: Exam[];
}

type GroupMode = "status" | "subject";

const STATUS_ORDER: ExamLifecycleSummary["key"][] = [
  "draft",
  "ready",
  "published",
  "live",
  "grading",
  "finalized",
];

const STATUS_LABELS: Record<ExamLifecycleSummary["key"], string> = {
  draft: "Ноорог",
  ready: "Бэлэн",
  published: "Товлогдсон",
  live: "Явагдаж байна",
  grading: "Шалгаж байна",
  finalized: "Дууссан",
};

export default function ExamList({ exams }: Props) {
  const [groupMode, setGroupMode] = useState<GroupMode>("status");
  const [currentTime, setCurrentTime] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(Date.now());

    updateCurrentTime();
    const interval = window.setInterval(updateCurrentTime, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteExam(deleteTarget.id);
    setDeleteTarget(null);
    if (result?.error) setActionError(result.error);
  }

  async function handlePublish(examId: string) {
    setActionError(null);
    const result = await publishExam(examId);
    if (result?.error) setActionError(result.error);
  }

  function getFallbackLifecycle(
    startTime: string,
    endTime: string,
    isPublished: boolean,
  ): ExamLifecycleSummary {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    if (!isPublished) {
      return {
        key: "draft",
        label: "Ноорог",
        description: "",
        variant: "outline",
      };
    }

    if (currentTime < start) {
      return {
        key: "published",
        label: "Товлогдсон",
        description: "",
        variant: "outline",
      };
    }

    if (currentTime <= end) {
      return {
        key: "live",
        label: "Явагдаж байна",
        description: "",
        variant: "default",
      };
    }

    return {
      key: "finalized",
      label: "Дууссан",
      description: "",
      variant: "secondary",
    };
  }

  function canEditExam(exam: Exam, lifecycle: ExamLifecycleSummary) {
    return !exam.is_published || lifecycle.key === "published";
  }

  if (exams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Шалгалт алга.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/educator/create-exam">
            <PlusCircle className="mr-2 h-4 w-4" />
            Шалгалт үүсгэх
          </Link>
        </Button>
      </div>
    );
  }

  const normalized = exams.map((exam) => {
    const lifecycle =
      exam.lifecycle ??
      getFallbackLifecycle(exam.start_time, exam.end_time, exam.is_published);

    return {
      exam,
      lifecycle,
      questionCount: exam.questions?.[0]?.count ?? 0,
      subjectName: exam.subjects?.name?.trim() || "Хичээлгүй",
    };
  });

  const grouped =
    groupMode === "status"
      ? STATUS_ORDER.map((statusKey) => ({
          key: statusKey,
          label: STATUS_LABELS[statusKey],
          items: normalized.filter((item) => item.lifecycle.key === statusKey),
        })).filter((section) => section.items.length > 0)
      : Array.from(
          normalized.reduce((acc, item) => {
            const key = item.subjectName;
            const existing = acc.get(key) ?? [];
            existing.push(item);
            acc.set(key, existing);
            return acc;
          }, new Map<string, typeof normalized>()),
        )
          .sort((a, b) => a[0].localeCompare(b[0], "mn"))
          .map(([key, items]) => ({
            key,
            label: key,
            items,
          }));

  function getPrimaryAction(
    exam: Exam,
    lifecycle: ExamLifecycleSummary,
  ): { href: string; label: string; variant?: "outline" | "secondary" } | null {
    if (canEditExam(exam, lifecycle)) {
      return {
        href: `/educator/exams/${exam.id}/edit`,
        label: "Засах",
        variant: exam.is_published ? "secondary" : "outline",
      };
    }

    if (exam.is_published) {
      return {
        href: `/educator/exams/${exam.id}/results`,
        label: "Дүн",
        variant: "secondary",
      };
    }

    return null;
  }

  return (
    <>
      {actionError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Шалгалт устгах уу?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; шалгалтыг устгана.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Цуцлах</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Устгах
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-4 ">
        <div className="inline-flex rounded-full  p-1 bg-[#F0EEEE]">
          <Button
            type="button"
            variant={groupMode === "subject" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-full px-5 py-4.5 gap-2.5"
            onClick={() => setGroupMode("subject")}
          >
            Нийтлэгдсэн шалгалтууд
            <div className="w-7.5 h-7.5 rounded-full bg-[#0000001A]"></div>
          </Button>
          <Button
            type="button"
            variant={groupMode === "status" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-full px-5 py-4.5 gap-2.5"
            onClick={() => setGroupMode("status")}
          >
            Хүлээгдэж буй шалгалтууд
            <div className="w-7.5 h-7.5 rounded-full bg-[#0000001A]"></div>
          </Button>

          <Button
            type="button"
            className="rounded-full px-5 py-4.5 gap-2.5"
            variant={groupMode === "subject" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setGroupMode("subject")}
          >
            Хадгалагдсан шалгалтууд
            <div className="w-7.5 h-7.5 rounded-full bg-[#0000001A]"></div>
          </Button>
        </div>

        <div className="space-y-4">
          {grouped.map((section) => (
            <Card key={section.key} className="overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold">{section.label}</h3>
                <span className="text-xs text-muted-foreground">
                  {section.items.length}
                </span>
              </div>

              <div className="divide-y">
                {section.items.map(
                  ({ exam, lifecycle, questionCount, subjectName }) => {
                    const primaryAction = getPrimaryAction(exam, lifecycle);

                    return (
                      <div
                        key={exam.id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">
                              {exam.title}
                            </p>
                            {groupMode === "subject" && (
                              <Badge variant={lifecycle.variant}>
                                {lifecycle.label}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {groupMode === "status" ? `${subjectName} · ` : ""}
                            {formatDateTimeUB(exam.start_time)} ·{" "}
                            {exam.duration_minutes} мин
                            {" · "}
                            {questionCount} асуулт
                          </p>
                        </div>

                        {primaryAction && (
                          <Button
                            asChild
                            variant={primaryAction.variant ?? "outline"}
                            size="sm"
                          >
                            <Link href={primaryAction.href}>
                              {primaryAction.label}
                            </Link>
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEditExam(exam, lifecycle) && (
                              <DropdownMenuItem asChild>
                                <Link href={`/educator/exams/${exam.id}/edit`}>
                                  Засварлах
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/educator/exams/${exam.id}/questions`}
                              >
                                Асуулт
                              </Link>
                            </DropdownMenuItem>
                            {exam.is_published && (
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/educator/exams/${exam.id}/results`}
                                >
                                  <BarChart2 className="mr-2 h-4 w-4" />
                                  Дүн
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {!exam.is_published && questionCount > 0 && (
                              <DropdownMenuItem
                                onClick={() => handlePublish(exam.id)}
                              >
                                Нийтлэх
                              </DropdownMenuItem>
                            )}
                            {!exam.is_published && questionCount === 0 && (
                              <DropdownMenuItem
                                disabled
                                className="text-muted-foreground"
                              >
                                Нийтлэх боломжгүй
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  id: exam.id,
                                  title: exam.title,
                                })
                              }
                            >
                              Устгах
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  },
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
