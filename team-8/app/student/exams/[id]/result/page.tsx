import { redirect } from "next/navigation";
import Link from "next/link";
import { getExamResult } from "@/lib/student/actions";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronLeft,
  LockKeyhole,
} from "lucide-react";
import { formatDateTimeUB } from "@/lib/utils/date";
import QuestionStepper from "./_components/QuestionStepper";
function parseStringArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as string[];
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizeTextValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function areArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function parseMatchingPairs(options: unknown) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      const [left, right] = String(option).split("|||");
      if (!left || !right) return null;
      return { left, right };
    })
    .filter((item): item is { left: string; right: string } => Boolean(item));
}

export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = await params;
  const data = await getExamResult(examId);

  if (!data) redirect("/student/exams");

  const examMeta = Array.isArray(data.exams) ? data.exams[0] : data.exams;
  const canViewResults = Boolean(data.can_view_results ?? true);
  const lockedReason = String(data.result_locked_reason ?? "release_pending");

  if (!canViewResults) {
    return (
      <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center px-4">
        <div className="w-full rounded-[28px] border bg-white p-8 shadow-sm">
          <Link
            href="/student/results"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ChevronLeft size={18} />
            Миний шалгалтууд руу буцах
          </Link>

          <div className="mt-8 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <LockKeyhole className="h-8 w-8 text-foreground" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold text-foreground">
              {examMeta?.title ?? "Шалгалтын үр дүн"}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              {lockedReason === "retake_pending"
                ? "Танд дахин оролдох боломж нээлттэй эсвэл товлогдсон байгаа тул дүн, зөв хариулт одоогоор харагдахгүй."
                : "Таны хариулт амжилттай илгээгдсэн. Шалгалтын нийт хугацаа дууссаны дараа дүн болон дэлгэрэнгүй задрал нээгдэнэ."}
            </p>
            {data.result_release_at ? (
              <div className="mt-5 rounded-2xl bg-muted/60 px-5 py-4 text-sm text-foreground">
                Дүн нээгдэх хугацаа: {formatDateTimeUB(data.result_release_at)}
              </div>
            ) : null}
            {data.grading_pending ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Одоогоор үр дүн боловсруулагдаж байна.
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/student/results"
                className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white"
              >
                Миний дүн рүү очих
              </Link>
              <Link
                href="/student/exams"
                className="inline-flex items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-medium text-foreground"
              >
                Шалгалтын жагсаалт
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canViewDetailedFeedback = Boolean(
    data.can_view_detailed_feedback ?? true,
  );
  const answers = canViewDetailedFeedback ? (data.answers ?? []) : [];
  const derivedAnswers: Record<string, unknown>[] = answers.map((answer) => {
    const question = Array.isArray(answer.questions)
      ? answer.questions[0]
      : answer.questions;
    if (!question) {
      return {
        ...answer,
        derivedIsCorrect: answer.is_correct ?? null,
        derivedScore: Number(answer.score ?? 0),
      };
    }

    const type = String(question.type ?? "");
    const points = Number(question.points ?? 0);

    if (type === "multiple_choice" || type === "fill_blank") {
      const isCorrect =
        normalizeTextValue(answer.answer) ===
        normalizeTextValue(question.correct_answer);
      return {
        ...answer,
        derivedIsCorrect: isCorrect,
        derivedScore: isCorrect ? points : 0,
      };
    }

    if (type === "multiple_response") {
      const submitted = parseStringArray(answer.answer)
        .map((item) => normalizeTextValue(item))
        .filter(Boolean)
        .sort();
      const expected = parseStringArray(question.correct_answer)
        .map((item) => normalizeTextValue(item))
        .filter(Boolean)
        .sort();
      const isCorrect =
        submitted.length > 0 && areArraysEqual(submitted, expected);

      return {
        ...answer,
        derivedIsCorrect: isCorrect,
        derivedScore: isCorrect ? points : 0,
      };
    }

    if (type === "matching") {
      try {
        const submitted = JSON.parse(String(answer.answer ?? "{}")) as Record<
          string,
          string
        >;
        const expected = parseMatchingPairs(question.options);
        const isCorrect =
          expected.length > 0 &&
          expected.every(
            (pair) =>
              normalizeTextValue(submitted[pair.left]) ===
              normalizeTextValue(pair.right),
          );

        return {
          ...answer,
          derivedIsCorrect: isCorrect,
          derivedScore: isCorrect ? points : 0,
        };
      } catch {
        return {
          ...answer,
          derivedIsCorrect: false,
          derivedScore: 0,
        };
      }
    }

    return {
      ...answer,
      derivedIsCorrect: answer.is_correct ?? null,
      derivedScore: Number(answer.score ?? 0),
    };
  });

  const totalScore = canViewDetailedFeedback
    ? derivedAnswers.reduce(
        (sum, answer) => sum + Number(answer.derivedScore ?? 0),
        0,
      )
    : Number(data.total_score ?? 0);
  const maxScore = canViewDetailedFeedback
    ? derivedAnswers.reduce((sum, answer) => {
        const question = Array.isArray(answer.questions)
          ? answer.questions[0]
          : answer.questions;
        return sum + Number(question?.points ?? 0);
      }, 0)
    : Number(data.max_score ?? 0);
  const percentage =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const passingScore = examMeta?.passing_score ?? 60;
  const passed = percentage >= passingScore;
  const hasEssayAnswers = derivedAnswers.some((answer) => {
    const question = Array.isArray(answer.questions)
      ? answer.questions[0]
      : answer.questions;
    return question?.type === "essay";
  });
  const isFinalized =
    data.status === "graded" ||
    (data.status === "timed_out" &&
      canViewDetailedFeedback &&
      !hasEssayAnswers);

  return (
    <div className="flex justify-center items-center mt-10">
      <div className="flex gap-9">
        <Link href="/student/results">
          <ChevronLeft size={40} />
        </Link>

        <div className="flex gap-15">
          <div className="flex flex-col gap-16.5 h-205.5 items-between">
            <div className="flex flex-col ">
              {examMeta?.title && (
                <p className="font-medium text-[24px]">{examMeta.title}</p>
              )}
            </div>
            <div className="flex gap-15  ">
              <div className="flex flex-col">
                <QuestionStepper
                  answers={derivedAnswers}
                  canViewDetailedFeedback={canViewDetailedFeedback}
                  isFinalized={isFinalized}
                />
              </div>
            </div>
          </div>
          {/* divрөнхий дүн */}
          <div className="text-center">
            <div className="space-y-4">
              <div
                className={`flex h-35.25 w-62.5 items-center justify-center rounded-lg gap-1.5 flex-col ${!isFinalized ? "bg-[#F3EBFE] text-slate-700" : passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
              >
                <div className="mx-auto text-4xl font-bold ">{percentage}%</div>
                <p className="text-[16px] text-[#7F7F7F]">
                  Таны <span className="font-medium">{totalScore}</span> хариулт
                  зөв байна.
                </p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-lg font-semibold ${
                    !isFinalized
                      ? "text-slate-600"
                      : passed
                        ? "text-green-600"
                        : "text-red-600"
                  }`}
                ></p>
              </div>
              {canViewDetailedFeedback && derivedAnswers.length > 0 && (
                <div className="space-y-3">
                  {derivedAnswers.map((ans, idx: number) => {
                    const maybeQuestions = (ans as Record<string, unknown>).questions;
                    let qRaw: unknown;
                    if (Array.isArray(maybeQuestions)) {
                      qRaw = maybeQuestions[0];
                    } else {
                      qRaw = maybeQuestions;
                    }
                    const q = (qRaw ?? null) as Record<string, unknown> | null;
                    if (!q) return null;

                    const isEssay: boolean = String(q.type ?? "") === "essay";
                    const isCorrect: boolean | null = (ans.derivedIsCorrect ?? (ans as Record<string, unknown>).is_correct ?? null) as boolean | null;
                    // derived score and points exist on the answer/question
                    // but they're not needed in this compact list view right now.
                    // If needed later, use: Number(ans.derivedScore ?? ans.score ?? 0)
                    // and Number(q.points ?? 0)

                    return (
                      <div
                        key={String(ans.id)}
                        className={`${
                          isEssay
                            ? "bg-blue-100 w-62.5 rounded-lg"
                            : isCorrect
                              ? "bg-green-100 w-62.5 rounded-lg"
                              : "bg-red-100 w-62.5 rounded-lg"
                        }`}
                      >
                        <div className=" space-y-2 w-62.5">
                          <div className="flex items-start justify-between gap-2 rounded w-62.5">
                            <div className="flex items-center gap-3.5 py-3 pl-6 rounded w-62.5 h-12.5">
                              {isEssay ? (
                                <MinusCircle className="h-6.5 w-6.5 text-blue-500 shrink-0 mt-0.5" />
                              ) : isCorrect ? (
                                <CheckCircle2 className="h-6.5 w-6.5 text-green-500 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="h-6.5 w-6.5 text-red-500 shrink-0 mt-0.5" />
                              )}
                              <span className="text-[18px] ">
                                Aсуулт {idx + 1}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!isFinalized && (
                <p className="text-sm text-muted-foreground w-62.5">
                  Нээлттэй хариулт (essay) асуултуудыг багш шалгасны дараа
                  эцсийн оноо өөрчлөгдөж болно.
                </p>
              )}
              {!canViewDetailedFeedback && (
                <p className="text-sm text-muted-foreground w-62.5">
                  Танд дахин оролдох боломж үлдсэн тул одоохондоо зөв хариулт,
                  тайлбар, асуулт тус бүрийн задрал харагдахгүй. Одоогийн
                  хамгийн өндөр дүнг л үзүүлж байна.
                </p>
              )}
              {isFinalized && (
                <p className="text-sm font-medium text-green-600 w-62.5">
                  ✓ Багш шалгаж дүн баталгаажсан
                </p>
              )}
              {Number(data.best_attempt_number ?? 0) > 0 && (
                <p className="text-xs text-muted-foregroun w-62.5">
                  Харагдаж буй дүн: {Number(data.best_attempt_number)}-р
                  оролдлого
                  {Number(data.latest_attempt_number ?? 0) >
                  Number(data.best_attempt_number ?? 0)
                    ? ` · сүүлийн оролдлого ${Number(data.latest_attempt_number)}`
                    : ""}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
