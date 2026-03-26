"use client";

import Link from "next/link";
import { usePathname } from "next/navigation"; // Added to handle the black background active state
import { useState } from "react";
import { logout } from "@/lib/auth/actions";
import {
  CalendarDays,
  LucideIcon,
  ChevronLeft,
  HomeIcon,
  Book,
  Plus,
  ListCheck,
  FileSpreadsheet,
  LogOut,
  FilePlusCorner,
  Users,
} from "lucide-react";
import Logo from "@/app/_icons/Logo";
import SideBarImage from "@/app/_icons/SideBarImage";
import Tsunh from "@/app/_icons/Tsunh";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/student", label: "Нүүр хуудас", icon: HomeIcon },
  { href: "/student/results", label: "Миний дүн", icon: ListCheck },
];

const MENU_NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS;

export default function Sidebar() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`flex h-screen flex-col justify-between  bg-white pt-6 shadow-xl transition-all duration-200 ${
        isCollapsed ? "w-[70px] px-2" : "w-[260px] px-4"
      }`}
    >
      {/* Navigation Items */}
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          {!isCollapsed ? <Logo /> : <div className="h-6 w-6" />}
          <button
            type="button"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="rounded-lg  p-1 text-gray-600 transition-colors hover:border-[#4078C1] hover:text-[#4078C1]"
          >
            <ChevronLeft
              size={28}
              className={`transition-transform duration-200 ${
                isCollapsed ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {MENU_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            // Checks if current path matches the link
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center rounded-[12px] px-4 py-3 text-[15px] font-semibold transition-all duration-200 ${
                  isActive
                    ? "border-2 border-[#d1b0fd] bg-[#eee1fe] text-[#7f32f5] shadow-sm"
                    : "text-[#7F7F7F] hover:bg-[#F4F6FA] hover:text-[#7f32f5]"
                } ${isCollapsed ? "justify-center gap-0 px-3" : "gap-4"}`}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={`${
                    isActive
                      ? "text-[#7f32f5]"
                      : "text-[#575555] group-hover:text-[#7f32f5]"
                  }`}
                />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto flex items-center justify-between ">
        <form action={logout}>
          <button
            type="submit"
            className={`group flex items-center gap-3 cursor-pointer rounded-md transition-colors hover:text-[#4078C1] ${
              isCollapsed ? "justify-center pl-4 pb-4" : "pl-3"
            }`}
            aria-label="Гарах"
          >
            <LogOut className="w-7 h-7" />
            {!isCollapsed && (
              <p className="text-[15px] font-semibold text-[#7F7F7F] group-hover:text-[#4078C1]">
                Гарах
              </p>
            )}
          </button>
        </form>

        {!isCollapsed && <Tsunh />}
      </div>
    </aside>
  );
}
