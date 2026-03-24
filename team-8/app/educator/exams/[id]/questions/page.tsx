import { notFound } from "next/navigation";
import Link from "next/link";
import { getExamById } from "@/lib/exam/actions";
import { getQuestionsByExam } from "@/lib/question/actions";
import { publishExam } from "@/lib/exam/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AddQuestionForm from "./_features/AddQuestionForm";
import QuestionList from "./_features/QuestionList";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExamQuestionsPage({ params }: Props) {
  const { id } = await params;
  const [exam, questions] = await Promise.all([
    getExamById(id),
    getQuestionsByExam(id),
  ]);

  if (!exam) notFound();

  async function handlePublish() {
    "use server";
    await publishExam(id);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link href="/educator" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" />
            Буцах
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">{exam.title}</h2>
          <div className="flex items-center gap-2">
            <Badge variant={exam.is_published ? "default" : "secondary"}>
              {exam.is_published ? "Нийтлэгдсэн" : "Ноорог"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {exam.duration_minutes} минут · {questions.length} асуулт
            </span>
          </div>
        </div>
        {!exam.is_published && questions.length > 0 && (
          <form action={handlePublish}>
            <Button type="submit" className="bg-green-600 hover:bg-green-700">
              Нийтлэх
            </Button>
          </form>
        )}
      </div>

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="font-semibold">Асуултууд</h3>
          <QuestionList questions={questions} examId={id} />
        </div>
        <div>
          <AddQuestionForm examId={id} />
        </div>
      </div>
    </div>
  );
}
