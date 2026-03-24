import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStudentStats } from "@/lib/dashboard/actions";

export default async function StudentDashboard() {
  const stats = await getStudentStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Хянах самбар</h2>
        <p className="text-muted-foreground">
          Таны шалгалтууд болон үр дүнгийн хураангуй
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Идэвхтэй шалгалт</CardDescription>
            <CardTitle className="text-3xl">{stats.activeExams}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Одоо өгөх боломжтой</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Өгсөн шалгалт</CardDescription>
            <CardTitle className="text-3xl">{stats.completedExams}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Нийт</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Дундаж оноо</CardDescription>
            <CardTitle className="text-3xl">
              {stats.avgScore !== null ? `${stats.avgScore}%` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Бүх шалгалтаар</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
