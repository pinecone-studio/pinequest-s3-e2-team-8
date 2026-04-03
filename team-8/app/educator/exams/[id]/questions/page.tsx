import Link from "next/link";
import { Check } from "lucide-react";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { getQuestionPageData } from "@/lib/question/actions";
import AddQuestionForm from "./_features/AddQuestionForm";
import PublishExamButton from "./_features/PublishExamButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExamQuestionsPage({ params }: Props) {
  const { id } = await params;
  const data = await getQuestionPageData(id);
  if (!data) notFound();
  const { exam, questions, passages } = data;
  const steps = [
    { title: "Үндсэн мэдээлэл", href: `/educator/exams/${id}/edit` },
    { title: "Хуваарь", href: `/educator/exams/${id}/edit?step=schedule` },
    { title: "Тохиргоо", href: `/educator/exams/${id}/edit?step=settings` },
    { title: "Асуулт нэмэх", href: null },
  ] as const;

  return (
    <div className="flex w-full max-w-[1240px] flex-col gap-[30px] px-2 md:px-4">
      <div className="shrink-0">
        <Link
          href="/educator/exams"
          className="inline-flex cursor-pointer items-center text-[13px] font-medium text-[#334155] transition hover:text-[#111827]"
          aria-label="Шалгалтууд руу буцах"
        />
      </div>

      <h1 className="-mt-12 shrink-0 text-[18px] font-semibold text-[#111827] md:text-[20px]">
        Шалгалтын мэдээлэл
      </h1>

      <div className="mt-4 grid gap-6 lg:grid-cols-[187px_minmax(0,1fr)] lg:items-start">
        <div className="relative mt-10 w-full max-w-[187px] pt-1">
          <div className="absolute bottom-[18px] left-[15px] top-[18px] w-px bg-[#C7D3E5]" />

          <div className="flex flex-col gap-[56px]">
            {steps.map((step) => {
              const completed = true;
              const active = step.title === "Асуулт нэмэх";
              const content = (
                <>
                  <span
                    className={cn(
                      "relative z-10 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full border transition-colors",
                      completed
                        ? "border-[#3F4F97] bg-[#3F4F97] text-white"
                        : "border-[#D7E1F0] bg-white text-[#7C8BA4]",
                    )}
                  >
                    <Check className="h-4 w-4" strokeWidth={2.8} />
                  </span>

                  <span
                    className={cn(
                      "inline-flex min-h-[42px] w-[150px] items-center text-[14px] font-medium whitespace-nowrap",
                      active ? "text-[#111827]" : "text-[#374151]",
                    )}
                  >
                    {step.title}
                  </span>
                </>
              );

              return step.href ? (
                <Link
                  key={step.title}
                  href={step.href}
                  className="relative flex w-full items-center gap-4 text-left"
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={step.title}
                  className="relative flex w-full items-center gap-4 text-left"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5" id="question-editor-panel">
          {exam.is_published ? (
            <div className="rounded-[28px] border border-dashed border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.16)]">
              Энэ шалгалт нийтлэгдсэн тул шинээр асуулт нэмэх боломжгүй.
            </div>
          ) : (
            <AddQuestionForm
              examId={id}
              passages={passages}
              questions={questions}
              questionNumber={questions.length + 1}
            />
          )}

          <div className="flex flex-nowrap items-center justify-end gap-2">
            <Link
              href={`/educator/exams/${id}/edit`}
              className="inline-flex h-[36px] min-w-[110px] items-center justify-center rounded-[10px] border border-[#D5D9E2] bg-[#6F6F6F] px-5 text-[12px] font-medium text-white transition hover:bg-[#616161]"
            >
              Хадгалах
            </Link>

            <PublishExamButton examId={id} isPublished={Boolean(exam.is_published)} />
          </div>
        </div>
      </div>
    </div>
  );
}
