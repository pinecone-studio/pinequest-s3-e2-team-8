"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  FilePlus,
  Calendar,
  FileText,
  CheckSquare,
  BarChart3,
  Settings,
  LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/educator", label: "Dashboard", icon: LayoutDashboard },
  { href: "/educator/question-bank", label: "Question Bank", icon: Database },
  { href: "/educator/create-exam", label: "Create Exam", icon: FilePlus },
  { href: "/educator/exam-schedule", label: "Exam Schedule", icon: Calendar },
  { href: "/educator/submissions", label: "Submissions", icon: FileText },
  { href: "/educator/grading", label: "Grading", icon: CheckSquare },
  { href: "/educator/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/educator/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-100 bg-white sticky top-0">
      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto px-3 py-6">
        <nav className="flex flex-col gap-y-1">
          {ALL_NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            // Matches exactly or matches sub-routes (e.g. /educator/question-bank/add)
            const isActive =
              item.href === "/educator"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-[#121212] text-white shadow-md"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={`${
                    isActive
                      ? "text-white"
                      : "text-gray-400 group-hover:text-gray-600"
                  }`}
                />
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
