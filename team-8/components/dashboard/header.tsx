"use client";

import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import PineconeLogo from "@/app/_icons/PineconeLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Profile } from "@/types";
import { LogOut } from "lucide-react";

const roleLabels: Record<string, string> = {
  student: "Сурагч",
  teacher: "Багш",
  admin: "Сургалтын менежер",
};

const roleColors: Record<string, string> = {
  student: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  teacher: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  admin: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
};

export function DashboardHeader({ profile }: { profile: Profile }) {
  const initials = profile.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : profile.email[0].toUpperCase();

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <div className="flex items-center gap-2">
        <PineconeLogo className="h-5 w-5 text-foreground" />
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          PineExam
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className={roleColors[profile.role]}>
          {roleLabels[profile.role]}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{profile.full_name || "Хэрэглэгч"}</p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
            </div>
            <DropdownMenuSeparator />
            <form action={logout}>
              <DropdownMenuItem asChild className="cursor-pointer text-destructive">
                <button type="submit" className="w-full text-left">
                  <span className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Гарах
                  </span>
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
