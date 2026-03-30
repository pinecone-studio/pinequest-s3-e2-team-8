import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  Clock,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { getExamResults } from "@/lib/exam/actions";
import {
  clearRecipientRetake,
  grantRecipientRetake,
  setRecipientExcused,
} from "@/lib/exam-recipient-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StudentIdentity from "@/components/profile/StudentIdentity";
import { formatDateTimeUB } from "@/lib/utils/date";
import ResultsInsightsPanel from "./_features/ResultsInsightsPanel";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ group?: string }>;
}

type ResultRow = {
  session_id: string | null;
  student_id: string;
  student_name: string;
  student_email: string;
  student_avatar_url: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  status: string;
  status_label: string;
  submitted_at: string | null;
  passed: boolean;
  groups: Array<{ id: string; name: string }>;
  has_retake_override: boolean;
  has_remaining_attempts: boolean;
  status_note: string | null;
};

type ResultQuestion = {
  id: string;
  content: string;
  points: number;
  order_index: number;
  type: string;
};

type ResultAnswer = {
  session_id: string;
  question_id: string;
  answer: string | null;
  score: number | null;
  is_correct: boolean | null;
};

const dropdownActionButtonClassName =
  "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-zinc-700 transition-colors hover:bg-accent hover:text-accent-foreground";

function buildStats(rows: ResultRow[]) {
  const attemptedRows = rows.filter((row) => row.percentage !== null);
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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getQuestionPreview(content: string, questionNumber: number) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return `Асуулт ${questionNumber}`;

  return normalized.length > 78
    ? `${normalized.slice(0, 78).trim()}…`
    : normalized;
}

function hasMeaningfulAnswer(rawValue: string | null) {
  const value = String(rawValue ?? "").trim();
  if (!value || value === "[]" || value === "{}") return false;

  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.some((item) => String(item ?? "").trim());
    }

    if (parsed && typeof parsed === "object") {
      return Object.values(parsed as Record<string, unknown>).some((item) =>
        String(item ?? "").trim()
      );
    }
  } catch {
    return true;
  }

  return true;
}

function getAnswerScore(answer: ResultAnswer | undefined, questionPoints: number) {
  if (!answer) return 0;
  if (answer.score !== null) return Math.max(0, Number(answer.score));
  if (answer.is_correct === true) return questionPoints;
  return 0;
}

function buildResultsInsights(
  rows: ResultRow[],
  questions: ResultQuestion[],
  answers: ResultAnswer[],
  passingScore: number
) {
  const attemptedRows = rows.filter(
    (row): row is ResultRow & { session_id: string; percentage: number } =>
      row.percentage !== null && Boolean(row.session_id)
  );
  const attemptedSessionIds = attemptedRows.map((row) => row.session_id);
  const attemptedSessionIdSet = new Set(attemptedSessionIds);
  const averageScore =
    attemptedRows.length > 0
      ? clampPercent(
          attemptedRows.reduce(
            (sum, row) => sum + Number(row.percentage ?? 0),
            0
          ) / attemptedRows.length
        )
      : 0;
  const participationRate =
    rows.length > 0
      ? clampPercent((attemptedRows.length / rows.length) * 100)
      : 0;
  const passCount = attemptedRows.filter((row) => row.passed).length;
  const passRate =
    attemptedRows.length > 0
      ? clampPercent((passCount / attemptedRows.length) * 100)
      : 0;
  const excellenceCount = attemptedRows.filter(
    (row) => Number(row.percentage ?? 0) >= 90
  ).length;
  const excellenceRate =
    attemptedRows.length > 0
      ? clampPercent((excellenceCount / attemptedRows.length) * 100)
      : 0;

  const metrics = [
    {
      key: "participation",
      label: "Оролцоо",
      value: participationRate,
      suffix: "%",
      description: `${attemptedRows.length} сурагчийн дүн бүртгэгдсэн`,
      tone: "sky" as const,
    },
    {
      key: "average",
      label: "Дундаж",
      value: averageScore,
      suffix: "%",
      description: `Тэнцэх босго ${passingScore}%`,
      tone: "amber" as const,
    },
    {
      key: "success",
      label: "Амжилт",
      value: passRate,
      suffix: "%",
      description: `${passCount} сурагч тэнцсэн`,
      tone: "emerald" as const,
    },
    {
      key: "excellent",
      label: "90%+",
      value: excellenceRate,
      suffix: "%",
      description: `${excellenceCount} сурагч өндөр амжилттай`,
      tone: "violet" as const,
    },
  ];

  const scoreBands = [
    { label: "0-39%", min: 0, max: 39 },
    { label: "40-59%", min: 40, max: 59 },
    { label: "60-79%", min: 60, max: 79 },
    { label: "80-100%", min: 80, max: 100 },
  ];

  const scoreDistribution = scoreBands.map((band) => {
    const count = attemptedRows.filter((row) => {
      const percentage = Number(row.percentage ?? 0);
      return percentage >= band.min && percentage <= band.max;
    }).length;

    return {
      label: band.label,
      count,
      percentage:
        attemptedRows.length > 0
          ? clampPercent((count / attemptedRows.length) * 100)
          : 0,
    };
  });

  const answersBySession = new Map<string, Map<string, ResultAnswer>>();
  for (const answer of answers) {
    if (!attemptedSessionIdSet.has(answer.session_id)) continue;

    const sessionAnswers =
      answersBySession.get(answer.session_id) ?? new Map<string, ResultAnswer>();
    sessionAnswers.set(answer.question_id, answer);
    answersBySession.set(answer.session_id, sessionAnswers);
  }

  const rankedQuestions = [...questions]
    .sort((left, right) => left.order_index - right.order_index)
    .map((question, index) => {
      const questionPoints = Math.max(Number(question.points ?? 0), 0);
      let perfectCount = 0;
      let unansweredCount = 0;
      let totalScore = 0;
      let totalRatio = 0;

      for (const sessionId of attemptedSessionIds) {
        const answer = answersBySession.get(sessionId)?.get(question.id);
        if (!hasMeaningfulAnswer(answer?.answer ?? null)) {
          unansweredCount += 1;
        }

        const score = getAnswerScore(answer, questionPoints);
        const ratio =
          questionPoints > 0
            ? Math.max(0, Math.min(score / questionPoints, 1))
            : score > 0
              ? 1
              : 0;

        totalScore += score;
        totalRatio += ratio;

        if (ratio >= 0.999) {
          perfectCount += 1;
        }
      }

      const attempts = attemptedSessionIds.length;
      const masteryRate =
        attempts > 0 ? clampPercent((totalRatio / attempts) * 100) : 0;

      return {
        questionId: question.id,
        questionNumber: index + 1,
        shortLabel: getQuestionPreview(question.content, index + 1),
        fullLabel: question.content,
        masteryRate,
        attempts,
        perfectCount,
        unansweredCount,
        averageScore:
          attempts > 0 ? Number((totalScore / attempts).toFixed(1)) : 0,
      };
    })
    .sort(
      (left, right) =>
        left.masteryRate - right.masteryRate ||
        right.unansweredCount - left.unansweredCount ||
        left.questionNumber - right.questionNumber
    );

  const easiestQuestion =
    rankedQuestions.length > 0
      ? [...rankedQuestions].sort(
          (left, right) =>
            right.masteryRate - left.masteryRate ||
            right.perfectCount - left.perfectCount ||
            left.questionNumber - right.questionNumber
        )[0]
      : null;

  return {
    metrics,
    scoreDistribution,
    questionPerformance: rankedQuestions,
    hardestQuestion: rankedQuestions[0] ?? null,
    easiestQuestion,
    fullyMasteredQuestions: rankedQuestions
      .filter(
        (question) =>
          question.attempts > 0 && question.perfectCount === question.attempts
      )
      .slice(0, 4),
  };
}

function getStatusBadge(status: string, label: string) {
  switch (status) {
    case "graded":
      return <Badge variant="secondary">{label}</Badge>;
    case "submitted":
      return <Badge variant="outline">Шалгаж байна</Badge>;
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

function getStudentAvatarTone(row: ResultRow) {
  if (row.percentage === null) {
    return "info" as const;
  }

  if (row.passed) {
    return "success" as const;
  }

  return "danger" as const;
}

export default async function ExamResultsPage({ params, searchParams }: Props) {
  const { id: examId } = await params;
  const { group: groupFilter } = await searchParams;

  const data = await getExamResults(examId);
  if (!data) notFound();

  const { exam, sessions, stats, groups, questions, answers } = data;

  const filtered = groupFilter
    ? sessions.filter((session) =>
        session.groups.some((group) => group.id === groupFilter)
      )
    : sessions;
  const displayStats = groupFilter ? buildStats(filtered) : stats;
  const activeGroup =
    groupFilter != null
      ? groups.find((group) => group.id === groupFilter) ?? null
      : null;
  const insights = buildResultsInsights(
    filtered,
    questions as ResultQuestion[],
    answers as ResultAnswer[],
    exam.passing_score
  );
  const scopeLabel = activeGroup ? `${activeGroup.name} бүлэг` : "Бүх сурагч";

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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.95fr)]">
        <div>
          {filtered.length === 0 ? (
            <Card className="rounded-[28px]">
              <CardContent className="py-10 text-center text-muted-foreground">
                Оролцогч байхгүй байна.
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-[28px]">
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
                          <StudentIdentity
                            name={session.student_name}
                            email={session.student_email}
                            avatarUrl={session.student_avatar_url}
                            tone={getStudentAvatarTone(session)}
                            size="sm"
                          />
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
                            <Badge
                              variant={session.passed ? "secondary" : "outline"}
                            >
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
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full"
                                >
                                  Үйлдэл
                                  <ChevronDown className="ml-2 h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-56 min-w-[14rem]"
                              >
                                <DropdownMenuLabel>Сонголтууд</DropdownMenuLabel>

                                {session.session_id ? (
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/educator/grading/${session.session_id}`}
                                    >
                                      Оролдлогыг харах
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}

                                {session.session_id ? (
                                  <DropdownMenuSeparator />
                                ) : null}

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
                                    <button
                                      type="submit"
                                      className={dropdownActionButtonClassName}
                                    >
                                      Чөлөөлөлт цуцлах
                                    </button>
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
                                    <button
                                      type="submit"
                                      className={dropdownActionButtonClassName}
                                    >
                                      Чөлөөлөх
                                    </button>
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
                                    <button
                                      type="submit"
                                      className={dropdownActionButtonClassName}
                                    >
                                      Нөхөн эрх цуцлах
                                    </button>
                                  </form>
                                ) : session.status !== "in_progress" &&
                                  !session.has_remaining_attempts ? (
                                  <form
                                    action={async () => {
                                      "use server";
                                      await grantRecipientRetake(
                                        examId,
                                        session.student_id
                                      );
                                    }}
                                  >
                                    <button
                                      type="submit"
                                      className={dropdownActionButtonClassName}
                                    >
                                      Нөхөн эрх олгох
                                    </button>
                                  </form>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        <ResultsInsightsPanel
          scopeLabel={scopeLabel}
          passingScore={exam.passing_score}
          totalCount={displayStats.total}
          attemptedCount={displayStats.attempted}
          questionCount={questions.length}
          metrics={insights.metrics}
          scoreDistribution={insights.scoreDistribution}
          questionPerformance={insights.questionPerformance}
          hardestQuestion={insights.hardestQuestion}
          easiestQuestion={insights.easiestQuestion}
          fullyMasteredQuestions={insights.fullyMasteredQuestions}
        />
      </div>
    </div>
  );
}
