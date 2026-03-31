import { redirect } from "next/navigation";
import { getStudentPracticeExamForTake } from "@/lib/student-learning/actions";
import PracticeExamTaker from "../../_features/PracticeExamTaker";

export default async function StudentPracticeExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getStudentPracticeExamForTake(id);

  if (!data) {
    redirect("/student/learning");
  }

  if (data.questions.length === 0 || !data.attempt) {
    redirect("/student/learning?error=practice_empty");
  }

  if (data.attempt?.status === "graded") {
    redirect(`/student/learning/practice/${id}/result`);
  }

  return (
    <PracticeExamTaker
      practiceExamId={id}
      examTitle={data.exam.title}
      subjectName={data.exam.subject_name}
      questions={data.questions}
    />
  );
}
