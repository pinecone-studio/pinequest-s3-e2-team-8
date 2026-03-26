import { redirect } from "next/navigation";
import {
  getExamForStudent,
  startExamSession,
  getSessionAnswers,
  submitExam,
} from "@/lib/student/actions";
import ExamTaker from "./_features/ExamTaker";

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = await params;
  const data = await getExamForStudent(examId);

  if (!data) {
    redirect("/student/exams?error=exam_not_found");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { exam, questions } = data as any;

  if (!Array.isArray(questions) || questions.length === 0) {
    redirect("/student/exams?error=questions_not_ready");
  }

  // Шалгалт идэвхтэй эсэх шалгах
  const now = new Date();
  const startTime = new Date(exam.start_time as string);
  const endTime = new Date(exam.end_time as string);

  if (now < startTime || now > endTime) {
    redirect(`/student/exams?error=time_window&exam=${encodeURIComponent(exam.title)}`);
  }

  // Session эхлүүлэх
  const result = await startExamSession(examId);
  if ("error" in result) {
    // Оролдлогын эрх дууссан → үр дүн хуудас руу
    if ("redirectToResult" in result && result.redirectToResult) {
      redirect(`/student/exams/${examId}/result`);
    }
    redirect(`/student/exams?error=${encodeURIComponent(result.error ?? "session_failed")}`);
  }

  const session = result.session!;

  const nowMs = new Date().getTime();
  const sessionEndsAt =
    new Date(session.started_at).getTime() +
    Number(exam.duration_minutes) * 60 * 1000;
  const examEndsAt = new Date(exam.end_time as string).getTime();
  const initialTimeLeftSeconds = Math.max(
    Math.floor((Math.min(sessionEndsAt, examEndsAt) - nowMs) / 1000),
    0
  );

  if (initialTimeLeftSeconds <= 0) {
    await submitExam(session.id);
    redirect(`/student/exams/${examId}/result`);
  }

  // Өмнөх хариултуудыг авах (resume)
  const savedAnswers = await getSessionAnswers(session.id);

  return (
    <ExamTaker
      exam={exam}
      questions={questions}
      sessionId={session.id}
      savedAnswers={savedAnswers}
      initialTimeLeftSeconds={initialTimeLeftSeconds}
    />
  );
}
