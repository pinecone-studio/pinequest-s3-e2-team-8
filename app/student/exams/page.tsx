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

export default async function StudentExamsPage() {
  const exams = await getStudentExams();
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Шалгалтууд</h2>
        <p className="text-muted-foreground">
          Танд оноогдсон шалгалтуудын жагсаалт
        </p>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Одоогоор шалгалт байхгүй байна.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => {
            const startTime = new Date(exam.start_time);
            const endTime = new Date(exam.end_time);
            const isActive = now >= startTime && now <= endTime;
            const isUpcoming = now < startTime;
            const isExpired = now > endTime;

            return (
              <Card key={exam.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{exam.title}</CardTitle>
                    {isActive && (
                      <Badge className="bg-green-600">Идэвхтэй</Badge>
                    )}
                    {isUpcoming && <Badge variant="secondary">Удахгүй</Badge>}
                    {isExpired && (
                      <Badge variant="outline">Дууссан</Badge>
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

                  {isActive && (
                    <Link href={`/student/exams/${exam.id}/take`}>
                      <Button className="w-full">Шалгалт өгөх</Button>
                    </Link>
                  )}
                  {isUpcoming && (
                    <Button disabled variant="outline" className="w-full">
                      Эхлээгүй байна
                    </Button>
                  )}
                  {isExpired && (
                    <Link href={`/student/exams/${exam.id}/result`}>
                      <Button variant="outline" className="w-full">
                        Үр дүн харах
                      </Button>
                    </Link>
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
