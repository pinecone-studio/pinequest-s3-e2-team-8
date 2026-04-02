"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties, type SVGProps } from "react";
import { logout } from "@/lib/auth/actions";
import { ChevronLeft, LogOut } from "lucide-react";
import Logo from "@/app/_icons/Logo";
import SideBarImage from "@/app/_icons/SideBarImage";

interface NavItem {
  href: string;
  label: string;
  iconPath: string;
  iconClassName: string;
}

function getIconMaskStyle(iconPath: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${iconPath})`,
    maskImage: `url(${iconPath})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    backgroundColor: "currentColor",
  };
}

function SidebarItemIcon({
  iconPath,
  className,
}: {
  iconPath: string;
  className: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={getIconMaskStyle(iconPath)}
    />
  );
}

function CloseNavIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2 2l14 14M16 2 2 16"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
    </svg>
  );
}

const allNavItems: NavItem[] = [
  {
    href: "/educator",
    label: "Нүүр хуудас",
    iconPath: "/educator-icons/home.png",
    iconClassName: "h-5 w-5",
  },
  {
    href: "/educator/question-bank",
    label: "Асуултын сан",
    iconPath: "/educator-icons/import_contacts.png",
    iconClassName: "h-5 w-5",
  },
  {
    href: "/educator/exams",
    label: "Шалгалтууд",
    iconPath: "/educator-icons/exams.png",
    iconClassName: "h-5 w-4",
  },
  {
    href: "/educator/groups",
    label: "Ангиуд",
    iconPath: "/educator-icons/classes.png",
    iconClassName: "h-5 w-5",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isExamBuilderRoute =
    pathname === "/educator/create-exam" ||
    (pathname?.startsWith("/educator/exams/") && pathname?.endsWith("/edit"));
  const collapsed = isCollapsed || isExamBuilderRoute;
  const widthClass = isExamBuilderRoute
    ? "w-[54px]"
    : collapsed
      ? "w-[70px]"
      : "w-[260px]";

  return (
    <>
      <div className={`shrink-0 transition-all duration-200 ${widthClass}`} />
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex h-screen flex-col justify-between overflow-y-auto bg-white pt-6 shadow-xl transition-all duration-200 ${
          isExamBuilderRoute ? "px-1.5" : collapsed ? "px-2" : "px-4"
        } ${widthClass}`}
      >
        <div className="flex flex-col gap-6">
          <div
            className={`flex items-start ${
              collapsed ? "justify-center" : "justify-between"
            }`}
          >
            {!collapsed ? <Logo /> : null}
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => {
                if (!isExamBuilderRoute) {
                  setIsCollapsed((prev) => !prev);
                }
              }}
              className="rounded-lg p-1 text-gray-600 transition-colors hover:text-brand"
            >
              {collapsed ? (
                <ChevronLeft size={28} className="rotate-180" />
              ) : (
                <CloseNavIcon className="h-[18px] w-[18px] text-[#3f3f3f]" />
              )}
            </button>
          </div>

          <nav className="flex flex-col gap-2">
            {allNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/educator" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`group flex min-h-[48px] items-center rounded-[12px] px-[16px] py-[11px] text-[15px] font-medium transition-all duration-200 ${
                    isActive
                      ? "border-2 border-[#4A80D8] bg-[#EDF4FF] text-[#4A80D8]"
                      : "text-[#757575] hover:bg-[#F7F9FC] hover:text-[#4A80D8]"
                  } ${collapsed ? "justify-center gap-0 px-3" : "gap-[14px]"}`}
                >
                  <SidebarItemIcon
                    iconPath={item.iconPath}
                    className={`${item.iconClassName} shrink-0 ${
                      isActive
                        ? "text-[#4A80D8]"
                        : "text-[#666666] group-hover:text-[#4A80D8]"
                    }`}
                  />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <form action={logout}>
            <button
              type="submit"
              className={`group flex cursor-pointer items-center gap-3 rounded-md transition-colors hover:text-brand ${
                collapsed ? "justify-center pl-4 pb-4" : "pl-3"
              }`}
              aria-label="Гарах"
              title={collapsed ? "Гарах" : undefined}
            >
              <LogOut className="h-7 w-7" />
              {!collapsed && (
                <p className="text-[15px] font-semibold text-[#7F7F7F] group-hover:text-brand">
                  Гарах
                </p>
              )}
            </button>
          </form>

          {!collapsed && <SideBarImage />}
        </div>
      </aside>
    </>
  );
}
