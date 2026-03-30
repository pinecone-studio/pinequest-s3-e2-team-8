import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type StudentTone = "neutral" | "success" | "danger" | "info";
type StudentSize = "sm" | "md";

interface Props {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  tone?: StudentTone;
  size?: StudentSize;
  className?: string;
  textClassName?: string;
}

const toneClasses: Record<
  StudentTone,
  { ring: string; fallback: string }
> = {
  neutral: {
    ring: "ring-zinc-300/80",
    fallback: "bg-zinc-100 text-zinc-700",
  },
  success: {
    ring: "ring-emerald-500/80",
    fallback: "bg-emerald-50 text-emerald-700",
  },
  danger: {
    ring: "ring-rose-500/80",
    fallback: "bg-rose-50 text-rose-700",
  },
  info: {
    ring: "ring-sky-400/80",
    fallback: "bg-sky-50 text-sky-700",
  },
};

const sizeClasses: Record<StudentSize, string> = {
  sm: "size-8 ring-offset-1",
  md: "size-9 ring-offset-1.5",
};

function getStudentInitials(name: string, email?: string | null) {
  const source = (name && name !== "—" ? name : email ?? "").trim();
  const parts = source
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "ST";

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function StudentIdentity({
  name,
  email,
  avatarUrl,
  tone = "neutral",
  size = "md",
  className,
  textClassName,
}: Props) {
  const currentTone = toneClasses[tone];

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Avatar
        className={cn(
          "shrink-0 ring-2 ring-offset-white after:border-transparent",
          sizeClasses[size],
          currentTone.ring
        )}
      >
        <AvatarImage src={avatarUrl ?? undefined} alt={name} />
        <AvatarFallback
          className={cn("font-semibold", currentTone.fallback)}
        >
          {getStudentInitials(name, email)}
        </AvatarFallback>
      </Avatar>

      <div className={cn("min-w-0", textClassName)}>
        <p className="truncate font-medium">{name || "Нэргүй сурагч"}</p>
        {email ? (
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        ) : null}
      </div>
    </div>
  );
}
