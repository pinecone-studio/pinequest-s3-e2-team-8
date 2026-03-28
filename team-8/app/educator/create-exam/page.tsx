import { getTeacherSubjects } from "@/lib/subject/actions";
import { getExamCreationGroups } from "@/lib/group/actions";
import ExamForm from "./_features/ExamForm";

export default async function CreateExamPage() {
  const [subjects, groups] = await Promise.all([
    getTeacherSubjects(),
    getExamCreationGroups(),
  ]);

  return <ExamForm subjects={subjects} groups={groups} />;
}
