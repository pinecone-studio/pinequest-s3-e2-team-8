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
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#FFD372] via-[#FFF7EE] to-[#ced8e6] px-8 py-4">
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
        <Card className="relative overflow-hidden rounded-2xl bg-[#4F9DF7] text-white shadow-lg p-4 h-full">
          {/* Background Decorative Blobs */}

          {/* Curve: Top-Left */}

          <div className="absolute top-[-30%] left-[-20%] w-[60%] h-[80%] bg-[#2F6BD7] rounded-[50%] opacity-60" />

          {/* Curve: Bottom-Right */}

          <div className="absolute bottom-[-30%] right-[-20%] w-[50%] h-[70%] bg-[#2F6BD7] rounded-[40%] opacity-70" />

          {/* White Overlay to soften the center (creates the depth) */}

          <div className="absolute inset-0 bg-white/10 rounded-full blur-3xl opacity-30" />

          {/* Content Layer (Relative to stay above blobs) */}

          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-bold tracking-tight">Асуултын сан</h3>

              <p className="text-3xl font-semibold">{stats.totalExams}</p>
            </div>
            <p className="text-xs ">Үүсгэсэн</p>
          </div>
        </Card>
        <Card className="relative overflow-hidden rounded-2xl bg-[#FF993A] text-white shadow-lg p-4 h-full">
          {/* Background Decorative Blobs */}

          {/* Curve: Top-Left */}

          <div className="absolute top-[-30%] left-[-20%] w-[60%] h-[80%] bg-[#FF7E07] rounded-[50%] opacity-60" />

          {/* Curve: Bottom-Right */}

          <div className="absolute bottom-[-30%] right-[-20%] w-[50%] h-[70%] bg-[#FF7E07] rounded-[40%] opacity-70" />

          {/* White Overlay to soften the center (creates the depth) */}

          <div className="absolute inset-0 bg-white/10 rounded-full blur-3xl opacity-30" />

          {/* Content Layer (Relative to stay above blobs) */}

          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-bold tracking-tight">Асуултын сан</h3>

              <p className="text-3xl font-semibold">{stats.totalQuestions}</p>
            </div>
            <p className="text-xs ">Нийт асуулт</p>
          </div>
        </Card>
        <Card className="relative overflow-hidden rounded-2xl bg-[#FFD143] text-white shadow-lg p-4 h-full">
          {/* Background Decorative Blobs */}

          {/* Curve: Top-Left */}

          <div className="absolute top-[-30%] left-[-20%] w-[60%] h-[80%] bg-[#FFC000] rounded-[50%] opacity-60" />

          {/* Curve: Bottom-Right */}

          <div className="absolute bottom-[-30%] right-[-20%] w-[50%] h-[70%]  bg-[#FFC000] rounded-[40%] opacity-70" />

          {/* White Overlay to soften the center (creates the depth) */}

          <div className="absolute inset-0 bg-white/10 rounded-full blur-3xl opacity-30" />

          {/* Content Layer (Relative to stay above blobs) */}

          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-bold tracking-tight">
                Идэвхтэй шалгалт
              </h3>

              <p className="text-3xl font-semibold">{stats.pendingGrading}</p>
            </div>
            <p className="text-xs ">Шалгах хэрэгтэй</p>
          </div>
        </Card>
        <Card className="relative overflow-hidden rounded-2xl bg-[#8AC53E] text-white shadow-lg p-4 h-full">
          {/* Background Decorative Blobs */}

          {/* Curve: Top-Left */}

          <div className="absolute top-[-30%] left-[-20%] w-[60%] h-[80%] bg-[#006838] rounded-[50%] opacity-60" />

          {/* Curve: Bottom-Right */}

          <div className="absolute bottom-[-30%] right-[-20%] w-[50%] h-[70%] bg-[#006838] rounded-[40%] opacity-70" />

          {/* White Overlay to soften the center (creates the depth) */}

          <div className="absolute inset-0 bg-white/10 rounded-full blur-3xl opacity-30" />

          {/* Content Layer (Relative to stay above blobs) */}

          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-bold tracking-tight">Асуултын сан</h3>

              <p className="text-3xl font-semibold">{stats.totalQuestions}</p>
            </div>
            <p className="text-xs ">Нийт асуулт</p>
          </div>
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
