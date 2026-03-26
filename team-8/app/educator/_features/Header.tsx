"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PineconeLogo from "@/app/_icons/PineconeLogo";
import { Bell } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/types";

export default function Header({ profile }: { profile: Profile }) {
  const router = useRouter();
  const initials = profile.full_name
    ? profile.full_name
        .split(" ")
        .map((name) => name[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : profile.email[0]?.toUpperCase() ?? "U";

  return (
    <header className="sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-slate-200/70 bg-slate-50/70 px-4 md:px-6">
     
      <div className="flex items-center gap-2">
        <PineconeLogo className="h-5 w-5 text-slate-700" />
        <span className="text-sm font-semibold tracking-tight text-slate-800">
          ExamPanel
        </span>
      </div>

      {/* Right Side: Notifications & Profile */}
      <div className="flex items-center gap-4">
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm hover:bg-gray-50">
          <Bell className="h-5 w-5 text-gray-600" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex h-auto items-center gap-2 rounded-md px-2 py-1.5">
              <Avatar>
                {profile.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={profile.full_name || profile.email} />
                ) : null}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">
                {profile.full_name || "Хэрэглэгч"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{profile.full_name || "Хэрэглэгч"}</p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={profile.role === "teacher" ? "/educator/profile" : "/admin"}>
                Профайл
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer text-destructive"
              onClick={async () => {
                await logout();
                router.push("/login");
              }}
            >
              Гарах
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
