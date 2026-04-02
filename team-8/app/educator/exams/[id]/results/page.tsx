import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
} from "lucide-react";
import { getExamResults } from "@/lib/exam/actions";
import {
  clearRecipientRetake,
  grantRecipientRetake,
  setRecipientExcused,
} from "@/lib/exam-recipient-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  const metrics = [ {
      key: "excellent",
      label: "90%+",
      value: excellenceRate,
      suffix: "%",
      description: `${excellenceCount} сурагч өндөр амжилттай`,
      tone: "violet" as const,
    },
    {
      key: "participation",
      label: "Оролцоо",
      value: participationRate,
      suffix: "%",
      description: `${attemptedRows.length} сурагчийн дүн бүртгэгдсэн`,
      tone: "sky" as const,
    }, {
      key: "success",
      label: "Амжилт",
      value: passRate,
      suffix: "%",
      description: `${passCount} сурагч тэнцсэн`,
      tone: "emerald" as const,
    },
    {
      key: "average",
      label: "Дундаж",
      value: averageScore,
      suffix: "%",
      description: `Тэнцэх босго ${passingScore}%`,
      tone: "amber" as const,
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
      return (
        <span className="inline-flex min-h-10 items-center rounded-full border border-[#E3E3E3] bg-[#FAFAFA] px-5 text-[15px] font-medium text-[#8B8B8B]">
          {label}
        </span>
      );
    case "submitted":
      return (
        <span className="inline-flex min-h-10 items-center rounded-full border border-[#D8E6FF] bg-[#F4F8FF] px-5 text-[15px] font-medium text-[#5B78B8]">
          Шалгаж байна
        </span>
      );
    case "in_progress":
      return (
        <span className="inline-flex min-h-10 items-center rounded-full border border-[#D8E6FF] bg-[#F4F8FF] px-5 text-[15px] font-medium text-[#5B78B8]">
          Өгөөд эхэлсэн
        </span>
      );
    case "retake_available":
    case "retake_scheduled":
      return (
        <span className="inline-flex min-h-10 items-center rounded-full border border-[#E7D8FF] bg-[#F8F3FF] px-5 text-[15px] font-medium text-[#7E5DB0]">
          {label}
        </span>
      );
    case "excused":
      return (
        <span className="inline-flex min-h-10 items-center rounded-full border border-[#E7D8FF] bg-[#FAF5FF] px-5 text-[15px] font-medium text-[#8B5CF6]">
          Чөлөөлөгдсөн
        </span>
      );
    case "timed_out":
      return (
        <span className="inline-flex min-h-10 items-center rounded-full border border-[#FBD4D4] bg-[#FFF5F5] px-5 text-[15px] font-medium text-[#E57373]">
          Хугацаа дууссан
        </span>
      );
    case "absent":
      return (
        <span className="inline-flex min-h-10 items-center rounded-full border border-[#E3E3E3] bg-[#FAFAFA] px-5 text-[15px] font-medium text-[#8B8B8B]">
          Өгөөгүй
        </span>
      );
    default:
      return (
        <span className="inline-flex min-h-10 items-center rounded-full border border-[#E3E3E3] bg-[#FAFAFA] px-5 text-[15px] font-medium text-[#8B8B8B]">
          {label}
        </span>
      );
  }
}

function getResultBadge(passed: boolean) {
  return passed ? (
    <span className="inline-flex min-h-10 items-center rounded-full border border-[#7DD78A] bg-[#E4F8E7] px-5 text-[15px] font-medium text-[#60B56E]">
      Тэнцсэн
    </span>
  ) : (
    <span className="inline-flex min-h-10 items-center rounded-full border border-[#F29A9A] bg-[#FFF1F1] px-5 text-[15px] font-medium text-[#EB7676]">
      Тэнцээгүй
    </span>
  );
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
    <div className="space-y-6 pb-6">
      <div className="space-y-2">
        <h1 className="text-[26px] font-semibold tracking-[-0.04em] text-[#111827]">
          {exam.title}
        </h1>
        <p className="text-[15px] text-[#6B7280]">
          {exam.subject?.name ?? "Хичээл тодорхойгүй"} · Тэнцэх босго{" "}
          {exam.passing_score}% · {displayStats.total} сурагч
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {groups.length > 0 && (
          <div className="flex h-auto w-fit flex-wrap gap-1 rounded-full border border-slate-200/50 bg-[#F0EEEE] p-1">
            <Link href={`/educator/exams/${examId}/results`}>
              <Badge
                variant="outline"
                className={`h-auto cursor-pointer rounded-full border-none px-5 py-2 text-base transition-all ${!groupFilter
                    ? "bg-white text-black shadow-sm"
                    : "bg-transparent text-muted-foreground hover:bg-slate-200/50"
                  }`}
              >
                Бүгд ({sessions.length})
              </Badge>
            </Link>

            {groups.map((group) => {
              const count = sessions.filter((session) =>
                session.groups.some((studentGroup) => studentGroup.id === group.id)
              ).length;

              const isActive = groupFilter === group.id;

              return (
                <Link
                  key={group.id}
                  href={`/educator/exams/${examId}/results?group=${group.id}`}
                >
                  <Badge
                    variant="outline"
                    className={`h-auto cursor-pointer rounded-full border-none px-5 py-2 text-base transition-all ${isActive
                        ? "bg-white text-black shadow-sm"
                        : "bg-transparent text-muted-foreground hover:bg-slate-200/50"
                      }`}
                  >
                    {group.name} ({count})
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}

        <Link href={`/educator/exams/${examId}/questions`}>
          <Button className="h-11 rounded-full bg-[#5199F6] px-5 text-[15px] font-medium shadow-[0_14px_28px_-16px_rgba(81,153,246,0.8)] hover:bg-[#4389E4]">
            Асуултууд харах
          </Button>
        </Link>
      </div>

      {groupFilter && (
        <div className="rounded-2xl border border-[#E8E8E8] bg-[#FBFBFB] px-4 py-3 text-sm text-[#6B7280]">
          Шүүж харж буй бүлэг дээр {displayStats.total} сурагч байна.
        </div>
      )}

      <div className="space-y-6">
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

        <div>
          {filtered.length === 0 ? (
            <Card className="rounded-[28px] border border-[#ECECEC] shadow-[0_18px_44px_-28px_rgba(15,23,42,0.18)]">
              <CardContent className="py-10 text-center text-muted-foreground">
                Оролцогч байхгүй байна.
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden rounded-[28px] border border-[#ECECEC] shadow-[0_18px_44px_-28px_rgba(15,23,42,0.18)]">
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[880px] text-sm">
                  <thead>
                    <tr className="border-b border-[#ECECEC] bg-[#FFFFFF]">
                      <th className="px-5 py-4 text-left text-[15px] font-semibold text-[#111827]">
                        Сурагчид
                      </th>
                      <th className="px-4 py-4 text-left text-[15px] font-semibold text-[#111827]">
                        Бүлэг
                      </th>
                      <th className="px-4 py-4 text-left text-[15px] font-semibold text-[#111827]">
                        Оноо
                      </th>
                      <th className="px-4 py-4 text-center text-[15px] font-semibold text-[#111827]">
                        Дүн
                      </th>
                      <th className="px-4 py-4 text-center text-[15px] font-semibold text-[#111827]">
                        Төлөв
                      </th>
                      <th className="px-5 py-4 text-right text-[15px] font-semibold text-[#111827]">
                        Үйлдэл
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {filtered.map((session) => (
                      <tr
                        key={session.student_id}
                        className="border-b border-[#F0F0F0] transition-colors hover:bg-[#FAFAFA]"
                      >
                        <td className="px-5 py-4">
                          <StudentIdentity
                            name={session.student_name}
                            email={session.student_email}
                            avatarUrl={session.student_avatar_url}
                            tone={getStudentAvatarTone(session)}
                            size="sm"
                          />
                        </td>
                        <td className="px-4 py-4 text-[15px] text-[#374151]">
                          <div className="flex flex-wrap gap-1">
                            {session.groups.length > 0 ? (
                              session.groups.map((group) => (
                                <Badge
                                  key={group.id}
                                  variant="outline"
                                  className="h-auto rounded-full border-none bg-transparent px-0 py-0 text-[15px] font-medium text-[#374151] shadow-none"
                                >
                                  {group.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[15px] font-medium text-[#374151]">
                          {session.percentage === null ? "—" : `${session.percentage}%`}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {session.percentage === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            getResultBadge(session.passed)
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {getStatusBadge(session.status, session.status_label)}
                            {session.has_retake_override && (
                              <Badge
                                variant="outline"
                                className="h-auto rounded-full border-[#E5D4FF] bg-[#F8F3FF] px-3 py-1 text-xs text-[#7E5DB0]"
                              >
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
                        <td className="px-5 py-4">
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full border-[#E5E7EB] bg-white px-4 text-[#374151] hover:bg-[#F8FAFC]"
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
      </div>
    </div>
  );
}
