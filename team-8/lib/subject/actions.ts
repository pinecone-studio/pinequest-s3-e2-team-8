"use server";

import { createClient } from "@/lib/supabase/server";

export async function getSubjects() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("subjects")
    .select("id, name, description, created_by, created_at")
    .order("name", { ascending: true });

  return data ?? [];
}
