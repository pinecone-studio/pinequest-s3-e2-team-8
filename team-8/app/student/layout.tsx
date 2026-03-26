import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import Sidebar from "./_features/Sidebar";
import Header from "./_features/Header";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentUser();

  if (!profile) redirect("/login");
  if (profile.role !== "student") {
    redirect(profile.role === "teacher" ? "/educator" : "/admin");
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
