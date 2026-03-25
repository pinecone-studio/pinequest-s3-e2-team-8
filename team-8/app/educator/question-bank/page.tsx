import { getExamById } from "@/lib/exam/actions";
import { getQuestionBank } from "@/lib/question/actions";
import { getSubjects } from "@/lib/subject/actions";
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
  const [questions, subjects, targetExam] = await Promise.all([
    getQuestionBank(),
    getSubjects(),
    examId ? getExamById(examId) : Promise.resolve(null),
  ]);

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
        subjects={subjects}
        examId={!importUnavailableMessage ? targetExam?.id : undefined}
        examTitle={!importUnavailableMessage ? targetExam?.title : undefined}
        importUnavailableMessage={importUnavailableMessage}
      />
    </div>
  );
}
