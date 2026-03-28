"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  type Notification,
} from "@/lib/notification/actions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  BellRing,
  CheckCheck,
  FileText,
  GraduationCap,
  Clock,
  Bot,
  Sparkles,
  Loader2,
} from "lucide-react";

const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  exam_submitted: FileText,
  exam_graded: GraduationCap,
  exam_reminder_1day: Clock,
  exam_reminder_1hour: BellRing,
  ai_grading_complete: Bot,
  new_exam_assigned: Sparkles,
  general: Bell,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Дөнгөж сая";
  if (minutes < 60) return `${minutes} мин өмнө`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} цагийн өмнө`;
  const days = Math.floor(hours / 24);
  return `${days} өдрийн өмнө`;
}

interface NotificationBellProps {
  variant?: "header" | "sidebar";
  isCollapsed?: boolean;
}

export default function NotificationBell({
  variant = "header",
  isCollapsed = false,
}: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const count = await getUnreadCount();
      setUnreadCount(count);
    });

    const interval = setInterval(() => {
      void getUnreadCount().then(setUnreadCount);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && !loaded) {
      startTransition(async () => {
        const data = await getNotifications();
        setNotifications(data);
        setLoaded(true);
      });
    }
  }

  async function handleMarkRead(notification: Notification) {
    if (!notification.is_read) {
      await markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    if (notification.link) {
      setOpen(false);
      router.push(notification.link);
    }
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  if (variant === "sidebar") {
    return (
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`group relative flex items-center rounded-[12px] px-4 py-2 text-[15px] font-semibold text-[#7F7F7F] transition-all duration-200 hover:bg-[#F4F6FA] hover:text-[#4078C1] ${
              isCollapsed ? "justify-center gap-0 px-3" : "gap-4"
            }`}
          >
            <Bell
              size={20}
              strokeWidth={2}
              className="text-[#575555] group-hover:text-[#4078C1]"
            />
            {!isCollapsed && <span>Мэдэгдэл</span>}
            {unreadCount > 0 && (
              <span className="absolute right-2 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          className="w-80 p-0"
          sideOffset={12}
        >
          <NotificationList
            notifications={notifications}
            unreadCount={unreadCount}
            isPending={isPending}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm hover:bg-gray-50">
          <Bell className="h-5 w-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        <NotificationList
          notifications={notifications}
          unreadCount={unreadCount}
          isPending={isPending}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
        />
      </PopoverContent>
    </Popover>
  );
}

function NotificationList({
  notifications,
  unreadCount,
  isPending,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: Notification[];
  unreadCount: number;
  isPending: boolean;
  onMarkRead: (n: Notification) => void;
  onMarkAllRead: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Мэдэгдэл</h3>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
              {unreadCount}
            </Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={onMarkAllRead}
          >
            <CheckCheck className="mr-1 h-3 w-3" />
            Бүгдийг уншсан
          </Button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isPending ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Мэдэгдэл алга байна
          </div>
        ) : (
          notifications.map((notification) => {
            const Icon =
              NOTIFICATION_ICONS[notification.type] ?? Bell;

            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => onMarkRead(notification)}
                className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                  !notification.is_read ? "bg-blue-50/50" : ""
                }`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    !notification.is_read
                      ? "bg-blue-100 text-blue-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={`truncate text-sm ${
                        !notification.is_read
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {notification.title}
                    </p>
                    {!notification.is_read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {notification.message}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {timeAgo(notification.created_at)}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
