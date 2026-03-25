"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@/types";
import {
  BarChart3,
  CheckSquare,
  FileText,
  LayoutDashboard,
  Loader2,
  LucideIcon,
  Users,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const navItems: Record<UserRole, NavItem[]> = {
  student: [
    { label: "Хянах самбар", href: "/student", icon: LayoutDashboard },
    { label: "Шалгалтууд", href: "/student/exams", icon: FileText },
    { label: "Үр дүн", href: "/student/results", icon: BarChart3 },
  ],
  teacher: [
    { label: "Хянах самбар", href: "/educator", icon: LayoutDashboard },
    { label: "Шалгалт удирдах", href: "/educator/exams", icon: FileText },
    { label: "Асуултын сан", href: "/educator/question-bank", icon: FileText },
    { label: "Бүлгүүд", href: "/educator/groups", icon: Users },
    { label: "Дүн", href: "/educator/grading", icon: CheckSquare },
  ],
  admin: [
    { label: "Хянах самбар", href: "/admin", icon: LayoutDashboard },
    { label: "Хэрэглэгчид", href: "/admin/users", icon: Users },
  ],
};

export function DashboardSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = navItems[role];
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 border-r border-border/60 bg-slate-50/70 md:block">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <nav className="space-y-6">
          <div className="space-y-2">
            <div className="px-2 text-[11px] font-semibold tracking-[0.18em] text-slate-400">
              MENU
            </div>
            <div className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== `/${role === "teacher" ? "educator" : role}` &&
                    pathname.startsWith(item.href));
                const isPending = pendingHref === item.href && !isActive;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    aria-disabled={isPending ? "true" : undefined}
                    onClick={() => {
                      if (!isActive) setPendingHref(item.href);
                    }}
                    className={[
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-indigo-100/70 text-indigo-700"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                      isPending ? "pointer-events-none opacity-70" : "",
                    ].join(" ")}
                  >
                    <Icon
                      size={18}
                      strokeWidth={2}
                      className={
                        isActive
                          ? "text-indigo-700"
                          : "text-slate-400 group-hover:text-slate-700"
                      }
                    />
                    <span className="truncate">{item.label}</span>
                    {isPending && (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-400" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
}
