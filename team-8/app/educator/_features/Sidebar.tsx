"use client";

import Link from "next/link";
import { usePathname } from "next/navigation"; // Added to handle the black background active state
import {
  CheckSquare,
  CalendarDays,
  UserCircle2,
  LucideIcon,
  ChevronLeft,
  HomeIcon,
  Book,
  Plus,
  FileSpreadsheet,
  LogOut,
  FilePlusCorner,
} from "lucide-react";
import Logo from "@/app/_icons/Logo";
import SideBarImage from "@/app/_icons/SideBarImage";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/educator", label: "Нүүр хуудас", icon: HomeIcon },
  { href: "/educator/exams", label: "Асуултын сан", icon: Book },
  { href: "/educator/create-exam", label: "Шинэ асуулт", icon: Plus },
  {
    href: "/educator/question-bank",
    label: "Шинэ шалгалт",
    icon: FilePlusCorner,
  },
  { href: "/educator/groups", label: "Шалгалтууд", icon: FileSpreadsheet },
  { href: "/educator/grading", label: "Дүн шалгах", icon: CheckSquare },
  { href: "/educator/schedule", label: "Хуваарь", icon: CalendarDays },
  { href: "/educator/profile", label: "Профайл", icon: UserCircle2 },
];

const MENU_NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS;

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col h-auto w-65  pt-6 px-3 flex-col border-r border-gray-100 bg-white justify-between shadow-2xl">
      {/* Navigation Items */}
      <div className="flex flex-col gap-6 ">
        <div className="flex justify-between">
          <Logo />
          <ChevronLeft />
        </div>
        <nav className="flex flex-col gap-3">
          {" "}
          {/* Tighter spacing between items */}
          {MENU_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            // Checks if current path matches the link
            const isActive =
              pathname === item.href ||
              (item.href !== "/educator" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 rounded-[10px] leading-tight px-4 py-3.5 text-[16px] font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-[#ECF1F9] border-2 border-[#4078C1] text-[#4078C1] shadow-sm"
                    : "text-[#7F7F7F] hover:text-[#4078C1]"
                }`}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={`${isActive ? "text-[#4078C1]" : "text-[#575555] hover:text-[#4078C1]"}`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto flex items-center justify-between ">
        <div className="flex items-center gap-4 pl-4">
          <LogOut className="w-7 h-7" />
          <p className="font-medium text-[#7F7F7F]">Гарах</p>
        </div>

        <SideBarImage />
      </div>
    </aside>
  );
}
