import { getStudentExams } from "@/lib/student/actions";
import StudentScheduleBoard from "./_features/StudentScheduleBoard";

export default async function StudentSchedulePage() {
  const exams = await getStudentExams();

  return <StudentScheduleBoard exams={exams} />;
}
