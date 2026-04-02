import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import Sidebar from "./_features/Sidebar";
import Header from "./_features/Header";
import MobileHeader from "./_features/MobileHeader";
import MobileBottomNav from "./_features/MobileBottomNav";
import StudentShell from "./_features/StudentShell";
import { getStudentProfileDisplay } from "./_features/profile-display";

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

  const profileDisplay = getStudentProfileDisplay(profile);

  return (
    <StudentShell
      sidebar={<Sidebar />}
      header={<Header profile={profileDisplay} />}
      mobileHeader={<MobileHeader profile={profileDisplay} />}
      bottomNav={<MobileBottomNav />}
    >
      {children}
    </StudentShell>
  );
}
