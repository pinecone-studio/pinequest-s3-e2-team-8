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
import DashboardImage from "../_icons/DashboardImage";

export default async function StudentDashboard() {
  const stats = await getStudentStats();

  return (
    <div className="relative space-y-6">
      {/* 1. The Background Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#ffffff] via-[#ffeac0] to-[#ffd474] px-8 py-6">
        <div className="relative z-0 max-w-2xl space-y-2">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Сурагчын самбар
          </h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Шалгалт, дүнгийн мэдээллээ нэг доороос хянаарай.
          </p>
        </div>
      </div>

      {/* 2. The Image Layer - Moved OUTSIDE the overflow-hidden div */}
      <div className="pointer-events-none absolute -bottom-0 right-0 z-[60] hidden h-full w-auto scale-105 origin-bottom-right md:block">
        <DashboardImage />
      </div>

      {/* 3. Bottom Content */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Хянах самбар</h2>
        <p className="text-muted-foreground">
          Таны шалгалтууд болон үр дүнгийн хураангуй
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Идэвхтэй шалгалт</CardDescription>
            <CardTitle className="text-3xl">{stats.activeExams}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Одоо өгөх боломжтой</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Өгсөн шалгалт</CardDescription>
            <CardTitle className="text-3xl">{stats.completedExams}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Нийт</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Дундаж оноо</CardDescription>
            <CardTitle className="text-3xl">
              {stats.avgScore !== null ? `${stats.avgScore}%` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Бүх шалгалтаар</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Дараагийн шалгалтууд</CardTitle>
              <CardDescription>
                Эхлэх цаг болон үргэлжлэх хугацааг шалгана уу
              </CardDescription>
            </div>
            <Link href="/student/schedule">
              <Button variant="outline" size="sm">
                Хуваарь харах
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats.upcomingExams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Одоогоор товлогдсон шалгалт алга.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.upcomingExams.map((exam) => (
                  <div
                    key={exam.id}
                    className="flex items-start justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{exam.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTimeUB(exam.start_time)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Badge variant="outline">
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

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Сүүлд шинэчлэгдсэн дүн</CardTitle>
              <CardDescription>Саяхан өгсөн шалгалтуудын төлөв</CardDescription>
            </div>
            <Link href="/student/results">
              <Button variant="outline" size="sm">
                Үр дүн харах
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats.recentResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Дүн гарсан шалгалт одоогоор алга.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.recentResults.map((result) => (
                  <div
                    key={`${result.id}-${result.submitted_at ?? "pending"}`}
                    className="flex items-start justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{result.exam_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {result.submitted_at
                          ? formatDateTimeUB(result.submitted_at)
                          : "Хугацаа тодорхойгүй"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {result.percentage !== null && (
                        <Badge variant="outline">{result.percentage}%</Badge>
                      )}
                      <Badge
                        variant={
                          result.status === "graded" ? "secondary" : "outline"
                        }
                      >
                        {result.status === "graded"
                          ? "Дүн баталгаажсан"
                          : "Шалгагдаж байна"}
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
