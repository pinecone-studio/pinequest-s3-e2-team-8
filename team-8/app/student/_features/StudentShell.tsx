"use client";

import { usePathname } from "next/navigation";

interface StudentShellProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  mobileHeader: React.ReactNode;
  bottomNav: React.ReactNode;
  children: React.ReactNode;
}

export default function StudentShell({
  sidebar,
  header,
  mobileHeader,
  bottomNav,
  children,
}: StudentShellProps) {
  const pathname = usePathname();
  const hideChrome =
    pathname?.startsWith("/student/exams/") &&
    (pathname.endsWith("/result") || pathname.endsWith("/take") || pathname.includes("/take/run"));

  const mainClassName = hideChrome
    ? "flex-1 p-0 bg-gradient-to-b from-[#f5eef9] to-[#fbfbfb]"
    : "flex-1 bg-gradient-to-b from-[#f5eef9] to-[#fbfbfb] px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4 md:pb-8 md:pl-19 md:pr-30 md:pt-0";

  return (
    <div className="flex min-h-[100dvh] bg-zinc-50 text-zinc-900">
      {!hideChrome && <div className="hidden md:block">{sidebar}</div>}
      <div className="flex min-h-[100dvh] flex-1 flex-col">
        {!hideChrome && mobileHeader}
        {!hideChrome && header}
        <main className={mainClassName}>{children}</main>
        {!hideChrome && bottomNav}
      </div>
    </div>
  );
}
