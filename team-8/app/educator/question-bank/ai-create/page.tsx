import { getTeacherSubjects } from "@/lib/subject/actions";
import AiCreateConfigurator from "./_features/AiCreateConfigurator";

export default async function AiCreatePage() {
  const subjects = await getTeacherSubjects();

  return <AiCreateConfigurator subjects={subjects} />;
}
