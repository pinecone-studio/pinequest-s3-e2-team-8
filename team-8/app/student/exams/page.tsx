import Link from "next/link";
import { getStudentExams } from "@/lib/student/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function StudentExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorParam } = await searchParams;
  const exams = await getStudentExams();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Шалгалтууд</h2>
      </div>

      {errorParam && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Шалгалт эхлүүлэхэд алдаа гарлаа:</strong>{" "}
          {decodeURIComponent(errorParam)}
        </div>
      )}

      {exams.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Одоогоор шалгалт байхгүй байна.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {exams.map((exam) => {
            const lifecycle = String(exam.myLifecycleStatus ?? "");
            const persistedSessionStatus = String(exam.mySessionStatus ?? "");
            const hasResultRecord =
              persistedSessionStatus === "submitted" ||
              persistedSessionStatus === "graded" ||
              persistedSessionStatus === "timed_out";
            const isInProgress = lifecycle === "in_progress";
            const isAvailable =
              lifecycle === "available" || lifecycle === "retake_available";
            const isUpcoming =
              lifecycle === "scheduled" || lifecycle === "retake_scheduled";
            const isResultAvailable =
              hasResultRecord && !isAvailable && !isUpcoming && !isInProgress;
            const isExcused = lifecycle === "excused";
            const isAbsent = lifecycle === "absent";
            const isTimedOut = lifecycle === "timed_out";

            return (
              <Card key={exam.id} className="flex flex-col rounded-2xl">
                <CardHeader className="space-y-3 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="line-clamp-2 text-base leading-6">
                      {exam.title}
                    </CardTitle>
                    {isResultAvailable && (
                      <Badge variant="secondary" className="shrink-0">
                        Өгсөн
                      </Badge>
                    )}
                    {!isResultAvailable && isAvailable && (
                      <Badge variant="secondary" className="shrink-0">
                        {lifecycle === "retake_available"
                          ? "Нөхөн шалгалт"
                          : "Одоо эхэлнэ"}
                      </Badge>
                    )}
                    {!isResultAvailable && isUpcoming && (
                      <Badge variant="outline" className="shrink-0">
                        {lifecycle === "retake_scheduled"
                          ? "Нөхөн товлогдсон"
                          : "Удахгүй"}
                      </Badge>
                    )}
                    {isExcused && (
                      <Badge variant="outline" className="shrink-0">
                        Чөлөөлөгдсөн
                      </Badge>
                    )}
                    {isTimedOut && (
                      <Badge variant="outline" className="shrink-0">
                        Хугацаа дууссан
                      </Badge>
                    )}
                    {isAbsent && (
                      <Badge variant="outline" className="shrink-0">
                        Өгөөгүй
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4 pt-0">
                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    <p>Нээгдэнэ: {formatDateTimeUB(exam.start_time)}</p>
                    <p>Хаагдана: {formatDateTimeUB(exam.end_time)}</p>
                    <p>{exam.duration_minutes} минут</p>
                  </div>

                  {isResultAvailable && (
                    <Link href={`/student/exams/${exam.id}/result`}>
                      <Button variant="outline" className="w-full">
                        Үр дүн харах
                      </Button>
                    </Link>
                  )}

                  {!isResultAvailable && isInProgress && (
                    <Link href={`/student/exams/${exam.id}/take`}>
                      <Button variant="outline" className="w-full">
                        Үргэлжлүүлэх
                      </Button>
                    </Link>
                  )}

                  {!isResultAvailable && !isInProgress && isAvailable && (
                    <Link href={`/student/exams/${exam.id}/take`}>
                      <Button className="w-full">
                        {lifecycle === "retake_available"
                          ? "Нөхөн шалгалт өгөх"
                          : "Шалгалт өгөх"}
                      </Button>
                    </Link>
                  )}

                  {!isResultAvailable && isUpcoming && (
                    <Button disabled variant="outline" className="w-full">
                      Эхлээгүй байна
                    </Button>
                  )}

                  {!isResultAvailable && isExcused && (
                    <Button disabled variant="outline" className="w-full">
                      Чөлөөлөгдсөн
                    </Button>
                  )}

                  {!isResultAvailable &&
                    !isInProgress &&
                    (isAbsent || isTimedOut) && (
                      <Button disabled variant="outline" className="w-full">
                        {isTimedOut ? "Хугацаа дууссан" : "Өгөөгүй"}
                      </Button>
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
