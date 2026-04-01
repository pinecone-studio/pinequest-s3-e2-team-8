import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import Sidebar from "./_features/Sidebar";
import Header from "./_features/Header";

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
        <main className="flex-1 overflow-y-auto bg-gradient-to-b from-[#e4f3fd] to-[#ffffff] px-16 py-6">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col ">
            <Header profile={profile} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
