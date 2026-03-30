import { notFound, redirect } from "next/navigation";
import { getExamById } from "@/lib/exam/actions";
import { getTeacherSubjects } from "@/lib/subject/actions";
import { getExamCreationGroups } from "@/lib/group/actions";
import ExamForm from "@/app/educator/create-exam/_features/ExamForm";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; step?: string }>;
}

function getNowMs() {
  return Date.now();
}

export default async function EditExamPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error: pageError, step } = await searchParams;
  const [exam, subjects, groups] = await Promise.all([
    getExamById(id),
    getTeacherSubjects(),
    getExamCreationGroups(),
  ]);

  if (!exam) notFound();
  const publishedStartMs = new Date(exam.start_time).getTime();
  const canEditPublishedExam =
    Boolean(exam.is_published) &&
    !Number.isNaN(publishedStartMs) &&
    publishedStartMs > getNowMs();

  if (exam.is_published && !canEditPublishedExam) {
    redirect(`/educator/exams/${id}/questions`);
  }

  const initialGroupIds: string[] = Array.from(
    new Set<string>(
      (Array.isArray(exam.exam_assignments) ? exam.exam_assignments : [])
        .map((assignment: { group_id: string }) => String(assignment.group_id))
        .filter(Boolean)
    )
  );
  const initialStep = step === "settings" ? 2 : step === "schedule" ? 1 : 0;

  return (
    <div className="space-y-6">
      {canEditPublishedExam ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Нийтлэгдсэн боловч хараахан эхлээгүй шалгалтын мэдээлэл, хуваарь,
          assignment-ийг шинэчилж болно. Асуултууд нь түгжигдсэн хэвээр үлдэнэ.
        </div>
      ) : null}

      <ExamForm
        mode="edit"
        examId={id}
        initialStep={initialStep}
        subjects={subjects}
        groups={groups}
        initialTitle={exam.title}
        initialDescription={exam.description ?? ""}
        initialSubjectId={exam.subject_id}
        initialGroupIds={initialGroupIds}
        initialStartTime={exam.start_time}
        initialEndTime={exam.end_time}
        initialDurationMinutes={exam.duration_minutes}
        initialPassingScore={exam.passing_score ?? 60}
        initialMaxAttempts={exam.max_attempts ?? 1}
        initialShuffleQuestions={exam.shuffle_questions}
        initialShuffleOptions={exam.shuffle_options}
        initialError={pageError ?? null}
      />
    </div>
  );
}
