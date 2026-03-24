import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEducatorStats } from "@/lib/dashboard/actions";

export default async function EducatorDashboard() {
  const stats = await getEducatorStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Багшийн самбар</h2>
        <p className="text-muted-foreground">
          Шалгалт, асуулт, дүнгийн удирдлага
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Нийт шалгалт</CardDescription>
            <CardTitle className="text-3xl">{stats.totalExams}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Үүсгэсэн</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Асуултын сан</CardDescription>
            <CardTitle className="text-3xl">{stats.totalQuestions}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Нийт асуулт</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Идэвхтэй шалгалт</CardDescription>
            <CardTitle className="text-3xl">{stats.activeExams}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Одоо явагдаж байгаа</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Дүн гаргаагүй</CardDescription>
            <CardTitle className="text-3xl">{stats.pendingGrading}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Шалгах хэрэгтэй</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
