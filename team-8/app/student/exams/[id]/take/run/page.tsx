import { redirect } from "next/navigation";
import { prepareExamTakePayload } from "@/lib/student/actions";
import ExamRunnerClient from "../_features/ExamRunnerClient";

export default async function TakeExamRunnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    session?: string | string[];
    fresh?: string | string[];
    startedAt?: string | string[];
  }>;
}) {
  const { id: examId } = await params;
  const resolvedSearchParams = await searchParams;
  const hintedSessionId = Array.isArray(resolvedSearchParams.session)
    ? resolvedSearchParams.session[0]
    : resolvedSearchParams.session;
  const expectedStartedAt = Array.isArray(resolvedSearchParams.startedAt)
    ? resolvedSearchParams.startedAt[0]
    : resolvedSearchParams.startedAt;
  const payload = await prepareExamTakePayload(examId, {
    sessionId: hintedSessionId ?? null,
    skipSavedStateReads:
      (Array.isArray(resolvedSearchParams.fresh)
        ? resolvedSearchParams.fresh[0]
        : resolvedSearchParams.fresh) === "1",
    expectedStartedAt: expectedStartedAt ?? null,
  });

  if ("redirectTo" in payload) {
    redirect(payload.redirectTo);
  }

  if ("error" in payload) {
    redirect(`/student/exams?error=${encodeURIComponent(payload.error)}`);
  }

  if (!payload.sessionId) {
    redirect(`/student/exams?error=${encodeURIComponent("session_not_found")}`);
  }

  return (
    <ExamRunnerClient
      exam={payload.exam}
      questions={payload.questions}
      sessionId={payload.sessionId}
      runtimeToken={payload.runtimeToken}
      savedAnswers={payload.savedAnswers}
      answerAnalytics={payload.answerAnalytics}
      initialTimeLeftSeconds={payload.initialTimeLeftSeconds ?? 0}
    />
  );
}
