import { getAllUsers } from "@/lib/admin/actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

function formatDateYMD(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const users = await getAllUsers(role);

  const roleBadge = (r: string) => {
    if (r === "teacher")
      return (
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          Багш
        </Badge>
      );
    if (r === "admin")
      return (
        <Badge variant="secondary" className="bg-purple-500/10 text-purple-700 dark:text-purple-300">
          Менежер
        </Badge>
      );
    return (
      <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 dark:text-blue-300">
        Сурагч
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Буцах
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Хэрэглэгчид</h2>
          <p className="text-muted-foreground">
            Нийт {users.length} хэрэглэгч
          </p>
        </div>
      </div>

      {/* Role filter */}
      <div className="flex gap-2">
        <Link href="/admin/users">
          <Badge
            variant={!role ? "default" : "outline"}
            className="cursor-pointer"
          >
            Бүгд
          </Badge>
        </Link>
        <Link href="/admin/users?role=student">
          <Badge
            variant={role === "student" ? "default" : "outline"}
            className="cursor-pointer"
          >
            Сурагч
          </Badge>
        </Link>
        <Link href="/admin/users?role=teacher">
          <Badge
            variant={role === "teacher" ? "default" : "outline"}
            className="cursor-pointer"
          >
            Багш
          </Badge>
        </Link>
        <Link href="/admin/users?role=admin">
          <Badge
            variant={role === "admin" ? "default" : "outline"}
            className="cursor-pointer"
          >
            Менежер
          </Badge>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Хэрэглэгчдийн жагсаалт</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Хэрэглэгч байхгүй байна.
            </p>
          ) : (
            <div className="divide-y">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium">
                      {u.full_name || "(Нэр байхгүй)"}
                    </p>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {roleBadge(u.role)}
                    <span className="text-xs text-muted-foreground">
                      {formatDateYMD(u.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
