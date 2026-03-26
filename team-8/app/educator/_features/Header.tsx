import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, Search, X } from "lucide-react";

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
    <header className="flex h-21.25 w-full shrink-0 items-center justify-between pl-19 pr-30">
      {/* Search Bar Container */}
      <div className="relative flex items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#808084]" />
          <input
            className="h-10 w-80 rounded-[10px] border-none bg-[#E5E5E5] pl-10 pr-10 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
            placeholder="Хайх"
          />
          <button className="h-4.5 w-4.5 bg-[#808084] absolute right-2.25 top-1/2 flex items-center justify-center rounded-full -translate-y-1/2">
            <X className="h-4.5 w-4.5 text-white" />
          </button>
        </div>
      </div>

      {/* Right Side: Notifications & Profile */}
      <div className="flex items-center gap-4">
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm hover:bg-gray-50">
          <Bell className="h-5 w-5 text-gray-600" />
        </button>

        <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
          <AvatarImage src="https://github.com/shadcn.png" alt="User" />
          <AvatarFallback>BT</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
