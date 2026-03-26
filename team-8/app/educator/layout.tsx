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
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header />
        <main className="flex-1 pl-19 pr-30">{children}</main>
      </div>
    </div>
  );
}
