import Link from "next/link";
import DashboardImage from "../_icons/DashboardImage";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEducatorStats } from "@/lib/dashboard/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function EducatorDashboard() {
  const stats = await getEducatorStats();

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#fff6e4] via-[#FFF7EE] to-[#ced8e6] p-8">
        <div className="relative z-10 max-w-2xl space-y-2">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Багшийн самбар
          </h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Шалгалт, асуулт, хуваарь, дүнгийн удирдлагаа нэг дороос хянаарай.
          </p>
        </div>

        <div className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-auto scale-125 origin-bottom-right md:block">
          <DashboardImage />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Нийт шалгалт</CardDescription>
            <CardTitle className="text-3xl">{stats.totalExams}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Үүсгэсэн</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Асуултын сан</CardDescription>
            <CardTitle className="text-3xl">{stats.totalQuestions}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Нийт асуулт</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Идэвхтэй шалгалт</CardDescription>
            <CardTitle className="text-3xl">{stats.activeExams}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Одоо явагдаж байгаа</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Дүн гаргаагүй</CardDescription>
            <CardTitle className="text-3xl">{stats.pendingGrading}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Шалгах хэрэгтэй</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Ойрын шалгалтууд</CardTitle>
              <CardDescription>
                Дараагийн 5 шалгалтын товч хуваарь
              </CardDescription>
            </div>
            <Link href="/educator/schedule">
              <Button variant="outline" size="sm">
                Хуваарь харах
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats.upcomingExams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ойрын хугацаанд харагдах шалгалт алга.
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
                      {exam.subject_name && (
                        <Badge variant="secondary">{exam.subject_name}</Badge>
                      )}
                      <Badge
                        variant={exam.is_published ? "outline" : "secondary"}
                      >
                        {exam.is_published ? "Нийтлэгдсэн" : "Ноорог"}
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
              <CardTitle className="text-lg">Одоо хийх зүйл</CardTitle>
              <CardDescription>Шалгах шаардлагатай дүнгүүд</CardDescription>
            </div>
            <Link href="/educator/grading">
              <Button variant="outline" size="sm">
                Дүн шалгах
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats.pendingItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Одоогоор хүлээгдэж буй шалгалтын дүн алга.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.pendingItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {item.student_label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.exam_title}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.submitted_at
                        ? formatDateTimeUB(item.submitted_at)
                        : "Хугацаа тодорхойгүй"}
                    </p>
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
