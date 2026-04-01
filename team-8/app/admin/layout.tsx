import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

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
    <div className="min-h-screen bg-muted/30 text-foreground">
      <DashboardHeader profile={profile} />
      <div className="flex">
        <DashboardSidebar role="admin" />
        <main className="flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
