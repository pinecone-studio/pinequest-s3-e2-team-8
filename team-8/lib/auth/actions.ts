"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Get user role and redirect accordingly
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Хэрэглэгч олдсонгүй" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role || "student";
  redirect(getRoleRedirect(role));
}

export async function register(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const role = (formData.get("role") as UserRole) || "student";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect(getRoleRedirect(role));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getCurrentUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) return profile;

  return buildFallbackProfile(user);
}

function getRoleRedirect(role: string): string {
  switch (role) {
    case "teacher":
      return "/educator";
    case "admin":
      return "/admin";
    case "student":
    default:
      return "/student";
  }
}

function buildFallbackProfile(user: {
  id: string;
  email?: string | null;
  created_at?: string;
  updated_at?: string;
  user_metadata?: Record<string, unknown>;
}): Profile {
  const metadata = user.user_metadata ?? {};
  const role = normalizeRole(metadata.role);
  const fullName =
    typeof metadata.full_name === "string" && metadata.full_name.trim().length > 0
      ? metadata.full_name
      : user.email?.split("@")[0] || "Хэрэглэгч";
  const now = new Date().toISOString();

  return {
    id: user.id,
    email: user.email ?? "",
    full_name: fullName,
    role,
    avatar_url: null,
    created_at: user.created_at ?? now,
    updated_at: user.updated_at ?? user.created_at ?? now,
  };
}

function normalizeRole(role: unknown): UserRole {
  return role === "teacher" || role === "admin" ? role : "student";
}
