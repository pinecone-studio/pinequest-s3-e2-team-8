import { createClient } from "@/lib/supabase/server";
import { getAllowedGroupIds } from "@/lib/teacher/permissions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AssignedGroupLite = {
  id: string;
  name: string;
  grade: number | null;
  group_type: string;
};

type LifecycleVariant = "default" | "secondary" | "outline";

export type ExamLifecycleStatus =
  | "draft"
  | "ready"
  | "published"
  | "live"
  | "grading"
  | "finalized";

export type ExamLifecycleSummary = {
  key: ExamLifecycleStatus;
  label: string;
  description: string;
  variant: LifecycleVariant;
};

type ExamLifecycleInput = {
  isPublished: boolean;
  subjectId: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  questionCount: number;
  assignmentCount: number;
  assignedStudentCount: number;
  pendingGradingCount: number;
  gradedCount: number;
  hasBlockingIssues?: boolean;
  nowMs?: number;
};

type LifecycleBatchExam = {
  id: string;
  subject_id: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
  questions?: { count: number }[] | null;
};

type ExamSessionSummary = {
  pendingGradingCount: number;
  gradedCount: number;
};

export type ExamSubjectAssignmentConsistency = {
  invalidGroups: AssignedGroupLite[];
  error: string | null;
};

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getScheduleWindowMinutes(startTime: string, endTime: string) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(Math.floor((end - start) / 60000), 0);
}

function buildInconsistentAssignmentError(groups: AssignedGroupLite[]) {
  const preview = groups
    .slice(0, 3)
    .map((group) => group.name)
    .join(", ");
  const suffix =
    groups.length > 3 ? ` болон өөр ${groups.length - 3} бүлэг` : "";

  return `Одоогоор оноосон ${preview}${suffix} бүлэг шинэ хичээлийн тохиргоонд нийцэхгүй байна. Хичээлээ сольсон бол assignment-аа шинэчилнэ үү.`;
}

function hasReadinessBlockers(input: ExamLifecycleInput) {
  if (typeof input.hasBlockingIssues === "boolean") {
    return input.hasBlockingIssues;
  }

  const scheduleWindowMinutes = getScheduleWindowMinutes(
    input.startTime,
    input.endTime
  );

  return (
    !input.subjectId ||
    scheduleWindowMinutes <= 0 ||
    input.durationMinutes > scheduleWindowMinutes ||
    input.questionCount <= 0 ||
    input.assignmentCount <= 0 ||
    input.assignedStudentCount <= 0
  );
}

export function deriveExamLifecycle(
  input: ExamLifecycleInput
): ExamLifecycleSummary {
  const nowMs = input.nowMs ?? Date.now();
  const startMs = new Date(input.startTime).getTime();
  const endMs = new Date(input.endTime).getTime();
  const blockers = hasReadinessBlockers(input);

  if (!input.isPublished) {
    if (blockers) {
      return {
        key: "draft",
        label: "Ноорог",
        description:
          "Агуулга, хамрах хүрээ, хуваариа бүрэн болгоод нийтлэхэд бэлэн болгоно.",
        variant: "outline",
      };
    }

    return {
      key: "ready",
      label: "Бэлэн",
      description:
        "Шалгалтыг нийтлэхэд шаардлагатай үндсэн нөхцөлүүд бүрэн хангагдсан.",
      variant: "secondary",
    };
  }

  if (!Number.isNaN(startMs) && nowMs < startMs) {
    return {
      key: "published",
      label: "Товлогдсон",
      description: "Шалгалт нийтлэгдсэн бөгөөд эхлэх цагаа хүлээж байна.",
      variant: "outline",
    };
  }

  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs <= endMs) {
    return {
      key: "live",
      label: "Явагдаж байна",
      description: "Сурагчид одоогоор шалгалт өгч байна.",
      variant: "default",
    };
  }

  if (input.pendingGradingCount > 0) {
    return {
      key: "grading",
      label: "Шалгаж байна",
      description: `${input.pendingGradingCount} оролдлого багшийн шалгалтыг хүлээж байна.`,
      variant: "secondary",
    };
  }

  if (input.gradedCount > 0) {
    return {
      key: "finalized",
      label: "Дууссан",
      description: "Шалгалтын дүн баталгаажиж, идэвхтэй шат нь дууссан.",
      variant: "secondary",
    };
  }

  return {
    key: "finalized",
    label: "Дууссан",
    description: "Хуваарь дууссан бөгөөд идэвхтэй оролдлого үлдээгүй байна.",
    variant: "secondary",
  };
}

async function loadAssignedGroups(
  supabase: SupabaseServerClient,
  examId: string
): Promise<AssignedGroupLite[]> {
  const { data } = await supabase
    .from("exam_assignments")
    .select("group_id, student_groups(id, name, grade, group_type)")
    .eq("exam_id", examId)
    .order("assigned_at", { ascending: true });

  return (data ?? [])
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
    }));
}

export async function getExamSubjectAssignmentConsistency(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string,
  subjectId: string | null,
  assignedGroups?: AssignedGroupLite[]
): Promise<ExamSubjectAssignmentConsistency> {
  const groups = assignedGroups ?? (await loadAssignedGroups(supabase, examId));

  if (groups.length === 0) {
    return { invalidGroups: [], error: null };
  }

  if (!subjectId) {
    return {
      invalidGroups: groups,
      error:
        "Хичээл сонгогдоогүй тул оноосон бүлгүүдийг баталгаажуулах боломжгүй байна.",
    };
  }

  const allowedGroupIds = await getAllowedGroupIds(supabase, userId, subjectId);
  if (allowedGroupIds === null) {
    return { invalidGroups: [], error: null };
  }

  const allowedGroupSet = new Set(allowedGroupIds);
  const invalidGroups = groups.filter((group) => !allowedGroupSet.has(group.id));

  return {
    invalidGroups,
    error:
      invalidGroups.length > 0
        ? buildInconsistentAssignmentError(invalidGroups)
        : null,
  };
}

export async function getExamSessionSummary(
  supabase: SupabaseServerClient,
  examId: string
): Promise<ExamSessionSummary> {
  const { data } = await supabase
    .from("exam_sessions")
    .select("status")
    .eq("exam_id", examId)
    .in("status", ["submitted", "graded"]);

  return (data ?? []).reduce<ExamSessionSummary>(
    (summary, session) => {
      if (session.status === "submitted") {
        summary.pendingGradingCount += 1;
      } else if (session.status === "graded") {
        summary.gradedCount += 1;
      }
      return summary;
    },
    {
      pendingGradingCount: 0,
      gradedCount: 0,
    }
  );
}

export async function buildExamLifecycleMap(
  supabase: SupabaseServerClient,
  exams: LifecycleBatchExam[]
) {
  const examIds = exams.map((exam) => exam.id);
  if (examIds.length === 0) {
    return new Map<string, ExamLifecycleSummary>();
  }

  const [{ data: assignmentRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from("exam_assignments")
      .select("exam_id, group_id")
      .in("exam_id", examIds),
    supabase
      .from("exam_sessions")
      .select("exam_id, status")
      .in("exam_id", examIds)
      .in("status", ["submitted", "graded"]),
  ]);

  const groupIds = Array.from(
    new Set((assignmentRows ?? []).map((row) => row.group_id))
  );

  const { data: memberRows } =
    groupIds.length > 0
      ? await supabase
          .from("student_group_members")
          .select("group_id, student_id")
          .in("group_id", groupIds)
      : { data: [] as Array<{ group_id: string; student_id: string }> };

  const studentIdsByGroup = new Map<string, Set<string>>();
  for (const member of memberRows ?? []) {
    const existing = studentIdsByGroup.get(member.group_id) ?? new Set<string>();
    existing.add(member.student_id);
    studentIdsByGroup.set(member.group_id, existing);
  }

  const groupIdsByExam = new Map<string, string[]>();
  for (const row of assignmentRows ?? []) {
    const existing = groupIdsByExam.get(row.exam_id) ?? [];
    existing.push(row.group_id);
    groupIdsByExam.set(row.exam_id, existing);
  }

  const sessionSummaryByExam = new Map<string, ExamSessionSummary>();
  for (const row of sessionRows ?? []) {
    const existing = sessionSummaryByExam.get(row.exam_id) ?? {
      pendingGradingCount: 0,
      gradedCount: 0,
    };

    if (row.status === "submitted") {
      existing.pendingGradingCount += 1;
    } else if (row.status === "graded") {
      existing.gradedCount += 1;
    }

    sessionSummaryByExam.set(row.exam_id, existing);
  }

  const lifecycleMap = new Map<string, ExamLifecycleSummary>();

  for (const exam of exams) {
    const assignedGroupIds = groupIdsByExam.get(exam.id) ?? [];
    const studentIds = new Set<string>();

    for (const groupId of assignedGroupIds) {
      for (const studentId of studentIdsByGroup.get(groupId) ?? []) {
        studentIds.add(studentId);
      }
    }

    const sessionSummary = sessionSummaryByExam.get(exam.id) ?? {
      pendingGradingCount: 0,
      gradedCount: 0,
    };

    lifecycleMap.set(
      exam.id,
      deriveExamLifecycle({
        isPublished: Boolean(exam.is_published),
        subjectId: exam.subject_id,
        startTime: exam.start_time,
        endTime: exam.end_time,
        durationMinutes: Number(exam.duration_minutes),
        questionCount: exam.questions?.[0]?.count ?? 0,
        assignmentCount: assignedGroupIds.length,
        assignedStudentCount: studentIds.size,
        pendingGradingCount: sessionSummary.pendingGradingCount,
        gradedCount: sessionSummary.gradedCount,
      })
    );
  }

  return lifecycleMap;
}
