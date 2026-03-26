import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import ProfileForm from "@/components/profile/profile-form";

export default async function StudentProfilePage() {
  const profile = await getCurrentUser();

  if (!profile) redirect("/login");
  if (profile.role !== "student") {
    redirect(profile.role === "teacher" ? "/educator/profile" : "/admin");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Миний профайл</h2>
        <p className="text-muted-foreground">
          Нэр, зураг болон нууц үгээ шинэчилнэ.
        </p>
      </div>
      <ProfileForm profile={profile} />
    </div>
  );
}
