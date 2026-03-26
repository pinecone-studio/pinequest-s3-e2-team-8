import { getStudentResults } from "@/lib/student/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function StudentResultsPage() {
  const results = await getStudentResults();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Миний үр дүн</h2>
        <p className="text-muted-foreground">
          Өгсөн шалгалтуудын оноо, дүн
        </p>
      </div>

      {results.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Одоогоор шалгалт өгөөгүй байна.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {results.map((r) => {
            const pct =
              r.max_score && r.max_score > 0
                ? Math.round((r.total_score / r.max_score) * 100)
                : 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const exam = r.exams as any;
            const isFinal = r.status === "graded" || r.status === "timed_out";
            const passed = pct >= (exam?.passing_score ?? 60);
            const statusLabel =
              r.status === "graded"
                ? "Дүн гарсан"
                : r.status === "timed_out"
                  ? "Хугацаа дууссан"
                  : "Шалгагдаж байна";

            return (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {exam?.title ?? "Шалгалт"}
                    </CardTitle>
                    <Badge
                      variant={isFinal ? (passed ? "default" : "destructive") : "secondary"}
                      className={
                        !isFinal
                          ? "bg-muted text-foreground"
                          : passed
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : ""
                      }
                    >
                      {isFinal ? (passed ? "Тэнцсэн" : "Тэнцээгүй") : "Урьдчилсан дүн"}
                    </Badge>
                  </div>
                  <CardDescription>
                    {r.submitted_at
                      ? formatDateTimeUB(r.submitted_at)
                      : ""}
                    {" | "}
                    {statusLabel}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold">{pct}%</div>
                    <div className="text-sm text-muted-foreground">
                      {r.total_score ?? 0} / {r.max_score ?? 0} оноо
                    </div>
                    <div className="flex-1">
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${
                            !isFinal
                              ? "bg-slate-400"
                              : passed
                                ? "bg-green-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {!isFinal && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Энэ дүн эцсийн биш байж болно. Багш задгай асуултуудыг
                      шалгасны дараа шинэчлэгдэнэ.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
