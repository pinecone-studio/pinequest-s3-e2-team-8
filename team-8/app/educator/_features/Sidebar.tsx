"use client";

import Link from "next/link";
import { usePathname } from "next/navigation"; // Added to handle the black background active state
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
    <aside className="flex h-[calc(100vh-4rem)] w-50 flex-col border-r border-gray-100 bg-white">
      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className="space-y-1">
          {" "}
          {/* Tighter spacing between items */}
          {ALL_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            // Checks if current path matches the link
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-gray-50 text-black shadow-sm" // The black active style from your image
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={`${isActive ? "text-gray-700" : "text-gray-400 "}`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
