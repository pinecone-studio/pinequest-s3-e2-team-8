import { notFound } from "next/navigation";
import {
  getAvailableExams,
  getGroupById,
  getGroupExamAssignments,
  getGroupScoreOverview,
} from "@/lib/group/actions";
import { createClient } from "@/lib/supabase/server";
import AssignExamSection from "./_features/AssignExamSection";
import GroupResultsBoard from "./_features/GroupResultsBoard";

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

  const [scoreOverview, assignments, availableExams] = await Promise.all([
    getGroupScoreOverview(id),
    getGroupExamAssignments(id),
    getAvailableExams(id),
  ]);

  return (
    <div className="space-y-8 pb-8">
      <GroupResultsBoard
        groupId={id}
        groupName={group.name}
        canManage={isAdmin}
        rows={scoreOverview.rows}
      />

      <div className="rounded-[28px] border border-[#E3EBF4] bg-white/90 p-5 shadow-[0_16px_38px_rgba(171,189,214,0.14)]">
        <AssignExamSection
          groupId={id}
          assignments={assignments}
          availableExams={availableExams}
        />
      </div>
    </div>
  );
}
