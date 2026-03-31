import { getTeacherSubjects } from "@/lib/subject/actions";
import { getExamCreationGroups } from "@/lib/group/actions";
import { getQuestionBankCatalogData } from "@/lib/question/actions";
import { suggestSubjectIdFromPrivateBank } from "@/lib/question/utils";
import ExamForm from "./_features/ExamForm";

export default async function CreateExamPage() {
  const [subjects, groups, { privateQuestions }] = await Promise.all([
    getTeacherSubjects(),
    getExamCreationGroups(),
    getQuestionBankCatalogData(),
  ]);

  const initialSubjectId = suggestSubjectIdFromPrivateBank(
    subjects.map((subject) => subject.id),
    privateQuestions
  );

  return (
    <ExamForm
      subjects={subjects}
      groups={groups}
      initialSubjectId={initialSubjectId}
    />
  );
}
