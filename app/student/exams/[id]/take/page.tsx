import { redirect } from "next/navigation";
import { getExamForStudent, startExamSession, getSessionAnswers } from "@/lib/student/actions";
import ExamTaker from "./_features/ExamTaker";

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = await params;
  const data = await getExamForStudent(examId);

  if (!data) redirect("/student/exams");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { exam, questions } = data as any;

  // Шалгалт идэвхтэй эсэх шалгах
  const now = new Date();
  const startTime = new Date(exam.start_time as string);
  const endTime = new Date(exam.end_time as string);

  if (now < startTime || now > endTime) {
    redirect("/student/exams");
  }

  // Session эхлүүлэх
  const result = await startExamSession(examId);
  if ("error" in result) redirect("/student/exams");

  const session = result.session!;

  // Өмнөх хариултуудыг авах (resume)
  const savedAnswers = await getSessionAnswers(session.id);

  return (
    <ExamTaker
      exam={exam}
      questions={questions}
      sessionId={session.id}
      savedAnswers={savedAnswers}
    />
  );
}
