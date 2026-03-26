"use server";

import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const ASSIGN_EXAM_SCHEMA_ERROR =
  "Шалгалт оноох DB шинэчлэл бүрэн идэвхжээгүй байна. 009_assign_exam_to_group_rpc.sql болон 009_rls_teaching_assignment_access.sql migration-уудаа apply хийгээд schema cache-аа refresh хийнэ үү.";

function isRlsOrPermissionError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("violates row-level security policy")
  );
}

function isMissingAssignRpcError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    message.includes("could not find the function public.assign_exam_to_group") ||
    message.includes("schema cache")
  );
}

export async function assignExamToGroupRecord(
  supabase: SupabaseServerClient,
  {
    examId,
    groupId,
    assignedBy,
  }: {
    examId: string;
    groupId: string;
    assignedBy: string;
  }
) {
  const directInsert = await supabase.from("exam_assignments").insert({
    exam_id: examId,
    group_id: groupId,
    assigned_by: assignedBy,
  });

  if (!directInsert.error) {
    return { success: true as const };
  }

  if (directInsert.error.code === "23505") {
    return { error: "Энэ шалгалт аль хэдийн оноогдсон" };
  }

  if (!isRlsOrPermissionError(directInsert.error)) {
    return { error: directInsert.error.message };
  }

  const rpcInsert = await supabase.rpc("assign_exam_to_group", {
    p_exam_id: examId,
    p_group_id: groupId,
    p_assigned_by: assignedBy,
  });

  if (!rpcInsert.error) {
    return { success: true as const };
  }

  if (rpcInsert.error.code === "23505") {
    return { error: "Энэ шалгалт аль хэдийн оноогдсон" };
  }

  if (isMissingAssignRpcError(rpcInsert.error)) {
    return { error: ASSIGN_EXAM_SCHEMA_ERROR };
  }

  return { error: rpcInsert.error.message };
}
