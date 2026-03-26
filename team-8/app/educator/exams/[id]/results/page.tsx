import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, TrendingUp, UserCheck, UserX, Users } from "lucide-react";
import { getExamResults } from "@/lib/exam/actions";
import {
  clearRecipientRetake,
  grantRecipientRetake,
  setRecipientExcused,
} from "@/lib/exam-recipient-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeUB } from "@/lib/utils/date";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ group?: string }>;
}

type ResultRow = {
  session_id: string | null;
  student_id: string;
  student_name: string;
  student_email: string;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  status: string;
  status_label: string;
  submitted_at: string | null;
  passed: boolean;
  groups: Array<{ id: string; name: string }>;
  has_retake_override: boolean;
  status_note: string | null;
};

function buildStats(rows: ResultRow[]) {
  const attemptedRows = rows.filter((row) =>
    ["submitted", "graded", "timed_out"].includes(row.status)
  );
  const passCount = attemptedRows.filter((row) => row.passed).length;

  return {
    total: rows.length,
    attempted: attemptedRows.length,
    submitted: rows.filter((row) => row.status === "submitted").length,
    graded: rows.filter((row) => row.status === "graded").length,
    absent: rows.filter((row) => row.status === "absent").length,
    timedOut: rows.filter((row) => row.status === "timed_out").length,
    excused: rows.filter((row) => row.status === "excused").length,
    avgScore:
      attemptedRows.length > 0
        ? Math.round(
            attemptedRows.reduce(
              (sum, row) => sum + Number(row.percentage ?? 0),
              0
            ) / attemptedRows.length
          )
        : 0,
    passCount,
    passRate:
      attemptedRows.length > 0
        ? Math.round((passCount / attemptedRows.length) * 100)
        : 0,
  };
}

function getStatusBadge(status: string, label: string) {
  switch (status) {
    case "graded":
      return <Badge variant="secondary">{label}</Badge>;
    case "submitted":
      return <Badge variant="outline">Шалгагдаж байна</Badge>;
    case "in_progress":
      return <Badge variant="secondary">Өгөөд эхэлсэн</Badge>;
    case "retake_available":
    case "retake_scheduled":
      return <Badge variant="secondary">{label}</Badge>;
    case "excused":
      return <Badge variant="outline">Чөлөөлөгдсөн</Badge>;
    case "timed_out":
      return <Badge variant="outline">Хугацаа дууссан</Badge>;
    case "absent":
      return <Badge variant="outline">Өгөөгүй</Badge>;
    default:
      return <Badge variant="outline">{label}</Badge>;
  }
}

function getScoreText(value: number | null, maxValue: number | null) {
  if (value === null || maxValue === null) return "—";
  return `${value} / ${maxValue}`;
}

export default async function ExamResultsPage({ params, searchParams }: Props) {
  const { id: examId } = await params;
  const { group: groupFilter } = await searchParams;

  const data = await getExamResults(examId);
  if (!data) notFound();

  const { exam, sessions, stats, groups } = data;

  const filtered = groupFilter
    ? sessions.filter((session) =>
        session.groups.some((group) => group.id === groupFilter)
      )
    : sessions;
  const displayStats = groupFilter ? buildStats(filtered) : stats;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/educator/exams"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Шалгалтын жагсаалт руу буцах
        </Link>
        <div className="mt-1">
          <h2 className="text-2xl font-bold tracking-tight">{exam.title}</h2>
          <p className="text-muted-foreground">
            {exam.subject?.name ?? "Хичээл тодорхойгүй"} · Тэнцэх оноо:{" "}
            {exam.passing_score}%
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" /> Нийт оролцогч
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{displayStats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" /> Оролдсон
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{displayStats.attempted}</p>
            <p className="text-xs text-muted-foreground">
              Шалгагдаж буй: {displayStats.submitted} · Баталгаажсан:{" "}
              {displayStats.graded}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Дундаж оноо
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{displayStats.avgScore}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CheckCircle className="h-4 w-4" /> Тэнцсэн
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {displayStats.passCount}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                / {displayStats.attempted}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {displayStats.passRate}% тэнцсэн
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserX className="h-4 w-4" /> Өгөөгүй
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{displayStats.absent}</p>
            {displayStats.timedOut > 0 && (
              <p className="text-xs text-muted-foreground">
                Хугацаа дууссан: {displayStats.timedOut}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserCheck className="h-4 w-4" /> Чөлөөлсөн
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{displayStats.excused}</p>
          </CardContent>
        </Card>
      </div>

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
          {groups.map((group) => {
            const count = sessions.filter((session) =>
              session.groups.some((studentGroup) => studentGroup.id === group.id)
            ).length;

            return (
              <Link
                key={group.id}
                href={`/educator/exams/${examId}/results?group=${group.id}`}
              >
                <Badge
                  variant={groupFilter === group.id ? "default" : "outline"}
                  className="cursor-pointer"
                >
                  {group.name} ({count})
                </Badge>
              </Link>
            );
          })}
        </div>
      )}

      {groupFilter && (
        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
          Шүүж харж буй бүлэг дээр {displayStats.total} сурагч байна.
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Оролцогч байхгүй байна.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
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
                {filtered.map((session) => (
                  <tr
                    key={session.student_id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{session.student_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.student_email}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {session.groups.length > 0 ? (
                          session.groups.map((group) => (
                            <Badge
                              key={group.id}
                              variant="outline"
                              className="text-xs"
                            >
                              {group.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {getScoreText(session.total_score, session.max_score)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {session.percentage === null ? "—" : `${session.percentage}%`}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {session.percentage === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant={session.passed ? "secondary" : "outline"}>
                          {session.passed ? "Тэнцсэн" : "Тэнцээгүй"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {getStatusBadge(session.status, session.status_label)}
                        {session.has_retake_override && (
                          <Badge variant="outline" className="text-xs">
                            Нөхөн эрхтэй
                          </Badge>
                        )}
                        {session.status_note && (
                          <p className="max-w-[180px] text-center text-xs text-muted-foreground">
                            {session.status_note}
                          </p>
                        )}
                        {session.submitted_at && (
                          <p className="text-xs text-muted-foreground">
                            {formatDateTimeUB(session.submitted_at)}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-2">
                        {session.session_id && (
                          <Link
                            href={`/educator/grading/${session.session_id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            Оролдлогыг харах
                          </Link>
                        )}

                        <div className="flex flex-wrap justify-end gap-2">
                          {session.status === "excused" ? (
                            <form
                              action={async () => {
                                "use server";
                                await setRecipientExcused(
                                  examId,
                                  session.student_id,
                                  false
                                );
                              }}
                            >
                              <Button type="submit" variant="outline" size="sm">
                                Чөлөөлөлт цуцлах
                              </Button>
                            </form>
                          ) : (
                            <form
                              action={async () => {
                                "use server";
                                await setRecipientExcused(
                                  examId,
                                  session.student_id,
                                  true
                                );
                              }}
                            >
                              <Button type="submit" variant="outline" size="sm">
                                Чөлөөлөх
                              </Button>
                            </form>
                          )}

                          {session.has_retake_override ? (
                            <form
                              action={async () => {
                                "use server";
                                await clearRecipientRetake(
                                  examId,
                                  session.student_id
                                );
                              }}
                            >
                              <Button type="submit" variant="outline" size="sm">
                                Нөхөн эрх цуцлах
                              </Button>
                            </form>
                          ) : session.status !== "in_progress" ? (
                            <form
                              action={async () => {
                                "use server";
                                await grantRecipientRetake(
                                  examId,
                                  session.student_id
                                );
                              }}
                            >
                              <Button type="submit" variant="outline" size="sm">
                                Нөхөн эрх олгох
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      </div>
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
