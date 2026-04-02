"use client";

import { usePathname } from "next/navigation";
import type { Profile } from "@/types";
import Header from "./Header";

export default function EducatorShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isExamBuilderPage =
    pathname === "/educator/create-exam" ||
    (pathname?.startsWith("/educator/exams/") && pathname?.endsWith("/edit"));

  return (
    <main
      className={`flex-1 bg-gradient-to-b from-[#e4f3fd] to-[#ffffff] ${
        isExamBuilderPage
          ? "overflow-y-auto px-4 py-6 lg:overflow-hidden lg:px-[72px] lg:py-0 lg:pt-[50px]"
          : "overflow-y-auto px-16"
      }`}
    >
      <div
        className={`flex flex-col ${
          isExamBuilderPage
            ? "w-full lg:mx-auto lg:w-[1240px]"
            : "mx-auto w-full max-w-[1440px]"
        }`}
      >
        {isExamBuilderPage ? (
          <div className="relative">
            <div className="absolute inset-x-0 top-0 z-10">
              <Header profile={profile} />
            </div>
            {children}
          </div>
        ) : (
          <>
            <Header profile={profile} />
            {children}
          </>
        )}
      </div>
    </main>
  );
}
