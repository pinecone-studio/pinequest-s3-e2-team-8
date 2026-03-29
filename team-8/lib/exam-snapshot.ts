import { createClient } from "@/lib/supabase/server";
import { attachPassagesToQuestions, getQuestionPassagesByExam } from "@/lib/question-passages";
import { isQuestionVariantSchemaMissing } from "@/lib/question-variants";
import type { PublishedExamSnapshot, Question, QuestionPassage } from "@/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const SNAPSHOT_COLUMN_MISSING_CODES = new Set(["42703", "PGRST204", "PGRST205"]);

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isSnapshotColumnMissing(errorCode?: string | null) {
  return Boolean(errorCode && SNAPSHOT_COLUMN_MISSING_CODES.has(errorCode));
}

export function isSnapshotColumnMissingError(errorCode?: string | null) {
  return isSnapshotColumnMissing(errorCode);
}

async function loadSnapshotQuestions(
  supabase: SupabaseServerClient,
  examId: string
) {
  const baseSelect =
    "id, exam_id, passage_id, type, content, content_html, image_url, options, correct_answer, points, order_index, explanation, created_at";
  const selectWithVariant = `${baseSelect}, ai_variant_enabled`;

  const initial = await supabase
    .from("questions")
    .select(selectWithVariant)
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  if (!initial.error) {
    return (initial.data ?? []) as Question[];
  }

  if (!isQuestionVariantSchemaMissing(initial.error.code, initial.error.message)) {
    throw new Error(initial.error.message);
  }

  const fallback = await supabase
    .from("questions")
    .select(baseSelect)
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return (fallback.data ?? []).map((question) => ({
    ...question,
    ai_variant_enabled: false,
  })) as Question[];
}

async function loadAssignedGroups(
  supabase: SupabaseServerClient,
  examId: string
) {
  const { data } = await supabase
    .from("exam_assignments")
    .select("group_id, student_groups(id, name, grade, group_type)")
    .eq("exam_id", examId)
    .order("assigned_at", { ascending: true });

  const groups = (data ?? [])
    .map((row) => getRelationObject(row.student_groups))
    .filter(
      (
        group
      ): group is {
        id: string;
        name: string;
        grade: number | null;
        group_type: string;
      } => Boolean(group)
    )
    .map((group) => ({
      id: String(group.id),
      name: String(group.name),
      grade: group.grade ? Number(group.grade) : null,
      group_type: String(group.group_type),
      member_count: 0,
    }));

  const groupIds = groups.map((group) => group.id);
  if (groupIds.length === 0) {
    return {
      groups,
      assignedStudentCount: 0,
    };
  }

  const { data: members } = await supabase
    .from("student_group_members")
    .select("group_id, student_id")
    .in("group_id", groupIds);

  const membersByGroup = new Map<string, Set<string>>();
  const assignedStudentIds = new Set<string>();

  for (const member of members ?? []) {
    const existing = membersByGroup.get(member.group_id) ?? new Set<string>();
    existing.add(member.student_id);
    membersByGroup.set(member.group_id, existing);
    assignedStudentIds.add(member.student_id);
  }

  return {
    groups: groups.map((group) => ({
      ...group,
      member_count: membersByGroup.get(group.id)?.size ?? 0,
    })),
    assignedStudentCount: assignedStudentIds.size,
  };
}

export async function buildPublishedExamSnapshot(
  supabase: SupabaseServerClient,
  examId: string
): Promise<PublishedExamSnapshot | null> {
  const [{ data: exam }, rawQuestions, passages, assignmentSummary] =
    await Promise.all([
      supabase
        .from("exams")
        .select(
          "id, title, description, subject_id, start_time, end_time, duration_minutes, max_attempts, shuffle_questions, shuffle_options, passing_score"
        )
        .eq("id", examId)
        .maybeSingle(),
      loadSnapshotQuestions(supabase, examId),
      getQuestionPassagesByExam(supabase, examId),
      loadAssignedGroups(supabase, examId),
    ]);

  if (!exam) return null;

  const questions = (await attachPassagesToQuestions(
    supabase,
    (rawQuestions ?? []).map((question) => ({
      ...question,
      points: Number(question.points ?? 0),
    }))
  )) as Question[];

  const passageList = passages as QuestionPassage[];
  const publishedAt = new Date().toISOString();
  const totalPoints = questions.reduce(
    (sum, question) => sum + Number(question.points ?? 0),
    0
  );

  return {
    version: 1,
    created_at: publishedAt,
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description ?? null,
      subject_id: exam.subject_id ?? null,
      start_time: exam.start_time,
      end_time: exam.end_time,
      duration_minutes: Number(exam.duration_minutes),
      max_attempts: Number(exam.max_attempts ?? 1),
      shuffle_questions: Boolean(exam.shuffle_questions),
      shuffle_options: Boolean(exam.shuffle_options),
      passing_score:
        exam.passing_score === null ? null : Number(exam.passing_score),
      published_at: publishedAt,
    },
    questions,
    passages: passageList,
    assigned_groups: assignmentSummary.groups,
    stats: {
      question_count: questions.length,
      passage_count: passageList.length,
      total_points: totalPoints,
      assignment_count: assignmentSummary.groups.length,
      assigned_student_count: assignmentSummary.assignedStudentCount,
      has_essay_questions: questions.some((question) => question.type === "essay"),
    },
  };
}

export async function getStoredPublishedExamSnapshot(
  supabase: SupabaseServerClient,
  examId: string
) {
  const { data, error } = await supabase
    .from("exams")
    .select("published_snapshot")
    .eq("id", examId)
    .maybeSingle();

  if (error) {
    if (isSnapshotColumnMissing(error.code)) {
      return null;
    }
    throw new Error(error.message);
  }

  return (data?.published_snapshot ?? null) as PublishedExamSnapshot | null;
}

export function getSnapshotQuestionMap(snapshot: PublishedExamSnapshot | null) {
  return new Map(
    (snapshot?.questions ?? []).map((question) => [String(question.id), question])
  );
}
