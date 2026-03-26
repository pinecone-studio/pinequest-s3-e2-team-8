import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, Search, X } from "lucide-react";

export default function Header() {
  return (
    <header className="flex h-21.25 w-full shrink-0 items-center justify-between pl-19 pr-30">
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
