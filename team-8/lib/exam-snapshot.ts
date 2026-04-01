import { createClient } from "@/lib/supabase/server";
import { redis } from "@/lib/redis";
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

function getExamSnapshotCacheKey(examId: string) {
  return `exam:${examId}:snapshot`;
}

function getSnapshotCacheTtlSeconds(snapshot: PublishedExamSnapshot) {
  const closeTimeMs = new Date(snapshot.exam.end_time).getTime();
  if (Number.isNaN(closeTimeMs)) {
    return 3600;
  }

  const remainingSeconds = Math.ceil((closeTimeMs - Date.now()) / 1000);
  return Math.max(3600, Math.min(7 * 24 * 60 * 60, remainingSeconds + 3600));
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
  const selectWithVariant = `${baseSelect}, ai_variant_enabled, ai_variant_mode`;

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
    ai_variant_mode: "per_student",
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
          "id, title, description, subject_id, start_time, end_time, duration_minutes, max_attempts, shuffle_questions, shuffle_options, passing_score, proctoring_mode, device_policy, require_fullscreen, require_camera, identity_verification, evidence_mode, post_exam_similarity_enabled"
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
      proctoring_mode: exam.proctoring_mode,
      device_policy: exam.device_policy,
      require_fullscreen: Boolean(exam.require_fullscreen),
      require_camera: Boolean(exam.require_camera),
      identity_verification: Boolean(exam.identity_verification),
      evidence_mode: exam.evidence_mode,
      post_exam_similarity_enabled: Boolean(exam.post_exam_similarity_enabled),
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
  const cacheKey = getExamSnapshotCacheKey(examId);
  const cached = await redis.get<PublishedExamSnapshot | string>(cacheKey);
  if (cached) {
    if (typeof cached === "string") {
      return JSON.parse(cached) as PublishedExamSnapshot;
    }
    return cached as PublishedExamSnapshot;
  }

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

  const snapshot = (data?.published_snapshot ?? null) as PublishedExamSnapshot | null;
  if (snapshot) {
    await redis.set(cacheKey, JSON.stringify(snapshot), {
      ex: getSnapshotCacheTtlSeconds(snapshot),
    });
  }

  return snapshot;
}

export async function primePublishedExamSnapshotCache(
  examId: string,
  snapshot: PublishedExamSnapshot
) {
  await redis.set(getExamSnapshotCacheKey(examId), JSON.stringify(snapshot), {
    ex: getSnapshotCacheTtlSeconds(snapshot),
  });
}

export async function clearPublishedExamSnapshotCache(examId: string) {
  await redis.del(getExamSnapshotCacheKey(examId));
}

export function getSnapshotQuestionMap(snapshot: PublishedExamSnapshot | null) {
  return new Map(
    (snapshot?.questions ?? []).map((question) => [String(question.id), question])
  );
}
