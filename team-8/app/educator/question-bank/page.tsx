import { getExamById } from "@/lib/exam/actions";
import { getQuestionBankDashboardData } from "@/lib/question/actions";
import { getTeacherSubjects } from "@/lib/subject/actions";
import type { Subject } from "@/types";
import QuestionBankBrowser from "./_features/QuestionBankBrowser";

interface QuestionBankPageProps {
  searchParams: Promise<{
    examId?: string;
  }>;
}

export default async function QuestionBankPage({
  searchParams,
}: QuestionBankPageProps) {
  const { examId } = await searchParams;
  const [{ questions, summary, viewerId, isAdmin }, subjects, targetExam] =
    await Promise.all([
      getQuestionBankDashboardData(),
      getTeacherSubjects(),
      examId ? getExamById(examId) : Promise.resolve(null),
    ]);

  const mergedSubjects = Array.from(
    new Map(
      [
        ...subjects,
        ...questions.flatMap((question) =>
          question.subject_id && question.subjects?.name
            ? [
                {
                  id: question.subject_id,
                  name: question.subjects.name,
                  description: null,
                  created_by: null,
                  created_at: question.created_at,
                } satisfies Subject,
              ]
            : []
        ),
      ].map((subject) => [subject.id, subject])
    ).values()
  ).sort((left, right) => left.name.localeCompare(right.name, "mn"));

  const importUnavailableMessage = examId
    ? !targetExam
      ? "Сонгосон шалгалт олдсонгүй эсвэл танд эрх алга."
      : targetExam.is_published
        ? "Нийтлэгдсэн шалгалтад сангаас асуулт оруулах боломжгүй."
        : null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Асуултын сан</h2>
        <p className="text-muted-foreground">
          Дахин ашиглах боломжтой асуултууд · Нийт {questions.length}
        </p>
      </div>

      <QuestionBankBrowser
        questions={questions}
        summary={summary}
        viewerId={viewerId}
        isAdmin={isAdmin}
        subjects={mergedSubjects}
        examId={!importUnavailableMessage ? targetExam?.id : undefined}
        examTitle={!importUnavailableMessage ? targetExam?.title : undefined}
        targetExamSubjectId={
          !importUnavailableMessage ? targetExam?.subject_id ?? undefined : undefined
        }
        importUnavailableMessage={importUnavailableMessage}
      />
    </div>
  );
}
