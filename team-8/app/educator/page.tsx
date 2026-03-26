import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEducatorStats } from "@/lib/dashboard/actions";
import DashboardImage from "../_icons/DashboardImage";

export default async function EducatorDashboard() {
  const stats = await getEducatorStats();

  return (
    <div className="flex flex-col  mt-13.75">
      <div className="flex flex-col gap-5.25">
        <div className="relative overflow-hidden h-87.75 rounded-3xl  bg-gradient-to-r from-[#fff6e4] via-[#FFF7EE] to-[#ced8e6] p-8">
          <div className="relative z-10 max-w-2xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Тавтай морилно уу, Лосолмаа
            </h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Ready to start your Journey.
            </p>
          </div>
          <div className="pointer-events-none absolute bottom-6 right-[10px] hidden h-full w-auto md:block">
            <DashboardImage />
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-4">
          <Card className="relative overflow-hidden border-0 rounded-[32px] bg-[#4F9DF7] text-white shadow-lg p-8 h-full">
            {/* Background Decorative Blobs */}
            {/* Curve: Top-Left */}
            <div className="absolute top-[-30%] left-[-20%] w-[120%] h-[80%] bg-[#2F6BD7] rounded-[50%] opacity-60" />

            {/* Curve: Bottom-Right */}
            <div className="absolute bottom-[-30%] right-[-20%] w-[100%] h-[70%] bg-[#2F6BD7] rounded-[40%] opacity-70" />

            {/* White Overlay to soften the center (creates the depth) */}
            <div className="absolute inset-0 bg-white/10 rounded-full blur-3xl opacity-30" />

            {/* Content Layer (Relative to stay above blobs) */}
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold tracking-tight">
                  Нийт асуултууд
                </h3>
                <p className="text-sm text-white/80 font-medium">
                  Асуултын сан
                </p>
              </div>

              <div className="mt-8 flex items-center gap-4">
                <div className="relative h-20 w-20">
                  <svg
                    viewBox="0 0 36 36"
                    className="h-20 w-20 -rotate-90 overflow-visible"
                  >
                    {/* Track */}
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-white/20"
                      strokeWidth="3.5"
                    />
                    {/* Progress */}
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-white"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray="75, 100"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
                    75%
                  </span>
                </div>
              </div>
            </div>
          </Card>
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#FFA34B] to-[#FF7D26] text-white shadow-lg">
            <CardHeader className="pb-2">
              <CardDescription className="text-white/80">
                Асуултын сан
              </CardDescription>
              <CardTitle className="text-2xl">{stats.totalQuestions}</CardTitle>
              <p className="text-xs text-white/70">35 lessons</p>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10">
                  <svg viewBox="0 0 36 36" className="h-10 w-10">
                    <path
                      className="stroke-white/30"
                      strokeWidth="4"
                      fill="none"
                      d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
                    />
                    <path
                      className="stroke-white"
                      strokeWidth="4"
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray="75, 100"
                      d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
                    75%
                  </span>
                </div>
                <p className="text-xs text-white/80">Нийт асуулт</p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#8BD448] to-[#6CC04A] text-white shadow-lg">
            <CardHeader className="pb-2">
              <CardDescription className="text-white/80">
                Идэвхтэй шалгалт
              </CardDescription>
              <CardTitle className="text-2xl">{stats.activeExams}</CardTitle>
              <p className="text-xs text-white/70">35 lessons</p>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10">
                  <svg viewBox="0 0 36 36" className="h-10 w-10">
                    <path
                      className="stroke-white/30"
                      strokeWidth="4"
                      fill="none"
                      d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
                    />
                    <path
                      className="stroke-white"
                      strokeWidth="4"
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray="75, 100"
                      d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
                    75%
                  </span>
                </div>
                <p className="text-xs text-white/80">Одоо явагдаж байгаа</p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#FFD255] to-[#FFC129] text-white shadow-lg">
            <CardHeader className="pb-2">
              <CardDescription className="text-white/80">
                Дүн гаргаагүй
              </CardDescription>
              <CardTitle className="text-2xl">{stats.pendingGrading}</CardTitle>
              <p className="text-xs text-white/70">35 lessons</p>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10">
                  <svg viewBox="0 0 36 36" className="h-10 w-10">
                    <path
                      className="stroke-white/30"
                      strokeWidth="4"
                      fill="none"
                      d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
                    />
                    <path
                      className="stroke-white"
                      strokeWidth="4"
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray="75, 100"
                      d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
                    75%
                  </span>
                </div>
                <p className="text-xs text-white/80">Шалгах хэрэгтэй</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
