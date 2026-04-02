import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import AdminShell from "./_features/AdminShell";
import AdminSidebar from "./_features/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentUser();

  if (!profile) redirect("/login");
  if (profile.role !== "admin") {
    redirect(profile.role === "teacher" ? "/educator" : "/student");
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-zinc-900">
      <div className="flex min-h-screen">
        <AdminSidebar />
        <AdminShell profile={profile}>{children}</AdminShell>
      </div>
    </div>
  );
}
