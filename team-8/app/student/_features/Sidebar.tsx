"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/auth/actions";
import {
  ChevronLeft,
  HomeIcon,
  ListCheck,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import Logo from "@/app/_icons/Logo";
import Tsunh from "@/app/_icons/Tsunh";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const allNavItems: NavItem[] = [
  { href: "/student", label: "Нүүр хуудас", icon: HomeIcon },
  { href: "/student/results", label: "Миний шалгалтууд", icon: ListCheck },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const widthClass = isCollapsed ? "w-[70px]" : "w-[260px]";

  return (
    <>
      <div className={`shrink-0 transition-all duration-200 ${widthClass}`} />
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex h-screen flex-col justify-between overflow-y-auto bg-white pt-6 shadow-xl transition-all duration-200 ${
          isCollapsed ? "px-2" : "px-4"
        } ${widthClass}`}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between">
            {!isCollapsed ? <Logo /> : <div className="h-6 w-6" />}
            <button
              type="button"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="rounded-lg p-1 text-gray-600 transition-colors hover:text-[#4078C1]"
            >
              <ChevronLeft
                size={28}
                className={`transition-transform duration-200 ${
                  isCollapsed ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          <nav className="flex flex-col gap-1.5">
            {allNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/student" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center rounded-[12px] px-4 py-2 text-[15px] font-semibold transition-all duration-200 ${
                    isActive
                      ? "border-2 border-[#4078C1] bg-[#ECF1F9] text-[#4078C1] shadow-sm"
                      : "text-[#7F7F7F] hover:bg-[#F4F6FA] hover:text-[#4078C1]"
                  } ${isCollapsed ? "justify-center gap-0 px-3" : "gap-4"}`}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={
                      isActive
                        ? "text-[#4078C1]"
                        : "text-[#575555] group-hover:text-[#4078C1]"
                    }
                  />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <form action={logout}>
            <button
              type="submit"
              className={`group flex cursor-pointer items-center gap-3 rounded-md transition-colors hover:text-[#4078C1] ${
                isCollapsed ? "justify-center pl-4 pb-4" : "pl-3"
              }`}
              aria-label="Гарах"
            >
              <LogOut className="h-7 w-7" />
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
    </>
  );
}
