import { redirect } from "next/navigation";
import { getExamStartGatePayload } from "@/lib/student/actions";
import ExamStartGate from "./_features/ExamStartGate";

export default async function TakeExamGatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = await params;
  const payload = await getExamStartGatePayload(examId);

  if ("redirectTo" in payload) {
    redirect(payload.redirectTo);
  }

  if ("error" in payload) {
    redirect(`/student/exams?error=${encodeURIComponent(payload.error)}`);
  }

  return <ExamStartGate exam={payload.exam} />;
}
