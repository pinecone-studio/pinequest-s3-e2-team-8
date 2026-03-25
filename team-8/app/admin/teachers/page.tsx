import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTeachersWithAssignments } from "@/lib/admin/actions";
import { getSubjects } from "@/lib/subject/actions";
import { getAllGroupsAdmin } from "@/lib/group/actions";
import TeacherAssignmentPanel from "./_features/TeacherAssignmentPanel";

export default async function AdminTeachersPage() {
  const [teachers, subjects, groups] = await Promise.all([
    getTeachersWithAssignments(),
    getSubjects(),
    getAllGroupsAdmin(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Буцах
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Багш нарын хичээл оноолт</h2>
          <p className="text-muted-foreground">
            Багш бүрт заах хичээл болон бүлгийн оноолтыг удирдана.
          </p>
        </div>
      </div>

      {teachers.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          Багш бүртгэлгүй байна.
        </div>
      ) : (
        <div className="space-y-4">
          {teachers.map((teacher) => (
            <TeacherAssignmentPanel
              key={teacher.id}
              teacher={teacher}
              allSubjects={subjects}
              allGroups={groups.map((g) => ({
                id: g.id,
                name: g.name,
                grade: g.grade,
                group_type: g.group_type,
              }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
