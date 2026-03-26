import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, Search, X } from "lucide-react";

export default function Header() {
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

        <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
          <AvatarImage src="https://github.com/shadcn.png" alt="User" />
          <AvatarFallback>BT</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
