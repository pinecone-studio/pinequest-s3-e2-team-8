import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getExamById, publishExam } from "@/lib/exam/actions";
import {
  getQuestionPassagesByExam,
  getQuestionsByExam,
} from "@/lib/question/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AddQuestionForm from "./_features/AddQuestionForm";
import PassageManager from "./_features/PassageManager";
import QuestionImportActions from "./_features/QuestionImportActions";
import QuestionList from "./_features/QuestionList";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExamQuestionsPage({ params }: Props) {
  const { id } = await params;
  const [exam, questions, passages] = await Promise.all([
    getExamById(id),
    getQuestionsByExam(id),
    getQuestionPassagesByExam(id),
  ]);

  if (!exam) notFound();

  const backHref = exam.is_published
    ? "/educator/exams"
    : `/educator/exams/${id}/edit?step=settings`;
  const backLabel = exam.is_published
    ? "Шалгалтын жагсаалт руу буцах"
    : "Шалгалтын мэдээлэл рүү буцах";

  async function handlePublish() {
    "use server";
    await publishExam(id);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href={backHref}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            {backLabel}
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">{exam.title}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={exam.is_published ? "default" : "secondary"}>
              {exam.is_published ? "Нийтлэгдсэн" : "Ноорог"}
            </Badge>
            {exam.subjects?.name && (
              <Badge variant="outline">{exam.subjects.name}</Badge>
            )}
            <span>{exam.duration_minutes} минут</span>
            <span>·</span>
            <span>{questions.length} асуулт</span>
            <span>·</span>
            <span>{passages.length} эх материал</span>
          </div>
        </div>

        {!exam.is_published && (
          <form action={handlePublish}>
            <Button type="submit" className="bg-green-600 hover:bg-green-700">
              Нийтлэх
            </Button>
          </form>
        )}
      </div>

      {exam.is_published ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Нийтлэгдсэн шалгалтыг засах боломжгүй.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <AddQuestionForm examId={id} passages={passages} />
            <PassageManager examId={id} passages={passages} />
          </div>
          <QuestionImportActions examId={id} />
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-semibold">Асуултууд</h3>
        <QuestionList
          questions={questions}
          examId={id}
          passages={passages}
          isLocked={Boolean(exam.is_published)}
        />
      </div>
    </div>
  );
}
