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

  const hideChrome = Boolean(
    pathname?.startsWith("/student/exams/") &&
    (pathname.endsWith("/result") ||
      pathname.endsWith("/take") ||
      pathname.includes("/take/run")),
  );
  const hideDesktopHeader = pathname === "/student/learning";

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-[#f5eef9] to-[#fbfbfb] text-zinc-900">
      <div className="flex min-h-[100dvh] w-full">
        {!hideChrome && (
          <div className="hidden md:block md:shrink-0">{sidebar}</div>
        )}

        <div className="flex min-h-[100dvh] flex-1 flex-col">
          {!hideChrome && mobileHeader}

          {hideChrome ? (
            <main className="flex-1 p-0">{children}</main>
          ) : (
            <main className="flex-1 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4 md:pb-10 md:pt-0">
              {/* Desktop */}
              <div className="hidden md:block">
                <div className="px-6 pt-6 md:px-10 lg:px-14 xl:px-[100px]">
                  <div className="w-full">
                    {!hideDesktopHeader && header}
                    <div className="pt-6">{children}</div>
                  </div>
                </div>
              </div>

              {/* Mobile */}
              <div className="px-4 md:hidden">{children}</div>
            </main>
          )}

          {!hideChrome && bottomNav}
        </div>
      </div>
    </div>
  );
}
