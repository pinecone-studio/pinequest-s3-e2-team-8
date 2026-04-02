"use client";

import Image from "next/image";
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
  essay_review_resolved: GraduationCap,
  general: Bell,
};

const UNREAD_COUNT_CACHE_TTL_MS = 15_000;

let unreadCountCache:
  | {
      value: number;
      fetchedAt: number;
    }
  | null = null;
let unreadCountRequest: Promise<number> | null = null;

async function loadUnreadCount(force = false) {
  const now = Date.now();
  if (
    !force &&
    unreadCountCache &&
    now - unreadCountCache.fetchedAt < UNREAD_COUNT_CACHE_TTL_MS
  ) {
    return unreadCountCache.value;
  }

  if (unreadCountRequest) {
    return unreadCountRequest;
  }

  unreadCountRequest = getUnreadCount()
    .then((count) => {
      unreadCountCache = {
        value: count,
        fetchedAt: Date.now(),
      };
      return count;
    })
    .finally(() => {
      unreadCountRequest = null;
    });

  return unreadCountRequest;
}

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

  function refreshNotifications(forceUnreadCount = false) {
    startTransition(async () => {
      const [data, count] = await Promise.all([
        getNotifications(),
        loadUnreadCount(forceUnreadCount),
      ]);
      setNotifications(data);
      setUnreadCount(count);
    });
  }

  useEffect(() => {
    let isActive = true;

    const syncUnreadCount = (force = false) => {
      void loadUnreadCount(force).then((count) => {
        if (!isActive) {
          return;
        }

        setUnreadCount((currentCount) => {
          if (open && currentCount !== count) {
            startTransition(async () => {
              const data = await getNotifications();
              if (isActive) {
                setNotifications(data);
              }
            });
          }
          return count;
        });
      });
    };

    syncUnreadCount();

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void loadUnreadCount(true).then((count) => {
        if (isActive) {
          setUnreadCount(count);
        }
      });
    }, 30000);

    const handleFocus = () => {
      void loadUnreadCount(true).then((count) => {
        if (isActive) {
          setUnreadCount(count);
        }
      });
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      isActive = false;
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [open, startTransition]);

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      refreshNotifications(true);
    }
  }

  async function handleMarkRead(notification: Notification) {
    if (!notification.is_read) {
      await markAsRead(notification.id);
      unreadCountCache = {
        value: Math.max(0, unreadCount - 1),
        fetchedAt: Date.now(),
      };
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
    unreadCountCache = {
      value: 0,
      fetchedAt: Date.now(),
    };
    setUnreadCount(0);
  }

  if (variant === "sidebar") {
    return (
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`group relative flex items-center rounded-[12px] px-4 py-2 text-[15px] font-semibold text-[#7F7F7F] transition-all duration-200 hover:bg-[#F4F6FA] hover:text-brand ${
              isCollapsed ? "justify-center gap-0 px-3" : "gap-4"
            }`}
          >
            <Bell
              size={20}
              strokeWidth={2}
              className="text-[#575555] group-hover:text-brand"
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
        <button
          type="button"
          aria-label="Мэдэгдэл"
          className="relative flex items-center justify-center transition-colors"
          style={{
            width: "40px",
            height: "40px",
            background: "rgba(255,255,255,0.8)",
            border: "1px solid #D1D1D1",
            borderRadius: "60px",
            flexShrink: 0,
          }}
        >
          <Image
            src="/educator-icons/notifications.png"
            alt=""
            width={12}
            height={16}
            className="h-4 w-3"
            aria-hidden="true"
          />
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
