import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getGroupById,
  getGroupMembers,
  getGroupExamAssignments,
  getAvailableExams,
} from "@/lib/group/actions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Users } from "lucide-react";
import AddMemberForm from "./_features/AddMemberForm";
import MemberList from "./_features/MemberList";
import AssignExamSection from "./_features/AssignExamSection";
import { Input } from "@/components/ui/input";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GroupDetailPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  const group = await getGroupById(id);

  if (!group) notFound();

  const [members, assignments, availableExams] = await Promise.all([
    getGroupMembers(id),
    getGroupExamAssignments(id),
    getAvailableExams(id),
  ]);

  const groupTypeLabel: Record<string, string> = {
    class: "Анги",
    elective: "Сонголт",
    mixed: "Холимог",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between">
        <div className="flex">
          <Search />
          <Input />
        </div>
        <div className="flex items-center gap-2">
          <div>Өгөгдөл татах</div>
          <div>Сурагч нэмэх</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Гишүүд */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h3 className="font-semibold">Гишүүд ({members.length})</h3>
          </div>
          {isAdmin && <AddMemberForm groupId={id} />}
          <MemberList members={members} groupId={id} canManage={isAdmin} />
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
