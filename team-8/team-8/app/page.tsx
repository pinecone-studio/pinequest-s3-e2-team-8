import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";

export default async function Home() {
  const profile = await getCurrentUser();

  if (!profile) {
    redirect("/login");
  }

  // Redirect based on role
  switch (profile.role) {
    case "teacher":
      redirect("/educator");
    case "admin":
      redirect("/admin");
    default:
      redirect("/student");
  }
}
