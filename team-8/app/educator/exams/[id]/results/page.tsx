import { notFound } from "next/navigation";
import Link from "next/link";
import { getExamResults } from "@/lib/exam/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Users, TrendingUp, CheckCircle, Clock } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ group?: string }>;
}

export default async function ExamResultsPage({ params, searchParams }: Props) {
  const { id: examId } = await params;
  const { group: groupFilter } = await searchParams;

  const data = await getExamResults(examId);
  if (!data) notFound();

  const { exam, sessions, stats, groups } = data;

  const filtered = groupFilter
    ? sessions.filter((s) => s.groups.some((g) => g.id === groupFilter))
    : sessions;

  const filteredStats = {
    total: filtered.length,
    passCount: filtered.filter((s) => s.passed).length,
    avgScore:
      filtered.length > 0
        ? Math.round(
            filtered.reduce((sum, s) => sum + s.percentage, 0) / filtered.length
          )
        : 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/educator/exams/${examId}/questions`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Шалгалт руу буцах
        </Link>
        <div className="mt-1">
          <h2 className="text-2xl font-bold tracking-tight">{exam.title}</h2>
          <p className="text-muted-foreground">
            {exam.subject?.name ?? "Хичээл тодорхойгүй"} · Тэнцэх оноо:{" "}
            {exam.passing_score}%
          </p>
        </div>
      </div>

      {/* Нийт статистик */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Нийт оролцогч
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Дундаж оноо
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.avgScore}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Тэнцсэн
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {stats.passCount}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                / {stats.total}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{stats.passRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Шалгаагүй
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.submitted}</p>
            <p className="text-xs text-muted-foreground">
              Баталгаажсан: {stats.graded}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Бүлгийн шүүлтүүр */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/educator/exams/${examId}/results`}>
            <Badge
              variant={!groupFilter ? "default" : "outline"}
              className="cursor-pointer"
            >
              Бүгд ({sessions.length})
            </Badge>
          </Link>
          {groups.map((g) => {
            const count = sessions.filter((s) =>
              s.groups.some((sg) => sg.id === g.id)
            ).length;
            return (
              <Link
                key={g.id}
                href={`/educator/exams/${examId}/results?group=${g.id}`}
              >
                <Badge
                  variant={groupFilter === g.id ? "default" : "outline"}
                  className="cursor-pointer"
                >
                  {g.name} ({count})
                </Badge>
              </Link>
            );
          })}
        </div>
      )}

      {/* Шүүгдсэн статистик */}
      {groupFilter && filtered.length > 0 && (
        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
          Шүүгдсэн:{" "}
          <span className="font-medium">{filtered.length} сурагч</span> ·
          Дундаж:{" "}
          <span className="font-medium">{filteredStats.avgScore}%</span> ·
          Тэнцсэн:{" "}
          <span className="font-medium">
            {filteredStats.passCount}/{filteredStats.total}
          </span>
        </div>
      )}

      {/* Сурагчдын хүснэгт */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Оролцогч байхгүй байна.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Сурагч</th>
                  <th className="px-4 py-3 text-left font-medium">Бүлэг</th>
                  <th className="px-4 py-3 text-right font-medium">Оноо</th>
                  <th className="px-4 py-3 text-right font-medium">Хувь</th>
                  <th className="px-4 py-3 text-center font-medium">Дүн</th>
                  <th className="px-4 py-3 text-center font-medium">Төлөв</th>
                  <th className="px-4 py-3 text-right font-medium">Үйлдэл</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.session_id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.student_name}</p>
                      <p className="text-xs text-muted-foreground">{s.student_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.groups.length > 0
                          ? s.groups.map((g) => (
                              <Badge key={g.id} variant="outline" className="text-xs">
                                {g.name}
                              </Badge>
                            ))
                          : <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {s.total_score} / {s.max_score}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {s.percentage}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={s.passed ? "default" : "destructive"}>
                        {s.passed ? "Тэнцсэн" : "Тэнцээгүй"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.status === "graded" ? (
                        <Badge variant="outline" className="text-green-600">Баталгаажсан</Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-500">Шалгаагүй</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/educator/grading/${s.session_id}`}
                        className="text-primary hover:underline"
                      >
                        Харах
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
