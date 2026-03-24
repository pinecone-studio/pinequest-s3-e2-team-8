import Link from "next/link";
import { getPendingSubmissions } from "@/lib/grading/actions";
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

export default async function GradingPage() {
  const submissions = await getPendingSubmissions();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Дүн шалгах</h2>
        <p className="text-muted-foreground">
          Шалгагдаагүй шалгалтын хариултууд
        </p>
      </div>

      {submissions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Шалгах хариулт байхгүй байна.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
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
              <Card key={sub.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {profile?.full_name || profile?.email || "Оюутан"}
                      </CardTitle>
                      <CardDescription>
                        {exam?.title ?? "Шалгалт"} | Илгээсэн:{" "}
                        {sub.submitted_at
                          ? formatDateTimeUB(sub.submitted_at)
                          : "—"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {pct !== null && (
                        <Badge variant="outline">
                          Авто: {pct}%
                        </Badge>
                      )}
                      <Link href={`/educator/grading/${sub.id}`}>
                        <Button size="sm">Шалгах</Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
