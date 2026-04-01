import Link from "next/link";
import { getGradingStats, getPendingSubmissions } from "@/lib/grading/actions";
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
import StudentIdentity from "@/components/profile/StudentIdentity";

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub: string;
  color: "blue" | "orange" | "yellow";
}) {
  // These hex codes match the colored glow/shadow at the bottom of the cards
  const shadowColor: Record<typeof color, string> = {
    blue: "rgba(59, 130, 246, 0.5)", // Blue glow
    orange: "rgba(249, 115, 22, 0.5)", // Orange glow
    yellow: "rgba(234, 179, 8, 0.5)", // Yellow glow
  };

  return (
    <div
      className="relative flex h-[119px] w-auto flex-col justify-between rounded-[32px] bg-white px-5 py-4 transition-transform hover:scale-[1.02]"
      style={{
        // This creates the specific "bottom-only" colored shadow effect
        boxShadow: `0px 10px 20px -5px ${shadowColor[color]}`,
        border: "1px solid rgba(0,0,0,0.05)",
      }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-[16px] font-medium leading-tight text-gray-800">
          {label}
        </p>
        <p className="text-[24px] font-bold tracking-tight text-gray-900">
          {value}
        </p>
      </div>

      <p className="text-sm font-medium text-[#4CAF50]">{sub}</p>
    </div>
  );
}

export default async function GradingPage() {
  const submissions = await getPendingSubmissions();
  const gradingStats = await getGradingStats();
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Нийт сурагчдын тоо"
          value={gradingStats.toBeGraded}
          sub="Асуултын санд "
          color="blue"
        />
        <StatCard
          label="Явагдаж байгаа"
          value={gradingStats.ongoing}
          sub="Үүсгэсэн шалгалтууд"
          color="orange"
        />
        <StatCard
          label="Үнэлсэн"
          value={gradingStats.graded}
          sub="Хамрагдсан   "
          color="yellow"
        />
      </div>
      <div className="rounded-2xl bg-white p-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold text-[#111111]">
            Сурагчдын хариулт засах
          </h2>
          <div className="flex items-center gap-2 rounded-full border border-[#e6e6e6] bg-white p-1 text-sm">
            <button
              type="button"
              className="rounded-full bg-[#f3f6fb] px-4 py-1.5 text-[13px] font-medium text-[#111111]"
            >
              Бүгд
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-1.5 text-[13px] font-medium text-[#6b6b6b] hover:text-[#111111]"
            >
              Үнэлсэн
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-1.5 text-[13px] font-medium text-[#6b6b6b] hover:text-[#111111]"
            >
              Хүлээгдэж байгаа
            </button>
          </div>
        </div>

        {submissions.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Шалгах хариулт байхгүй байна.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-4 space-y-4">
            {submissions.map((sub) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const exam = (sub as any).exams;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const profile = (sub as any).profiles;
              const pct =
                sub.max_score && sub.max_score > 0
                  ? Math.round((sub.total_score / sub.max_score) * 100)
                  : null;

              return (
                <Card key={sub.id} className="border border-[#e6e6e6] shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <CardTitle className="text-[16px] font-semibold text-[#1f1f1f]">
                            <StudentIdentity
                              name={
                                profile?.full_name || profile?.email || "Оюутан"
                              }
                              email={profile?.email}
                              avatarUrl={profile?.avatar_url}
                              size="sm"
                            />
                          </CardTitle>
                          {pct !== null ? (
                            <Badge className="rounded-full bg-[#e6f4ea] px-3 py-1 text-[12px] font-medium text-[#1f7a3b]">
                              Оноо: {pct}/100
                            </Badge>
                          ) : null}
                        </div>
                        <CardDescription className="mt-2 text-[13px] text-[#6f6f6f]">
                          {exam?.title ?? "Шалгалт"} | Илгээсэн:{" "}
                          {sub.submitted_at
                            ? formatDateTimeUB(sub.submitted_at)
                            : "—"}
                        </CardDescription>
                      </div>
                      <Link href={`/educator/grading/${sub.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full px-4"
                        >
                          Засах
                        </Button>
                      </Link>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
