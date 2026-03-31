import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import Sidebar from "./_features/Sidebar";
import Header from "./_features/Header";
import MobileHeader from "./_features/MobileHeader";
import MobileBottomNav from "./_features/MobileBottomNav";

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
    <div className="flex min-h-[100dvh] bg-zinc-50 text-zinc-900">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex min-h-[100dvh] flex-1 flex-col">
        <MobileHeader />
        <Header />
        <main className="flex-1 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4 md:pb-8 md:pl-19 md:pr-30 md:pt-0">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
