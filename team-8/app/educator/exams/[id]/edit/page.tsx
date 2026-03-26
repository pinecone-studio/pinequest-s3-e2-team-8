import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getExamById, updateExam } from "@/lib/exam/actions";
import { getExamReadiness } from "@/lib/exam-readiness";
import { getTeacherSubjects } from "@/lib/subject/actions";
import { getExamCreationGroups } from "@/lib/group/actions";
import ExamReadinessPanel from "@/components/exams/exam-readiness-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function EditExamPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error: pageError } = await searchParams;
  const [exam, subjects, groups] = await Promise.all([
    getExamById(id),
    getTeacherSubjects(),
    getExamCreationGroups(),
  ]);

  if (!exam) notFound();
  if (exam.is_published) redirect(`/educator/exams/${id}/questions`);

  const readiness = await getExamReadiness(id, {
    exam: {
      id: exam.id,
      title: exam.title,
      subject_id: exam.subject_id,
      start_time: exam.start_time,
      end_time: exam.end_time,
      duration_minutes: exam.duration_minutes,
      is_published: exam.is_published,
    },
    questions: (exam.questions ?? []).map((question: { type: string; points: number | null }) => ({
      type: question.type,
      points: question.points,
    })),
  });

  const assignedGroupIds = Array.from(
    new Set(
      (Array.isArray(exam.exam_assignments) ? exam.exam_assignments : [])
        .map((assignment: { group_id: string }) => String(assignment.group_id))
        .filter(Boolean)
    )
  );
  const assignedGroupSet = new Set(assignedGroupIds);

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
    if (result?.error) {
      redirect(`/educator/exams/${id}/edit?error=${encodeURIComponent(result.error)}`);
    }
    redirect(`/educator/exams/${id}/questions`);
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Шалгалтын мэдээлэл</CardTitle>
          </CardHeader>
          <CardContent>
            {pageError && (
              <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {pageError}
              </div>
            )}
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
                <Label htmlFor="subject_id">Хичээл *</Label>
                <select
                  id="subject_id"
                  name="subject_id"
                  defaultValue={exam.subject_id ?? "__none"}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
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

              <div className="space-y-3 rounded-xl border p-4">
                <div className="space-y-1">
                  <Label>Оноох анги / бүлгүүд</Label>
                  <p className="text-sm text-muted-foreground">
                    Энэ шалгалтыг ямар анги, сонгон бүлгүүдэд өгөхөө эндээс шинэчилнэ.
                  </p>
                </div>
                {groups.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                    Таны заадаг бүлэг одоогоор олдсонгүй.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {groups.map((group) => (
                      <label
                        key={group.id}
                        className="flex items-start gap-3 rounded-lg border px-3 py-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="group_ids"
                          value={group.id}
                          defaultChecked={assignedGroupSet.has(group.id)}
                          className="mt-0.5 h-4 w-4 rounded border"
                        />
                        <span className="space-y-1">
                          <span className="block font-medium">{group.name}</span>
                          <span className="block text-muted-foreground">
                            {group.grade ? `${group.grade}-р анги` : "Ангийн түвшин заагаагүй"}
                            {group.allowed_subject_ids.length > 0
                              ? ` · ${group.allowed_subject_ids.length} хичээл`
                              : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
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

              <div className="space-y-2">
                <Label htmlFor="max_attempts">Оролдлогын тоо</Label>
                <Input
                  id="max_attempts"
                  name="max_attempts"
                  type="number"
                  min="1"
                  max="10"
                  defaultValue={exam.max_attempts ?? 1}
                />
              </div>

              <div className="space-y-3">
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
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="shuffle_options"
                    name="shuffle_options"
                    defaultChecked={exam.shuffle_options}
                    className="h-4 w-4 rounded border"
                  />
                  <Label
                    htmlFor="shuffle_options"
                    className="cursor-pointer font-normal"
                  >
                    Сонголтуудын дарааллыг холих
                  </Label>
                </div>
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

        {readiness && (
          <ExamReadinessPanel
            readiness={readiness}
            examId={id}
            className="xl:sticky xl:top-6"
          />
        )}
      </div>
    </div>
  );
}
