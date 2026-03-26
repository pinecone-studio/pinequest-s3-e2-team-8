import Link from "next/link";
import { getStudentExams } from "@/lib/student/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function StudentExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorParam } = await searchParams;
  const exams = await getStudentExams();
  const readyCount = exams.filter(
    (exam) =>
      exam.myLifecycleStatus === "available" ||
      exam.myLifecycleStatus === "retake_available" ||
      exam.myLifecycleStatus === "in_progress"
  ).length;
  const upcomingCount = exams.filter(
    (exam) =>
      exam.myLifecycleStatus === "scheduled" ||
      exam.myLifecycleStatus === "retake_scheduled"
  ).length;
  const finishedCount = exams.filter((exam) =>
    ["submitted", "graded", "absent", "excused", "timed_out"].includes(
      String(exam.myLifecycleStatus)
    )
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Шалгалтууд</h2>
        <p className="text-muted-foreground">
          Танд оноогдсон шалгалтуудын жагсаалт
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">Одоо өгөх боломжтой {readyCount}</Badge>
        <Badge variant="outline">Удахгүй {upcomingCount}</Badge>
        <Badge variant="outline">Дууссан {finishedCount}</Badge>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => {
            const lifecycle = String(exam.myLifecycleStatus ?? "");
            const isResultAvailable =
              lifecycle === "submitted" ||
              lifecycle === "graded" ||
              lifecycle === "timed_out";
            const isInProgress = lifecycle === "in_progress";
            const isAvailable =
              lifecycle === "available" || lifecycle === "retake_available";
            const isUpcoming =
              lifecycle === "scheduled" || lifecycle === "retake_scheduled";
            const isExcused = lifecycle === "excused";
            const isAbsent = lifecycle === "absent";
            const isTimedOut = lifecycle === "timed_out";

            return (
              <Card key={exam.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{exam.title}</CardTitle>
                    {isResultAvailable && (
                      <Badge variant="secondary">Өгсөн</Badge>
                    )}
                    {!isResultAvailable && isAvailable && (
                      <Badge variant="secondary">
                        {lifecycle === "retake_available"
                          ? "Нөхөн шалгалт"
                          : "Одоо эхэлнэ"}
                      </Badge>
                    )}
                    {!isResultAvailable && isUpcoming && (
                      <Badge variant="outline">
                        {lifecycle === "retake_scheduled" ? "Нөхөн товлогдсон" : "Удахгүй"}
                      </Badge>
                    )}
                    {isExcused && (
                      <Badge variant="outline">Чөлөөлөгдсөн</Badge>
                    )}
                    {isTimedOut && (
                      <Badge variant="outline">Хугацаа дууссан</Badge>
                    )}
                    {isAbsent && (
                      <Badge variant="outline">Өгөөгүй</Badge>
                    )}
                  </div>
                  {exam.description && (
                    <CardDescription>{exam.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Эхлэх:</span>
                      <span>{formatDateTimeUB(exam.start_time)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Дуусах:</span>
                      <span>{formatDateTimeUB(exam.end_time)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Хугацаа:</span>
                      <span>{exam.duration_minutes} минут</span>
                    </div>
                    {exam.passing_score && (
                      <div className="flex justify-between">
                        <span>Тэнцэх оноо:</span>
                        <span>{exam.passing_score}%</span>
                      </div>
                    )}
                  </div>

                  {/* Аль хэдийн өгсөн → үр дүн */}
                  {isResultAvailable && (
                    <Link href={`/student/exams/${exam.id}/result`}>
                      <Button variant="outline" className="w-full">
                        Үр дүн харах
                      </Button>
                    </Link>
                  )}

                  {/* Үргэлжлүүлэх (in_progress + цаг дуусаагүй) */}
                  {!isResultAvailable && isInProgress && (
                    <Link href={`/student/exams/${exam.id}/take`}>
                      <Button variant="outline" className="w-full">
                        Үргэлжлүүлэх
                      </Button>
                    </Link>
                  )}

                  {/* Шалгалт өгөх (active, session байхгүй) */}
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

                  {!isResultAvailable && !isInProgress && (isAbsent || isTimedOut) && (
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
