import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getExamById, updateExam } from "@/lib/exam/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditExamPage({ params }: Props) {
  const { id } = await params;
  const exam = await getExamById(id);

  if (!exam) notFound();
  if (exam.is_published) redirect(`/educator/exams/${id}/questions`);

  // datetime-local форматаар хөрвүүлэх (UB цагаар: +08:00 хасаж local болгох)
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    // Asia/Ulaanbaatar: UTC+8
    const offset = 8 * 60;
    const local = new Date(d.getTime() + offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  };

  async function handleUpdate(formData: FormData) {
    "use server";
    const result = await updateExam(id, formData);
    if (!result?.error) redirect(`/educator/exams/${id}/questions`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/educator/exams/${id}/questions`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Буцах
        </Link>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">
          Шалгалт засах
        </h2>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Шалгалтын мэдээлэл</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleUpdate} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Шалгалтын нэр *</Label>
              <Input
                id="title"
                name="title"
                defaultValue={exam.title}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Тайлбар</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={exam.description ?? ""}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_time">Эхлэх цаг *</Label>
                <Input
                  id="start_time"
                  name="start_time"
                  type="datetime-local"
                  defaultValue={toLocal(exam.start_time)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">Дуусах цаг *</Label>
                <Input
                  id="end_time"
                  name="end_time"
                  type="datetime-local"
                  defaultValue={toLocal(exam.end_time)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration_minutes">Хугацаа (минут) *</Label>
                <Input
                  id="duration_minutes"
                  name="duration_minutes"
                  type="number"
                  min="5"
                  max="300"
                  defaultValue={exam.duration_minutes}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passing_score">Тэнцэх оноо (%)</Label>
                <Input
                  id="passing_score"
                  name="passing_score"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={exam.passing_score ?? 60}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="shuffle_questions"
                name="shuffle_questions"
                defaultChecked={exam.shuffle_questions}
                className="h-4 w-4 rounded border"
              />
              <Label
                htmlFor="shuffle_questions"
                className="cursor-pointer font-normal"
              >
                Асуултыг санамсаргүй дарааллаар гаргах
              </Label>
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                Хадгалах
              </Button>
              <Link href={`/educator/exams/${id}/questions`}>
                <Button type="button" variant="outline">
                  Цуцлах
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
