import { getTeacherSubjects } from "@/lib/subject/actions";
import { getGroups } from "@/lib/group/actions";
import ExamForm from "./_features/ExamForm";

export default async function CreateExamPage() {
  const [subjects, groups] = await Promise.all([
    getTeacherSubjects(),
    getGroups(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Шалгалт үүсгэх</h2>
        <p className="text-muted-foreground">
          Шалгалтын мэдээллийг оруулна уу. Дараа нь асуулт нэмэх боломжтой.
        </p>
      </div>
      <ExamForm subjects={subjects} groups={groups} />
    </div>
  );
}
