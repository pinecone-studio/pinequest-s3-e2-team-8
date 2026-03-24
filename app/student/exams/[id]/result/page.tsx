import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ExamResultPage({
  searchParams,
}: {
  searchParams: Promise<{ score?: string; max?: string; pct?: string }>;
}) {
  const { score, max, pct } = await searchParams;
  const totalScore = parseFloat(score ?? "0");
  const maxScore = parseFloat(max ?? "0");
  const percentage = parseInt(pct ?? "0");

  const passed = percentage >= 60;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Шалгалтын үр дүн</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div
            className={`mx-auto flex h-32 w-32 items-center justify-center rounded-full text-4xl font-bold ${
              passed
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {percentage}%
          </div>

          <div className="space-y-2">
            <p className="text-lg">
              Оноо: <span className="font-bold">{totalScore}</span> / {maxScore}
            </p>
            <p
              className={`text-lg font-semibold ${
                passed ? "text-green-600" : "text-red-600"
              }`}
            >
              {passed ? "Тэнцсэн" : "Тэнцээгүй"}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Нээлттэй хариулт (essay) асуултуудыг багш шалгасны дараа эцсийн
            оноо өөрчлөгдөж болно.
          </p>

          <div className="flex gap-2">
            <Link href="/student/exams" className="flex-1">
              <Button variant="outline" className="w-full">
                Шалгалтууд руу
              </Button>
            </Link>
            <Link href="/student" className="flex-1">
              <Button className="w-full">Хянах самбар</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
