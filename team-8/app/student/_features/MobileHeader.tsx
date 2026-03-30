"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import NotificationBell from "@/components/NotificationBell";
import Logo from "@/app/_icons/Logo";

export default function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200/60 bg-white/90 px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] backdrop-blur md:hidden">
      <div className="flex items-center gap-2">
        <Logo className="h-6 w-auto" aria-hidden />
        <span className="text-sm font-semibold text-[#343B6E]">Сурагч</span>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell variant="header" />
        <Avatar className="h-9 w-9 border border-white shadow-sm">
          <AvatarImage src="https://github.com/shadcn.png" alt="User" />
          <AvatarFallback>BT</AvatarFallback>
        </Avatar>
        <form action={logout}>
          <button
            type="submit"
            aria-label="Гарах"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm hover:bg-gray-50"
          >
            <LogOut className="h-4 w-4 text-gray-600" />
          </button>
        </form>
      </div>
    </header>
  );
}
