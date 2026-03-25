"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import PineconeLogo from "@/app/_icons/PineconeLogo";
import { logout } from "@/lib/auth/actions";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function getInitials(fullName: string | null | undefined) {
  const safe = String(fullName ?? "").trim();
  if (!safe) return "U";
  const parts = safe.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

export default function Header({
  fullName,
  email,
  roleLabel,
}: {
  fullName: string | null;
  email: string | null;
  roleLabel: string | null;
}) {
  return (
    <header className="sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-slate-200/70 bg-slate-50/70 px-4 md:px-6">
      {/* LEFT: Title */}
      <div className="flex items-center gap-2">
        <PineconeLogo className="h-5 w-5 text-slate-700" />
        <span className="text-sm font-semibold tracking-tight text-slate-800">
          ExamPanel
        </span>
      </div>

      {/* RIGHT: Actions */}
      <div className="flex items-center gap-4">
        {/* Notification */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span
            aria-hidden="true"
            className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-slate-50"
          />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-full px-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900 md:rounded-full"
              aria-label="Profile menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{getInitials(fullName)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium md:inline">
                {fullName || "Хэрэглэгч"}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 md:inline" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{fullName || "Хэрэглэгч"}</p>
              {email && <p className="text-xs text-muted-foreground">{email}</p>}
              {roleLabel && (
                <p className="mt-1 text-xs text-muted-foreground">{roleLabel}</p>
              )}
            </div>
            <DropdownMenuSeparator />
            <form action={logout}>
              <DropdownMenuItem asChild className="cursor-pointer">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Гарах
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
