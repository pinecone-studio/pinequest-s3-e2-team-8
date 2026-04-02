"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/types";

function getDisplayName(profile: Profile) {
  const fullName = profile.full_name.trim();

  if (fullName.length > 0) {
    return fullName.split(/\s+/).at(-1) ?? fullName;
  }

  return profile.email.split("@")[0] || "Админ";
}

function getInitials(profile: Profile) {
  const source = profile.full_name.trim() || profile.email;

  return (
    source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "А"
  );
}

export default function AdminHeader({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const displayName = getDisplayName(profile);
  const initials = getInitials(profile);
  const isAdminHome = pathname === "/admin";
  const showBackLink = pathname?.startsWith("/admin/") && pathname !== "/admin";

  return (
    <header
      className={`flex h-30.5 flex-col gap-5 py-2 sm:flex-row sm:items-center ${
        showBackLink ? "sm:justify-start" : "sm:justify-between"
      }`}
    >
      {showBackLink ? (
        <Link
          href="/admin"
          className="text-[15px] font-medium text-[#111111] hover:text-[#1f2937]"
        >
          <div className="flex items-center gap-1 text-[#030217]">
            <ArrowLeft size={16} />
            Нүүр хуудас руу буцах
          </div>
        </Link>
      ) : isAdminHome ? (
        <div className="h-[49px] w-[344px] min-w-0">
          <h1 className="text-[22px] font-medium leading-tight tracking-[-0.03em] text-[#111111]">
            Сайн байна уу, {displayName}
          </h1>
        </div>
      ) : null}

      <div
        className={`flex h-[40px] w-[100px] items-center justify-end gap-[20px] self-end sm:self-auto ${
          showBackLink ? "sm:ml-auto" : ""
        }`}
      >
        <NotificationBell />

        <Link
          href="/admin"
          aria-label="Админ самбар руу очих"
          className="rounded-full transition-transform duration-200 hover:scale-[1.02]"
        >
          <Avatar className="h-10 w-10 overflow-hidden bg-[#f7d9b5] shadow-[0_10px_24px_rgba(122,103,72,0.14)]">
            {profile.avatar_url ? (
              <AvatarImage
                src={profile.avatar_url}
                alt={profile.full_name || profile.email}
              />
            ) : null}
            <AvatarFallback className="bg-[#f7d9b5] text-sm font-semibold text-[#8a4d20]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
