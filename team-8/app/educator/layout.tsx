import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import Header from "./_features/Header";
import Sidebar from "./_features/Sidebar";

const ROLE_LABELS: Record<string, string> = {
  student: "Сурагч",
  teacher: "Багш",
  admin: "Сургалтын менежер",
};

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
    <div className="min-h-screen bg-muted/30 text-foreground">
      <Header
        fullName={profile.full_name ?? null}
        email={profile.email ?? null}
        roleLabel={ROLE_LABELS[profile.role] ?? profile.role}
      />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
