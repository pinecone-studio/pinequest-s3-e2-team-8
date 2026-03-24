"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface NavItem {
  label: string;
  href: string;
}

const navItems: Record<UserRole, NavItem[]> = {
  student: [
    { label: "Хянах самбар", href: "/student" },
    { label: "Шалгалтууд", href: "/student/exams" },
    { label: "Үр дүн", href: "/student/results" },
  ],
  teacher: [
    { label: "Хянах самбар", href: "/educator" },
    { label: "Шалгалт удирдах", href: "/educator/exams" },
    { label: "Асуултын сан", href: "/educator/questions" },
    { label: "Дүн", href: "/educator/grading" },
  ],
  admin: [
    { label: "Хянах самбар", href: "/admin" },
    { label: "Хэрэглэгчид", href: "/admin/users" },
    { label: "Хичээлүүд", href: "/admin/subjects" },
    { label: "Шалгалтууд", href: "/admin/exams" },
    { label: "Тайлан", href: "/admin/reports" },
  ],
};

export function DashboardSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = navItems[role];

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/30 md:block">
      <nav className="flex flex-col gap-1 p-4">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== `/${role === "teacher" ? "educator" : role}` &&
              pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
