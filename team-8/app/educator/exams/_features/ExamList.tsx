"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteExam, publishExam } from "@/lib/exam/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function ExamList({ exams }: Props) {
  const [currentTime, setCurrentTime] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
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

  function getFallbackLifecycle(startTime: string, endTime: string, isPublished: boolean) {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    if (!isPublished) {
      return {
        label: "Ноорог",
        description: "Шалгалтаа нийтлэхээс өмнө агуулга, assignment-аа шалгана уу.",
        variant: "outline" as const,
      };
    }

    if (currentTime < start) {
      return {
        label: "Товлогдсон",
        description: "Шалгалт нийтлэгдсэн бөгөөд эхлэх цагаа хүлээж байна.",
        variant: "outline" as const,
      };
    }

    if (currentTime <= end) {
      return {
        label: "Явагдаж байна",
        description: "Сурагчид одоогоор шалгалт өгч байна.",
        variant: "default" as const,
      };
    }

    return {
      label: "Дууссан",
      description: "Шалгалтын идэвхтэй хугацаа дууссан байна.",
      variant: "secondary" as const,
    };
  }

  if (exams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-muted-foreground">Шалгалт байхгүй байна.</p>
        <Button
          asChild
          variant="secondary"
          className="mt-4 bg-indigo-100/70 text-indigo-700 hover:bg-indigo-100"
        >
          <Link href="/educator/create-exam">
            <PlusCircle className="mr-2 h-4 w-4" />
            Шалгалт үүсгэх
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      {actionError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
          <button
            className="ml-2 underline"
            onClick={() => setActionError(null)}
          >
            Хаах
          </button>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Шалгалт устгах уу?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; шалгалтыг устгах гэж байна. Энэ үйлдлийг буцааж болохгүй.
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

    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {exams.map((exam) => {
        const qCount = exam.questions?.[0]?.count ?? 0;
        const startDate = formatDateTimeUB(exam.start_time);
        const lifecycle =
          exam.lifecycle ??
          getFallbackLifecycle(
            exam.start_time,
            exam.end_time,
            exam.is_published
          );
        return (
          <Card key={exam.id} className="flex flex-col">
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-base leading-tight">{exam.title}</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/educator/exams/${exam.id}/questions`}>Асуулт засах</Link>
                  </DropdownMenuItem>
                  {exam.is_published && (
                    <DropdownMenuItem asChild>
                      <Link href={`/educator/exams/${exam.id}/results`}>
                        <BarChart2 className="mr-2 h-4 w-4" />
                        Дүн харах
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!exam.is_published && (
                    <DropdownMenuItem asChild>
                      <Link href={`/educator/exams/${exam.id}/edit`}>Шалгалт засах</Link>
                    </DropdownMenuItem>
                  )}
                  {!exam.is_published && qCount > 0 && (
                    <DropdownMenuItem onClick={() => handlePublish(exam.id)}>
                      Нийтлэх
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteTarget({ id: exam.id, title: exam.title })}
                  >
                    Устгах
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              {exam.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{exam.description}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                <Badge variant="outline">{qCount} асуулт</Badge>
                <Badge variant="outline">{exam.duration_minutes} мин</Badge>
                <Badge variant="outline">{exam.max_attempts} оролдлого</Badge>
                {exam.subjects?.name && (
                  <Badge variant="secondary">{exam.subjects.name}</Badge>
                )}
                {exam.shuffle_options && (
                  <Badge variant="outline">Сонголт холих</Badge>
                )}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>{startDate}</p>
                <p>{lifecycle.description}</p>
              </div>
              <Link href={`/educator/exams/${exam.id}/questions`} className="mt-auto">
                <Button variant="outline" size="sm" className="w-full">
                  {exam.is_published ? "Харах" : "Засах"}
                </Button>
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
    </>
  );
}
