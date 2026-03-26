"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function getProfilePath(role: string) {
  if (role === "teacher") return "/educator/profile";
  if (role === "student") return "/student/profile";
  return "/admin";
}

export async function updateCurrentProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "student";
  const fullName = String(formData.get("full_name") || "").trim();
  const avatarUrlRaw = String(formData.get("avatar_url") || "").trim();
  const avatarUrl = avatarUrlRaw || null;
  const newPassword = String(formData.get("new_password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (!fullName) {
    return { error: "Нэрээ оруулна уу." };
  }

  if (avatarUrl) {
    try {
      new URL(avatarUrl);
    } catch {
      return { error: "Зургийн холбоос буруу байна." };
    }
  }

  if (newPassword || confirmPassword) {
    if (newPassword.length < 8) {
      return { error: "Нууц үг дор хаяж 8 тэмдэгттэй байна." };
    }

    if (newPassword !== confirmPassword) {
      return { error: "Шинэ нууц үг болон баталгаажуулалт таарахгүй байна." };
    }
  }

  const authUpdatePayload: {
    password?: string;
    data: { full_name: string; avatar_url: string | null };
  } = {
    data: {
      full_name: fullName,
      avatar_url: avatarUrl,
    },
  };

  if (newPassword) {
    authUpdatePayload.password = newPassword;
  }

  const { error: authError } = await supabase.auth.updateUser(authUpdatePayload);
  if (authError) {
    return { error: authError.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/");
  revalidatePath(getProfilePath(role));
  if (role === "teacher") {
    revalidatePath("/educator");
  }
  if (role === "student") {
    revalidatePath("/student");
  }

  return {
    success: true,
    message: newPassword
      ? "Профайл болон нууц үг амжилттай шинэчлэгдлээ."
      : "Профайл амжилттай шинэчлэгдлээ.",
  };
}
