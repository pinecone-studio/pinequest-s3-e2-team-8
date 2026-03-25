/**
 * Teaching-assignment-based permission helpers.
 * All functions accept a Supabase client + userId so callers can reuse their
 * already-authenticated client without a second auth round-trip.
 *
 * Return semantics (STRICT mode):
 *   null       → caller is admin → no restriction (allow all)
 *   string[]   → explicit allow-list (empty [] = no access)
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
 * []    → no teacher_subjects rows → teacher has no subject access
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
 * []    → no teaching_assignments rows → teacher has no group access for this subject
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

/**
 * All group IDs where the teacher has any active teaching assignment (any subject).
 * Used for group visibility.
 * null  → admin
 * []    → no teaching assignments at all
 * [...] → groups the teacher teaches in
 */
export async function getAllTeachingGroupIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[] | null> {
  if (await isAdminUser(supabase, userId)) return null;

  const { data } = await supabase
    .from("teaching_assignments")
    .select("group_id")
    .eq("teacher_id", userId)
    .eq("is_active", true);

  const ids = data?.map((r) => r.group_id) ?? [];
  return [...new Set(ids)];
}
