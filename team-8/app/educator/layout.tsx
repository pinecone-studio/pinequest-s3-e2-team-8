import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import Header from "./_features/Header";
import Sidebar from "./_features/Sidebar";

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
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
