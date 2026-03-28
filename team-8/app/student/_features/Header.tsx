import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import NotificationBell from "@/components/NotificationBell";

export default function Header() {
  return (
    <header className="flex h-21.25 w-full shrink-0 items-center justify-between pl-19 pr-30">
      {/* Right Side: Notifications & Profile */}
      <div className="flex items-center gap-4">
        <NotificationBell variant="header" />

        <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
          <AvatarImage src="https://github.com/shadcn.png" alt="User" />
          <AvatarFallback>BT</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
