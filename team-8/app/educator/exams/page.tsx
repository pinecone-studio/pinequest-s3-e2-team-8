import Link from "next/link";
import { getExams } from "@/lib/exam/actions";
import ExamList from "./_features/ExamList";

export default async function ExamsPage() {
  const exams = await getExams();

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[22px] font-medium tracking-[-0.045em] text-[#111827]">
          Шалгалтууд
        </h2>

        <Link
          href="/educator/create-exam"
          className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[#4D97F8] px-5 text-[14px] font-semibold text-white shadow-[0_16px_28px_rgba(77,151,248,0.26)] transition hover:bg-[#3F88E8]"
        >
          Шалгалт үүсгэх
        </Link>
      </div>

      <ExamList exams={exams as Parameters<typeof ExamList>[0]["exams"]} />
    </div>
  );
}
