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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const users = await getAllUsers(role);

  const roleBadge = (r: string) => {
    if (r === "teacher")
      return <Badge className="bg-blue-600">Багш</Badge>;
    if (r === "admin")
      return <Badge className="bg-purple-600">Менежер</Badge>;
    return <Badge variant="secondary">Сурагч</Badge>;
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
                      {new Date(u.created_at).toLocaleDateString("mn-MN")}
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
