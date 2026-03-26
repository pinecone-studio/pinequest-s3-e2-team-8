import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SyncResult =
  | { success: true; recipientCount: number }
  | { success: false; error: string };

type BulkSyncResult =
  | { success: true; syncedExamIds: string[] }
  | { success: false; error: string };

export async function getPublishedAssignedExamIdsForGroup(
  supabase: SupabaseServerClient,
  groupId: string
) {
  const { data, error } = await supabase
    .from("exam_assignments")
    .select("exam_id, exams!inner(is_published)")
    .eq("group_id", groupId)
    .eq("exams.is_published", true);

  if (error) {
    return { error: error.message, examIds: [] as string[] };
  }

  const examIds = Array.from(
    new Set((data ?? []).map((assignment) => assignment.exam_id))
  );

  return { examIds };
}

export async function syncExamRecipients(
  supabase: SupabaseServerClient,
  examId: string,
  assignedBy?: string | null
): Promise<SyncResult> {
  const { data: assignments, error: assignmentsError } = await supabase
    .from("exam_assignments")
    .select("group_id, assigned_by")
    .eq("exam_id", examId);

  if (assignmentsError) {
    return { success: false, error: assignmentsError.message };
  }

  const groupIds = Array.from(
    new Set((assignments ?? []).map((assignment) => assignment.group_id))
  );

  if (groupIds.length === 0) {
    const { error: deleteAllError } = await supabase
      .from("exam_recipients")
      .delete()
      .eq("exam_id", examId);

    if (deleteAllError) {
      return { success: false, error: deleteAllError.message };
    }

    return { success: true, recipientCount: 0 };
  }

  const { data: members, error: membersError } = await supabase
    .from("student_group_members")
    .select("student_id")
    .in("group_id", groupIds);

  if (membersError) {
    return { success: false, error: membersError.message };
  }

  const studentIds = Array.from(
    new Set((members ?? []).map((member) => member.student_id))
  );

  if (studentIds.length === 0) {
    const { error: deleteAllError } = await supabase
      .from("exam_recipients")
      .delete()
      .eq("exam_id", examId);

    if (deleteAllError) {
      return { success: false, error: deleteAllError.message };
    }

    return { success: true, recipientCount: 0 };
  }

  const { error: deleteError } = await supabase
    .from("exam_recipients")
    .delete()
    .eq("exam_id", examId)
    .not(
      "student_id",
      "in",
      `(${studentIds.map((id) => `"${id}"`).join(",")})`
    );

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  const fallbackAssignedBy =
    assignedBy ?? assignments?.find((assignment) => assignment.assigned_by)?.assigned_by ?? null;

  const rows = studentIds.map((studentId) => ({
    exam_id: examId,
    student_id: studentId,
    assigned_by: fallbackAssignedBy,
  }));

  const { error: insertError } = await supabase
    .from("exam_recipients")
    .upsert(rows, {
      onConflict: "exam_id,student_id",
      ignoreDuplicates: true,
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true, recipientCount: rows.length };
}

export async function syncExamRecipientsForExams(
  supabase: SupabaseServerClient,
  examIds: string[],
  assignedBy?: string | null
): Promise<BulkSyncResult> {
  const uniqueExamIds = Array.from(new Set(examIds));

  for (const examId of uniqueExamIds) {
    const result = await syncExamRecipients(supabase, examId, assignedBy);
    if (!result.success) return result;
  }

  return { success: true, syncedExamIds: uniqueExamIds };
}

export async function syncPublishedExamRecipientsForGroup(
  supabase: SupabaseServerClient,
  groupId: string,
  assignedBy?: string | null
): Promise<BulkSyncResult> {
  const { examIds, error } = await getPublishedAssignedExamIdsForGroup(
    supabase,
    groupId
  );

  if (error) {
    return { success: false, error };
  }

  return syncExamRecipientsForExams(supabase, examIds, assignedBy);
}
