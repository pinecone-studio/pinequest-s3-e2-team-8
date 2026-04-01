import { getExamById } from "@/lib/exam/actions";
import { getQuestionBankCatalogData } from "@/lib/question/actions";
import { createClient } from "@/lib/supabase/server";
import { getTeacherSubjects } from "@/lib/subject/actions";
import { isAdminUser } from "@/lib/teacher/permissions";
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
  const [
    { certifiedQuestions, privateQuestions, sampleExams },
    subjects,
    targetExam,
  ] = await Promise.all([
    getQuestionBankCatalogData(),
    getTeacherSubjects(),
    examId ? getExamById(examId) : Promise.resolve(null),
  ]);

  const mergedSubjects = Array.from(
    new Map(
      [
        ...subjects,
        ...certifiedQuestions.flatMap((question) =>
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
            : [],
        ),
        ...privateQuestions.flatMap((question) =>
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
            : [],
        ),
      ].map((subject) => [subject.id, subject]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "mn"));

  const importUnavailableMessage = examId
    ? !targetExam
      ? "Сонгосон шалгалт олдсонгүй эсвэл танд эрх алга."
      : targetExam.is_published
        ? "Нийтлэгдсэн шалгалтад сангаас асуулт оруулах боломжгүй."
        : null
    : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerIsAdmin = user ? await isAdminUser(supabase, user.id) : false;

  return (
    <div className="space-y-6">
      <QuestionBankBrowser
        certifiedQuestions={certifiedQuestions}
        privateQuestions={privateQuestions}
        sampleExams={sampleExams}
        subjects={mergedSubjects}
        examId={!importUnavailableMessage ? targetExam?.id : undefined}
        examTitle={!importUnavailableMessage ? targetExam?.title : undefined}
        targetExamSubjectId={
          !importUnavailableMessage
            ? (targetExam?.subject_id ?? undefined)
            : undefined
        }
        importUnavailableMessage={importUnavailableMessage}
        viewerIsAdmin={viewerIsAdmin}
      />
    </div>
  );
}
