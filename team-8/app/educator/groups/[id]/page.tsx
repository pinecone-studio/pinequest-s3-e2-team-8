import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getGroupById,
  getGroupMembers,
  getGroupExamAssignments,
  getAvailableExams,
} from "@/lib/group/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Users } from "lucide-react";
import AddMemberForm from "./_features/AddMemberForm";
import MemberList from "./_features/MemberList";
import AssignExamSection from "./_features/AssignExamSection";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GroupDetailPage({ params }: Props) {
  const { id } = await params;
  const [group, members, assignments, availableExams] = await Promise.all([
    getGroupById(id),
    getGroupMembers(id),
    getGroupExamAssignments(id),
    getAvailableExams(),
  ]);

  if (!group) notFound();

  const groupTypeLabel: Record<string, string> = {
    class: "Анги",
    elective: "Сонголт",
    mixed: "Холимог",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/educator/groups"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Бүлгүүд
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">{group.name}</h2>
          <Badge variant="outline">
            {groupTypeLabel[group.group_type] || group.group_type}
          </Badge>
          {group.grade && <Badge variant="secondary">{group.grade}-р анги</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Гишүүд */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h3 className="font-semibold">Гишүүд ({members.length})</h3>
          </div>
          <AddMemberForm groupId={id} />
          <MemberList members={members} groupId={id} />
        </div>

        {/* Шалгалт оноох */}
        <AssignExamSection
          groupId={id}
          assignments={assignments}
          availableExams={availableExams}
        />
      </div>
    </div>
  );
}
