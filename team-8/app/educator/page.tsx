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
        {/* 1. Removed overflow-hidden so the image can spill out */}
        <div className="relative h-87.75 rounded-3xl bg-gradient-to-r from-[#fff6e4] via-[#FFF7EE] to-[#ced8e6] p-11">
          <div className="relative z-10 max-w-2xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Тавтай морилно уу, Лосолмаа
            </h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Ready to start your Journey.
            </p>
          </div>

          {/* 2. Adjusted positioning to bottom-0 for a cleaner scale anchor */}
          <div className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-auto md:block scale-125 origin-bottom-right z-20">
            <DashboardImage />
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-4">
          <Card className="relative overflow-hidden border-0 rounded-[32px] bg-[#4F9DF7] text-white shadow-lg p-8 h-full">
            {/* Background Decorative Blobs */}
            {/* Curve: Top-Left */}
            <div className="absolute top-[-30%] left-[-20%] w-[40%] h-[80%] bg-[#2F6BD7] rounded-[60%] opacity-50" />

            {/* Curve: Bottom-Right */}
            <div className="absolute bottom-[-30%] right-[-20%] w-[60%] h-[70%] bg-[#2F6BD7] rounded-[40%] opacity-50" />

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
          <Card className="relative h-full overflow-hidden rounded-[32px] border-0 bg-[#FFA34B] p-8 text-white shadow-lg">
            <div className="absolute left-[-20%] top-[-30%] h-[80%] w-[40%] rounded-[60%] bg-[#FF7D26] opacity-50" />
            <div className="absolute bottom-[-30%] right-[-20%] h-[70%] w-[60%] rounded-[40%] bg-[#FF7D26] opacity-50" />
            <div className="absolute inset-0 rounded-full bg-white/10 blur-3xl opacity-30" />

            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold tracking-tight">
                  {stats.totalQuestions}
                </h3>
                <p className="text-sm font-medium text-white/80">
                  Асуултын сан
                </p>
                <p className="text-xs text-white/70">35 lessons</p>
              </div>

              <div className="mt-8 flex items-center gap-4">
                <div className="relative h-20 w-20">
                  <svg
                    viewBox="0 0 36 36"
                    className="h-20 w-20 -rotate-90 overflow-visible"
                  >
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-white/20"
                      strokeWidth="3.5"
                    />
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
                <p className="text-xs font-medium text-white/80">Нийт асуулт</p>
              </div>
            </div>
          </Card>
          <Card className="relative h-full overflow-hidden rounded-[32px] border-0 bg-[#8BD448] p-8 text-white shadow-lg">
            <div className="absolute left-[-20%] top-[-30%] h-[80%] w-[40%] rounded-[60%] bg-[#6CC04A] opacity-50" />
            <div className="absolute bottom-[-30%] right-[-20%] h-[70%] w-[60%] rounded-[40%] bg-[#6CC04A] opacity-50" />
            <div className="absolute inset-0 rounded-full bg-white/10 blur-3xl opacity-30" />

            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold tracking-tight">
                  {stats.activeExams}
                </h3>
                <p className="text-sm font-medium text-white/80">
                  Идэвхтэй шалгалт
                </p>
                <p className="text-xs text-white/70">35 lessons</p>
              </div>

              <div className="mt-8 flex items-center gap-4">
                <div className="relative h-20 w-20">
                  <svg
                    viewBox="0 0 36 36"
                    className="h-20 w-20 -rotate-90 overflow-visible"
                  >
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-white/20"
                      strokeWidth="3.5"
                    />
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
                <p className="text-xs font-medium text-white/80">
                  Одоо явагдаж байгаа
                </p>
              </div>
            </div>
          </Card>
          <Card className="relative h-full overflow-hidden rounded-[32px] border-0 bg-[#FFD255] p-8 text-white shadow-lg">
            <div className="absolute left-[-20%] top-[-30%] h-[80%] w-[40%] rounded-[60%] bg-[#FFC129] opacity-50" />
            <div className="absolute bottom-[-30%] right-[-20%] h-[70%] w-[60%] rounded-[40%] bg-[#FFC129] opacity-50" />
            <div className="absolute inset-0 rounded-full bg-white/10 blur-3xl opacity-30" />

            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold tracking-tight">
                  {stats.pendingGrading}
                </h3>
                <p className="text-sm font-medium text-white/80">
                  Дүн гаргаагүй
                </p>
                <p className="text-xs text-white/70">35 lessons</p>
              </div>

              <div className="mt-8 flex items-center gap-4">
                <div className="relative h-20 w-20">
                  <svg
                    viewBox="0 0 36 36"
                    className="h-20 w-20 -rotate-90 overflow-visible"
                  >
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-white/20"
                      strokeWidth="3.5"
                    />
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
                <p className="text-xs font-medium text-white/80">
                  Шалгах хэрэгтэй
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
