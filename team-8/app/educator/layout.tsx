import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import Sidebar from "./_features/Sidebar";
import EducatorShell from "./_features/EducatorShell";

export default async function EducatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentUser();

  if (!profile) redirect("/login");
  if (profile.role !== "teacher" && profile.role !== "admin") {
    redirect("/student");
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="flex min-h-screen">
        <Sidebar />
        <EducatorShell profile={profile} >{children}</EducatorShell>
      </div>
    </div>
  );
}
