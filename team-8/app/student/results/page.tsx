import Link from "next/link";
import { getStudentResults } from "@/lib/student/actions";
import { Eye, LockKeyhole } from "lucide-react";

const TIMEZONE = "Asia/Ulaanbaatar";

function formatDateOnly(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("mn-MN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TIMEZONE,
  });
}

function formatTimeOnly(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
}

function formatDateTimeLabel(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("mn-MN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
}

function getScoreColor(pct: number) {
  if (pct >= 80) return "#2E7D32";
  if (pct >= 60) return "#E2A94A";
  return "#D44F45";
}

export default async function StudentResultsPage() {
  const results = await getStudentResults();

  return (
    <div className="flex flex-col gap-6.5">
      <div className="flex items-center gap-6.5">
        <h2 className="text-2xl font-medium tracking-tight">
          Миний өгсөн шалгалтууд
        </h2>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0000001A] text-m font-medium text-foreground">
          {results.length}
        </span>
      </div>

      {results.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Одоогоор шалгалт өгөөгүй байна.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {results.map((r) => {
            const canViewResults = Boolean(r.can_view_results);
            const hasScore =
              r.total_score != null && r.max_score != null && canViewResults;
            const pct =
              r.max_score && r.max_score > 0
                ? Math.round((r.total_score / r.max_score) * 100)
                : 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const exam = r.exams as any;
            const scoreColor = getScoreColor(pct);
            const dateLabel = formatDateOnly(
              r.submitted_at ?? r.started_at ?? null,
            );
            const timeStart = formatTimeOnly(r.started_at ?? null);
            const timeEnd = formatTimeOnly(r.submitted_at ?? null);
            const releaseLabel = formatDateTimeLabel(r.result_release_at ?? null);

            return (
              <div
                key={r.id}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">
                    {exam?.title ?? "Шалгалт"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {!canViewResults
                      ? "Дүн дараа нээгдэнэ"
                      : r.status === "graded"
                      ? "Шалгалтын дүн гарсан"
                      : r.status === "timed_out"
                        ? "Хугацаа дууссан"
                        : "Шалгагдаж байна"}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{dateLabel}</span>
                  <span>
                    {timeStart && timeEnd ? `${timeStart}-${timeEnd}` : ""}
                  </span>
                </div>

                <div className="my-4 h-px bg-muted" />

                {hasScore ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">
                        Шалгалтын дүн
                      </span>
                      <span className="font-semibold text-foreground">
                        {pct}%
                      </span>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: scoreColor,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Таны хариулт амжилттай илгээгдсэн.
                    </p>
                    <p className="mt-1">
                      {releaseLabel
                        ? `Дүн ${releaseLabel}-с хойш нээгдэнэ.`
                        : "Дүн шалгалтын нийт хугацаа дууссаны дараа нээгдэнэ."}
                    </p>
                    {r.grading_pending ? (
                      <p className="mt-1">Одоогоор үр дүн боловсруулагдаж байна.</p>
                    ) : null}
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  {canViewResults ? (
                    <Link href={`/student/exams/${r.exam_id}/result`}>
                      <button className="inline-flex items-center gap-2 rounded-lg bg-black px-5.5 py-2.5 text-xs font-semibold text-white">
                        <Eye className="h-4 w-4" />
                        Үр дүн
                      </button>
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="inline-flex items-center gap-2 rounded-lg bg-muted px-5.5 py-2.5 text-xs font-semibold text-muted-foreground"
                    >
                      <LockKeyhole className="h-4 w-4" />
                      Түгжээтэй
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
