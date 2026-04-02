"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteExam, publishExam } from "@/lib/exam/actions";
import { ULAANBAATAR_TIME_ZONE } from "@/lib/utils/date";
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
import { Eye, MoreHorizontal } from "lucide-react";
import type { ExamLifecycleSummary } from "@/lib/exam-lifecycle";

interface Exam {
  id: string;
  title: string;
  description: string | null;
  created_at?: string | null;
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

type ExamColumnKey = "published" | "saved" | "pending";

const STATUS_LABELS: Record<ExamLifecycleSummary["key"], string> = {
  draft: "Ноорог",
  ready: "Бэлэн",
  published: "Хүлээгдэж буй",
  live: "Явагдаж байна",
  grading: "Шалгаж байна",
  finalized: "Дууссан",
};

const COLUMN_META: Record<
  ExamColumnKey,
  {
    title: string;
    dotClassName: string;
    badgeLabel: string;
    badgeClassName: string;
    emptyMessage: string;
  }
> = {
  published: {
    title: "Нийтлэгдсэн шалгалтууд",
    dotClassName: "bg-[#39C76E]",
    badgeLabel: "Чухал",
    badgeClassName:
      "bg-[#EEF0FF] text-[#5A63FF] shadow-[inset_0_0_0_1px_rgba(90,99,255,0.08)]",
    emptyMessage: "Нийтлэгдсэн шалгалт одоогоор алга.",
  },
  saved: {
    title: "Хадгалагдсан шалгалтууд",
    dotClassName: "bg-[#6B63FF]",
    badgeLabel: "Дараа",
    badgeClassName:
      "bg-[#FFF0F0] text-[#FF6D7A] shadow-[inset_0_0_0_1px_rgba(255,109,122,0.08)]",
    emptyMessage: "Хадгалсан шалгалт одоогоор алга.",
  },
  pending: {
    title: "Хүлээгдэж буй шалгалтууд",
    dotClassName: "bg-[#FFB11A]",
    badgeLabel: "Чухал",
    badgeClassName:
      "bg-[#EEF0FF] text-[#5A63FF] shadow-[inset_0_0_0_1px_rgba(90,99,255,0.08)]",
    emptyMessage: "Хүлээгдэж буй шалгалт одоогоор алга.",
  },
};

function formatExamBoardDate(dateLike: string) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "Цагийн мэдээлэл алга";

  const parts = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ULAANBAATAR_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

  const year = parts.get("year") ?? "";
  const month = Number(parts.get("month") ?? "0");
  const day = Number(parts.get("day") ?? "0");
  const hour = parts.get("hour") ?? "00";
  const minute = parts.get("minute") ?? "00";

  return `${hour}:${minute}, ${month}-р сарын ${day}, ${year}`;
}

function getFallbackLifecycle(
  startTime: string,
  endTime: string,
  isPublished: boolean,
  nowMs: number,
): ExamLifecycleSummary {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (!isPublished) {
    return {
      key: "draft",
      label: STATUS_LABELS.draft,
      description: "",
      variant: "outline",
    };
  }

  if (!Number.isNaN(start) && nowMs < start) {
    return {
      key: "published",
      label: STATUS_LABELS.published,
      description: "",
      variant: "outline",
    };
  }

  if (!Number.isNaN(end) && nowMs <= end) {
    return {
      key: "live",
      label: STATUS_LABELS.live,
      description: "",
      variant: "default",
    };
  }

  return {
    key: "finalized",
    label: STATUS_LABELS.finalized,
    description: "",
    variant: "secondary",
  };
}

function canEditExam(exam: Exam, lifecycle: ExamLifecycleSummary) {
  return !exam.is_published || lifecycle.key === "published";
}

function getColumnForExam(exam: Exam, nowMs: number): ExamColumnKey {
  if (!exam.is_published) {
    return "saved";
  }

  const startMs = new Date(exam.start_time).getTime();
  if (!Number.isNaN(startMs) && nowMs < startMs) {
    return "pending";
  }

  return "published";
}

export default function ExamList({ exams }: Props) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;

    const result = await deleteExam(deleteTarget.id);
    setDeleteTarget(null);

    if (result?.error) {
      setActionError(result.error);
    }
  }

  async function handlePublish(examId: string) {
    setActionError(null);
    const result = await publishExam(examId);
    if (result?.error) {
      setActionError(result.error);
    }
  }

  const normalizedExams = exams
    .map((exam) => {
      const lifecycle =
        exam.lifecycle ??
        getFallbackLifecycle(
          exam.start_time,
          exam.end_time,
          exam.is_published,
          currentTime,
        );

      return {
        exam,
        lifecycle,
        columnKey: getColumnForExam(exam, currentTime),
        questionCount: exam.questions?.[0]?.count ?? 0,
      };
    })
    .sort((left, right) => {
      const leftCreatedAt = new Date(
        left.exam.created_at ?? left.exam.start_time,
      ).getTime();
      const rightCreatedAt = new Date(
        right.exam.created_at ?? right.exam.start_time,
      ).getTime();

      if (
        Number.isFinite(leftCreatedAt) &&
        Number.isFinite(rightCreatedAt) &&
        leftCreatedAt !== rightCreatedAt
      ) {
        return rightCreatedAt - leftCreatedAt;
      }

      const leftStartTime = new Date(left.exam.start_time).getTime();
      const rightStartTime = new Date(right.exam.start_time).getTime();

      if (Number.isFinite(leftStartTime) && Number.isFinite(rightStartTime)) {
        return rightStartTime - leftStartTime;
      }

      return 0;
    });

  const examsByColumn: Record<
    ExamColumnKey,
    Array<(typeof normalizedExams)[number]>
  > = {
    published: [],
    saved: [],
    pending: [],
  };

  for (const item of normalizedExams) {
    examsByColumn[item.columnKey].push(item);
  }

  return (
    <>
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
              “{deleteTarget?.title}” шалгалтыг бүр мөсөн устгана.
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

      <div className="space-y-5">
        {actionError ? (
          <div className="rounded-[18px] border border-[#F4C9CD] bg-[#FFF5F6] px-4 py-3 text-sm text-[#A33C48] shadow-[0_10px_24px_rgba(245,177,187,0.15)]">
            {actionError}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-3">
          {(Object.keys(COLUMN_META) as ExamColumnKey[]).map((columnKey) => {
            const meta = COLUMN_META[columnKey];
            const items = examsByColumn[columnKey];

            return (
              <section
                key={columnKey}
                className="rounded-[28px] border border-[#E6EDF7] bg-[linear-gradient(180deg,#FDFEFF_0%,#F7FAFF_100%)] p-4 "
              >
                <div className="flex items-center gap-2 px-2 pb-4">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full ${meta.dotClassName}`}
                  />
                  <h3 className="text-[15px] font-semibold leading-none text-[#2C3444]">
                    {meta.title}
                    <span className="ml-1 font-medium text-[#75829B]">
                      ({items.length})
                    </span>
                  </h3>
                </div>

                <div className="scrollbar-hidden space-y-4 xl:max-h-[840px] xl:overflow-y-auto xl:pr-1">
                  {items.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-[#D9E3F2] bg-white/75 px-4 py-10 text-center text-[13px] text-[#8A95A8]">
                      {meta.emptyMessage}
                    </div>
                  ) : (
                    items.map(({ exam, lifecycle, questionCount }) => {
                      const cardHref =
                        columnKey === "saved"
                          ? `/educator/exams/${exam.id}/edit`
                          : columnKey === "pending" && canEditExam(exam, lifecycle)
                            ? `/educator/exams/${exam.id}/edit`
                            : `/educator/exams/${exam.id}/results`;

                      return (
                        <article
                          key={exam.id}
                          className="group relative rounded-[22px] border border-[#E6EDF7] bg-white px-4 py-3.5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${meta.badgeClassName}`}
                            >
                              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current/75" />
                              {meta.badgeLabel}
                            </span>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`${exam.title} үйлдлүүд`}
                                  className="rounded-full p-1 text-[#9AA5B5] opacity-0 transition-all hover:bg-[#F3F6FB] hover:text-[#4B5565] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DB5FF] group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canEditExam(exam, lifecycle) ? (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/educator/exams/${exam.id}/edit`}>
                                      Засах
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}

                                <DropdownMenuItem asChild>
                                  <Link href={`/educator/exams/${exam.id}/questions`}>
                                    Асуултууд
                                  </Link>
                                </DropdownMenuItem>

                                {exam.is_published ? (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/educator/exams/${exam.id}/results`}>
                                      Дүн харах
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}

                                {!exam.is_published && questionCount > 0 ? (
                                  <DropdownMenuItem
                                    onClick={() => handlePublish(exam.id)}
                                  >
                                    Нийтлэх
                                  </DropdownMenuItem>
                                ) : null}

                                {!exam.is_published && questionCount === 0 ? (
                                  <DropdownMenuItem
                                    disabled
                                    className="text-muted-foreground"
                                  >
                                    Нийтлэх боломжгүй
                                  </DropdownMenuItem>
                                ) : null}

                                {!exam.is_published ? (
                                  <>
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
                                  </>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <Link href={cardHref} className="mt-2 block">
                            <h4 className="line-clamp-2 text-[15px] font-semibold leading-[1.45] text-[#232B39] transition-colors hover:text-[#3B82F6]">
                              {exam.title}
                            </h4>
                          </Link>

                          <p className="mt-1.5 text-[11px] leading-5 text-[#8B96AA]">
                            {formatExamBoardDate(exam.start_time)}
                          </p>

                          {columnKey === "published" ? (
                            <div className="mt-4">
                              <Link
                                href={cardHref}
                                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#BDBDBD] bg-[#FAFAFA] px-3 py-2 text-[12px] font-medium text-[#313C4D] shadow-[0_4px_12px_rgba(162,175,194,0.14)] transition hover:bg-white"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Дүнгийн мэдээлэл
                              </Link>
                            </div>
                          ) : null}

                          {columnKey === "saved" ? (
                            <div className="mt-4">
                              <Link
                                href={cardHref}
                                className="inline-flex h-7 items-center rounded-full bg-[#66C36D] px-5.5 py-2 text-[12px] font-semibold text-white shadow-[0_8px_16px_rgba(102,195,109,0.26)] transition hover:bg-[#57B95E]"
                              >
                                Ашиглах
                              </Link>
                            </div>
                          ) : null}

                          {columnKey === "pending" ? (
                            <p className="mt-2 text-[11px] font-medium text-[#8693A7]">
                              {lifecycle.label || STATUS_LABELS.published}
                            </p>
                          ) : null}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
