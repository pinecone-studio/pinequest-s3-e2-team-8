"use client";

import type { Profile } from "@/types";
import AdminHeader from "./AdminHeader";

export default function AdminShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 overflow-y-auto bg-[#FAFAFA] px-16">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        <AdminHeader profile={profile} />
        {children}
      </div>
    </main>
  );
}
