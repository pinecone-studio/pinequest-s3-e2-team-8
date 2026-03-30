import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStudentStats } from "@/lib/dashboard/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarX, FileText } from "lucide-react";

export default async function StudentDashboard() {
  const stats = await getStudentStats();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          Хянах самбар
        </h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          Таны шалгалтууд болон үр дүнгийн хураангуй
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <Card className="ring-zinc-200/70">
          <CardHeader className="pb-2">
            <CardDescription>Идэвхтэй шалгалт</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl">
              {stats.activeExams}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Одоо өгөх боломжтой</p>
          </CardContent>
        </Card>
        <Card className="ring-zinc-200/70">
          <CardHeader className="pb-2">
            <CardDescription>Өгсөн шалгалт</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl">
              {stats.completedExams}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Нийт</p>
          </CardContent>
        </Card>
        <Card className="ring-zinc-200/70">
          <CardHeader className="pb-2">
            <CardDescription>Дундаж оноо</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl">
              {stats.avgScore !== null ? `${stats.avgScore}%` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Бүх шалгалтаар</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Learning Summary</CardTitle>
            <CardDescription>
              Сайжруулах шаардлагатай хичээл, сэдвүүдийн товч тойм
            </CardDescription>
          </div>
          <Link href="/student/learning">
            <Button variant="outline" size="sm">
              Learning Hub
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {stats.learningSummary.weakSubjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Одоогоор mastery profile үүсгэх data хангалтгүй байна.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Сайжруулах хичээлүүд</p>
                {stats.learningSummary.weakSubjects.map((subject) => (
                  <div
                    key={subject.subject_id}
                    className="rounded-xl border p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{subject.subject_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {subject.weak_topic_count > 0
                            ? `${subject.weak_topic_count} weak topic`
                            : "Topic breakdown pending"}
                        </p>
                      </div>
                      <Badge variant={subject.mastery_score < 60 ? "secondary" : "outline"}>
                        {Math.round(subject.mastery_score)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Хамгийн сул сэдвүүд</p>
                {stats.learningSummary.weakTopics.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Topic-level data хараахан бүрэн бэлэн болоогүй байна.
                  </div>
                ) : (
                  stats.learningSummary.weakTopics.map((topic) => (
                    <div
                      key={`${topic.subject_id}:${topic.topic_key}`}
                      className="rounded-xl border p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{topic.topic_label}</p>
                          <p className="text-xs text-muted-foreground">{topic.subject_name}</p>
                        </div>
                        <Badge variant={topic.mastery_score < 60 ? "secondary" : "outline"}>
                          {Math.round(topic.mastery_score)}%
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="ring-zinc-200/70">
          <CardHeader className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <CardTitle className="text-base sm:text-lg">
                Дараагийн шалгалтууд
              </CardTitle>
              <CardDescription>
                Эхлэх цаг болон үргэлжлэх хугацааг шалгана уу
              </CardDescription>
            </div>
            <Link href="/student/schedule">
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                Хуваарь харах
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats.upcomingExams.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-200/70 bg-muted/30 p-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <CalendarX className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">
                  Одоогоор товлогдсон шалгалт алга.
                </p>
                <p className="text-xs text-muted-foreground">
                  Шалгалтын хуваарь нэмэгдмэгц энд харагдана.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.upcomingExams.map((exam) => (
                  <div
                    key={exam.id}
                    className="flex flex-col items-start justify-between gap-3 rounded-lg border border-zinc-200/70 bg-white/70 p-3 sm:flex-row sm:items-start sm:bg-transparent"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="line-clamp-2 text-sm font-medium">
                        {exam.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTimeUB(exam.start_time)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                      <Badge
                        variant="outline"
                        className="border-zinc-200/80 bg-white/90 text-[11px] text-zinc-700 shadow-sm sm:bg-transparent sm:text-xs sm:shadow-none"
                      >
                        {exam.duration_minutes} мин
                      </Badge>
                      <Badge
                        variant={
                          exam.lifecycle_status === "available" ||
                          exam.lifecycle_status === "retake_available" ||
                          exam.lifecycle_status === "in_progress"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-[11px] shadow-sm sm:text-xs sm:shadow-none"
                      >
                        {exam.lifecycle_label}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="ring-zinc-200/70">
          <CardHeader className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <CardTitle className="text-base sm:text-lg">
                Сүүлд шинэчлэгдсэн дүн
              </CardTitle>
              <CardDescription>
                Саяхан өгсөн шалгалтуудын төлөв
              </CardDescription>
            </div>
            <Link href="/student/results">
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                Үр дүн харах
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats.recentResults.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-200/70 bg-muted/30 p-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">
                  Дүн гарсан шалгалт одоогоор алга.
                </p>
                <p className="text-xs text-muted-foreground">
                  Шалгалтын дүн баталгаажмагц энд харагдана.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentResults.map((result) => (
                  <div
                    key={`${result.id}-${result.submitted_at ?? "pending"}`}
                    className="flex flex-col items-start justify-between gap-3 rounded-lg border border-zinc-200/70 bg-white/70 p-3 sm:flex-row sm:items-start sm:bg-transparent"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="line-clamp-2 text-sm font-medium">
                        {result.exam_title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {result.submitted_at
                          ? formatDateTimeUB(result.submitted_at)
                          : "Хугацаа тодорхойгүй"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                      {result.percentage !== null && (
                        <Badge
                          variant="outline"
                          className="border-zinc-200/80 bg-white/90 text-[11px] text-zinc-700 shadow-sm sm:bg-transparent sm:text-xs sm:shadow-none"
                        >
                          {result.percentage}%
                        </Badge>
                      )}
                      <Badge
                        variant={result.status === "graded" ? "secondary" : "outline"}
                        className="text-[11px] shadow-sm sm:text-xs sm:shadow-none"
                      >
                        {result.status === "graded" ? "Дүн баталгаажсан" : "Шалгагдаж байна"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
