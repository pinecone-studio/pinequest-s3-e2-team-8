import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import PineconeLogo from "@/app/_icons/PineconeLogo";
import { Bell } from "lucide-react";

export default function Header() {
  return (
    <header className="w-full h-13 border-b border-gray-200 flex items-center justify-between px-6 bg-white">
      {/* LEFT: Title */}
      <div className="flex items-center gap-1">
        <PineconeLogo className="h-5 w-5 text-black" />
        <span className="text-l font-bold text-gray-900 tracking-tight">
          ExamPanel
        </span>
      </div>

      {/* RIGHT: Actions */}
      <div className="flex items-center gap-4">
        {/* Notification */}
        <button className="relative p-2 rounded-md hover:border-black">
          <Bell className="w-4 h-4" />
          <span className="absolute -top-1 -right-1 text-xs bg-black text-white rounded-full px-1">
            3
          </span>
        </button>

        {/* Profile */}
        <div className="flex items-center gap-2  px-3 py-1.5 rounded-md">
          <Avatar>
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium ">teacherName</span>
        </div>
      </div>
    </header>
  );
}
