import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTeachersWithAssignments } from "@/lib/admin/actions";
import { getSubjects } from "@/lib/subject/actions";
import TeacherDepartmentBoard from "./_features/TeacherDepartmentBoard";

export default async function AdminTeachersPage() {
  const [teachers, subjects] = await Promise.all([
    getTeachersWithAssignments(),
    getSubjects(),
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
          <h2 className="text-2xl font-bold tracking-tight">
            Багш нарын хичээл оноолт
          </h2>
          <p className="text-muted-foreground">
            Багш нарыг тэнхимээр нь харж, тухайн багшид оноосон хичээлүүдийг
            дэлгэрэнгүй удирдана.
          </p>
        </div>
      </div>

      {teachers.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          Багш бүртгэлгүй байна.
        </div>
      ) : (
        <TeacherDepartmentBoard teachers={teachers} allSubjects={subjects} />
      )}
    </div>
  );
}
