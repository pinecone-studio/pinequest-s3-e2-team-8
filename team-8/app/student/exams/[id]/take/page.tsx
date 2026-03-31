import { redirect } from "next/navigation";
import {
  prepareExamTakePayload,
} from "@/lib/student/actions";
import ExamStartGate from "./_features/ExamStartGate";

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = await params;
  const payload = await prepareExamTakePayload(examId);

  if ("redirectTo" in payload) {
    redirect(payload.redirectTo);
  }

  if ("error" in payload) {
    redirect(`/student/exams?error=${encodeURIComponent(payload.error)}`);
  }

  return (
    <ExamStartGate
      exam={payload.exam}
      questions={payload.questions}
      sessionId={payload.sessionId}
      savedAnswers={payload.savedAnswers}
      answerAnalytics={payload.answerAnalytics}
      initialTimeLeftSeconds={payload.initialTimeLeftSeconds}
      sessionAlreadyStarted={payload.sessionAlreadyStarted}
    />
  );
}
