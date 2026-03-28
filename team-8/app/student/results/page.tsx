import Link from "next/link";
import { getStudentResults } from "@/lib/student/actions";
import { Eye } from "lucide-react";

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

function getScoreColor(pct: number) {
  if (pct >= 80) return "#2E7D32";
  if (pct >= 60) return "#E2A94A";
  return "#D44F45";
}

export default async function StudentResultsPage() {
  const results = await getStudentResults();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight">
          Миний өгсөн шалгалтууд
        </h2>
        <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
          {results.length}
        </span>
      </div>

      {results.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Одоогоор шалгалт өгөөгүй байна.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((r) => {
            const pct =
              r.max_score && r.max_score > 0
                ? Math.round((r.total_score / r.max_score) * 100)
                : 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const exam = r.exams as any;
            const scoreColor = getScoreColor(pct);
            const dateLabel = formatDateOnly(
              r.submitted_at ?? r.started_at ?? null
            );
            const timeStart = formatTimeOnly(r.started_at ?? null);
            const timeEnd = formatTimeOnly(r.submitted_at ?? null);

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
                    {r.status === "graded"
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

                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">
                    Шалгалтын дүн
                  </span>
                  <span className="font-semibold text-foreground">{pct}%</span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(pct, 100)}%`, background: scoreColor }}
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <Link href={`/student/exams/${r.exam_id}/result`}>
                    <button className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white">
                      <Eye className="h-4 w-4" />
                      Үр дүн
                    </button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
