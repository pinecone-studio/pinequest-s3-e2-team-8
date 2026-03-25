import Link from "next/link";
import { getAdminStats } from "@/lib/admin/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, GraduationCap, BookOpen, ClipboardList } from "lucide-react";

export default async function AdminDashboard() {
  const stats = await getAdminStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Сургалтын менежер</h2>
          <p className="text-muted-foreground">Системийн ерөнхий удирдлага</p>
        </div>
        <Link href="/admin/users">
          <Button variant="outline">
            <Users className="mr-2 h-4 w-4" />
            Хэрэглэгч удирдах
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Нийт хэрэглэгч</CardDescription>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">{stats.totalUsers}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Бүртгэлтэй</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Багш нар</CardDescription>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">{stats.totalTeachers}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Сурагч: {stats.totalStudents}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Нийт шалгалт</CardDescription>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">{stats.totalExams}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Системд</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Нийт дүн</CardDescription>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">{stats.totalSessions}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Дуусгасан шалгалт</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
