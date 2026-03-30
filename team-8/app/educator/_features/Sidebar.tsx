"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/auth/actions";
import {
  Book,
  CheckSquare,
  ChevronLeft,
  FileSpreadsheet,
  HomeIcon,
  LogOut,
  LucideIcon,
  Users,
} from "lucide-react";
import Logo from "@/app/_icons/Logo";
import SideBarImage from "@/app/_icons/SideBarImage";
import NotificationBell from "@/components/NotificationBell";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/educator", label: "Нүүр хуудас", icon: HomeIcon },
  {
    href: "/educator/question-bank",
    label: "Асуултын сан",
    icon: Book,
  },
  {
    href: "/educator/exams",
    label: "Шалгалтууд",
    icon: FileSpreadsheet,
  },
  { href: "/educator/groups", label: "Бүлгүүд", icon: Users },
  { href: "/educator/grading", label: "Дүн шалгах", icon: CheckSquare },
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
              className="rounded-lg p-1 text-gray-600 transition-colors hover:text-brand"
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
            {ALL_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/educator" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center rounded-[12px] px-4 py-2 text-[15px] font-semibold transition-all duration-200 ${
                    isActive
                      ? "border-2 border-brand bg-brand-soft text-brand shadow-sm"
                      : "text-[#7F7F7F] hover:bg-[#F4F6FA] hover:text-brand"
                  } ${isCollapsed ? "justify-center gap-0 px-3" : "gap-4"}`}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={
                      isActive
                        ? "text-brand"
                        : "text-[#575555] group-hover:text-brand"
                    }
                  />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
            <NotificationBell variant="sidebar" isCollapsed={isCollapsed} />
          </nav>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <form action={logout}>
            <button
              type="submit"
              className={`group flex cursor-pointer items-center gap-3 rounded-md transition-colors hover:text-brand ${
                isCollapsed ? "justify-center pl-4 pb-4" : "pl-3"
              }`}
              aria-label="Гарах"
            >
              <LogOut className="h-7 w-7" />
              {!isCollapsed && (
                <p className="text-[15px] font-semibold text-[#7F7F7F] group-hover:text-brand">
                  Гарах
                </p>
              )}
            </button>
          </form>

          {!isCollapsed && <SideBarImage />}
        </div>
      </aside>
    </>
  );
}
