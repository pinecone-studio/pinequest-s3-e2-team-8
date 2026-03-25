/**
 * Teaching-assignment-based permission helpers.
 * All functions accept a Supabase client + userId so callers can reuse their
 * already-authenticated client without a second auth round-trip.
 *
 * Return semantics:
 *   null   → caller is admin → no restriction (allow all)
 *   []     → no assignments defined yet → use ownership fallback
 *   [...ids] → explicit allow-list
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** True when the user has role = 'admin'. */
export async function isAdminUser(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role === "admin";
}

/**
 * Subject IDs the teacher may create exams for.
 * null  → admin, no restriction
 * []    → no teacher_subjects rows yet → permissive (backward-compatible)
 * [...] → explicit allow-list
 */
export async function getAllowedSubjectIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[] | null> {
  if (await isAdminUser(supabase, userId)) return null;

  const { data } = await supabase
    .from("teacher_subjects")
    .select("subject_id")
    .eq("teacher_id", userId);

  return data?.map((r) => r.subject_id) ?? [];
}

/**
 * Group IDs the teacher may assign a given subject's exam to.
 * null  → admin, no restriction
 * []    → no teaching_assignments rows yet → permissive
 * [...] → explicit allow-list
 */
export async function getAllowedGroupIds(
  supabase: SupabaseClient,
  userId: string,
  subjectId: string
): Promise<string[] | null> {
  if (await isAdminUser(supabase, userId)) return null;

  const { data } = await supabase
    .from("teaching_assignments")
    .select("group_id")
    .eq("teacher_id", userId)
    .eq("subject_id", subjectId)
    .eq("is_active", true);

  return data?.map((r) => r.group_id) ?? [];
}
