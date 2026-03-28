import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getExamById } from "@/lib/exam/actions";
import {
  getQuestionPassagesByExam,
  getQuestionsByExam,
} from "@/lib/question/actions";
import AddQuestionForm from "./_features/AddQuestionForm";
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

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-2 md:px-4">
      <div className="space-y-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-950"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950 md:text-4xl">
            Шалгалтын асуултууд
          </h1>
          <p className="text-base text-zinc-500">
            Асуултуудаа нэмж, зөв хариултыг сонгоно уу
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] lg:items-start">
        <div>
          {exam.is_published ? (
            <div className="rounded-[28px] border border-dashed border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.16)]">
              Энэ шалгалт нийтлэгдсэн тул шинээр асуулт нэмэх боломжгүй.
            </div>
          ) : (
            <AddQuestionForm examId={id} passages={passages} />
          )}
        </div>

        <div className="lg:sticky lg:top-6">
          <div className="mb-4">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
              Нэмсэн асуултууд
            </h2>
          </div>
          <QuestionList
            questions={questions}
            examId={id}
            passages={passages}
            isLocked={Boolean(exam.is_published)}
          />
        </div>
      </div>
    </div>
  );
}
