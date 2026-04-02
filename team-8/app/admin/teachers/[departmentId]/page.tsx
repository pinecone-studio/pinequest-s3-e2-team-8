import { notFound } from "next/navigation";
import { getTeachersWithAssignments } from "@/lib/admin/actions";
import { getSubjects } from "@/lib/subject/actions";
import TeacherDepartmentDetail from "../_features/TeacherDepartmentDetail";
import { buildDepartmentGroups } from "../_features/teacher-department-utils";

export default async function AdminTeacherDepartmentPage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const { departmentId } = await params;
  const [teachers, subjects] = await Promise.all([
    getTeachersWithAssignments(),
    getSubjects(),
  ]);

  const departments = buildDepartmentGroups(teachers);
  const department = departments.find((item) => item.id === departmentId);

  if (!department) {
    notFound();
  }

  const departmentDetail = {
    id: department.id,
    title: department.title,
    description: department.description,
    teachers: department.teachers,
    subjectCount: department.subjectCount,
  };

  return (
    <TeacherDepartmentDetail
      department={departmentDetail}
      subjects={subjects}
    />
  );
}
