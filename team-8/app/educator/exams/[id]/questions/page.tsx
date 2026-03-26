import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getExamById, publishExam } from "@/lib/exam/actions";
import { getExamReadiness } from "@/lib/exam-readiness";
import {
  getQuestionPassagesByExam,
  getQuestionsByExam,
} from "@/lib/question/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ExamReadinessPanel from "@/components/exams/exam-readiness-panel";
import AddQuestionForm from "./_features/AddQuestionForm";
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
    questions: questions.map((question) => ({
      type: question.type,
      points: question.points,
    })),
    passageCount: passages.length,
  });

  async function handlePublish() {
    "use server";
    await publishExam(id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link
            href="/educator"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Буцах
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">{exam.title}</h2>
          <div className="flex items-center gap-2">
            <Badge variant={exam.is_published ? "default" : "secondary"}>
              {exam.is_published ? "Нийтлэгдсэн" : "Ноорог"}
            </Badge>
            {exam.subjects?.name && (
              <Badge variant="outline">{exam.subjects.name}</Badge>
            )}
            <Badge variant="outline">{exam.max_attempts} оролдлого</Badge>
            {exam.shuffle_options && (
              <Badge variant="outline">Сонголт холих</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {exam.duration_minutes} минут · {questions.length} асуулт ·{" "}
              {passages.length} passage block
            </span>
          </div>
        </div>

        {!exam.is_published && (
          <form action={handlePublish}>
            <Button
              type="submit"
              className="bg-green-600 hover:bg-green-700"
              disabled={!readiness?.canPublish}
            >
              Нийтлэх
            </Button>
          </form>
        )}
      </div>

      {readiness && <ExamReadinessPanel readiness={readiness} examId={id} />}

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3 className="font-semibold">Асуултууд</h3>
            <QuestionList
              questions={questions}
              examId={id}
              passages={passages}
              isLocked={Boolean(exam.is_published)}
            />
          </div>

          {!exam.is_published && <QuestionImportActions examId={id} />}
        </div>

        {exam.is_published ? (
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
            Энэ шалгалт нийтлэгдсэн тул асуулт нэмэх, устгах, сангаас импортлох
            боломжгүй.
          </div>
        ) : (
          <AddQuestionForm examId={id} passages={passages} />
        )}
      </div>
    </div>
  );
}
