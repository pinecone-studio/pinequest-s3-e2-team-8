"use client";

import Link from "next/link";
import { usePathname } from "next/navigation"; // Added to handle the black background active state
import { useState } from "react";
import {
  LayoutDashboard,
  Database,
  FilePlus,
  FileText,
  CheckSquare,
  Users,
  CalendarDays,
  Loader2,
  LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MENU_NAV_ITEMS: NavItem[] = [
  { href: "/educator", label: "Хянах самбар", icon: LayoutDashboard },
  { href: "/educator/exams", label: "Шалгалтууд", icon: FileText },
  { href: "/educator/create-exam", label: "Шалгалт үүсгэх", icon: FilePlus },
  { href: "/educator/question-bank", label: "Асуултын сан", icon: Database },
  { href: "/educator/groups", label: "Бүлгүүд", icon: Users },
  { href: "/educator/grading", label: "Дүн шалгах", icon: CheckSquare },
  { href: "/educator/schedule", label: "Хуваарь", icon: CalendarDays },
];

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  { title: "MENU", items: MENU_NAV_ITEMS },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  return (
    <aside className="sticky top-14 flex h-[calc(100dvh-3.5rem)] w-64 flex-col border-r border-border/60 bg-slate-50/70">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <nav className="space-y-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="px-2 text-[11px] font-semibold tracking-[0.18em] text-slate-400">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
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
          ))}
        </nav>
      </div>
    </aside>
  );
}
