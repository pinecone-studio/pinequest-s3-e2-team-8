"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, HomeIcon, ListCheck } from "lucide-react";

const NAV_ITEMS = [
  { href: "/student", label: "Нүүр", icon: HomeIcon },
  { href: "/student/exams", label: "Шалгалт", icon: FileText },
  { href: "/student/results", label: "Дүн", icon: ListCheck },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/70 bg-white/95 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/student" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? "text-brand"
                  : "text-[#7F7F7F] hover:text-brand"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  isActive ? "bg-brand-soft" : "bg-transparent"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
