import { createClient } from "@/lib/supabase/server";
import { getExamAssignmentConflictError } from "@/lib/exam-conflicts";
import {
  deriveExamLifecycle,
  getExamSessionSummary,
  getExamSubjectAssignmentConsistency,
  type ExamLifecycleSummary,
} from "@/lib/exam-lifecycle";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ReadinessStatus = "complete" | "warning" | "blocked";

type ExamSeed = {
  id: string;
  title: string;
  subject_id: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
};

type QuestionSeed = {
  type: string;
  points: number | null;
};

type GroupSummary = {
  id: string;
  name: string;
  grade: number | null;
  group_type: string;
  member_count: number;
};

type ExamReadinessSeed = {
  exam?: ExamSeed;
  questions?: QuestionSeed[];
  passageCount?: number;
};

export type ExamReadinessCheck = {
  key: string;
  label: string;
  description: string;
  status: ReadinessStatus;
};

export type ExamReadiness = {
  examId: string;
  examTitle: string;
  isPublished: boolean;
  lifecycle: ExamLifecycleSummary;
  canPublish: boolean;
  blockedCount: number;
  warningCount: number;
  questionCount: number;
  passageCount: number;
  totalPoints: number;
  essayCount: number;
  autoGradedCount: number;
  assignmentCount: number;
  assignedStudentCount: number;
  scheduleWindowMinutes: number;
  durationMinutes: number;
  assignedGroups: GroupSummary[];
  conflictMessage: string | null;
  checks: ExamReadinessCheck[];
};

function getScheduleWindowMinutes(startTime: string, endTime: string) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(Math.floor((end - start) / 60000), 0);
}

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function getOwnedExamLite(
  supabase: SupabaseServerClient,
  examId: string,
  userId: string
) {
  const { data } = await supabase
    .from("exams")
    .select(
      "id, title, subject_id, start_time, end_time, duration_minutes, is_published"
    )
    .eq("id", examId)
    .eq("created_by", userId)
    .maybeSingle();

  return data;
}

async function loadAssignedGroups(
  supabase: SupabaseServerClient,
  examId: string
): Promise<{ groups: GroupSummary[]; uniqueStudentCount: number }> {
  const { data } = await supabase
    .from("exam_assignments")
    .select("group_id, student_groups(id, name, grade, group_type)")
    .eq("exam_id", examId)
    .order("assigned_at", { ascending: true });

  const rawGroups =
    (data ?? [])
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
      ) ?? [];

  const groups = rawGroups.map((group) => ({
    id: String(group.id),
    name: String(group.name),
    grade: group.grade ? Number(group.grade) : null,
    group_type: String(group.group_type),
    member_count: 0,
  }));

  const groupIds = groups.map((group) => group.id);
  if (groupIds.length === 0) {
    return { groups, uniqueStudentCount: 0 };
  }

  const { data: members } = await supabase
    .from("student_group_members")
    .select("group_id, student_id")
    .in("group_id", groupIds);

  const memberCountMap = new Map<string, Set<string>>();
  const uniqueStudentIds = new Set<string>();
  for (const member of members ?? []) {
    const existing = memberCountMap.get(member.group_id) ?? new Set<string>();
    existing.add(member.student_id);
    memberCountMap.set(member.group_id, existing);
    uniqueStudentIds.add(member.student_id);
  }

  return {
    groups: groups.map((group) => ({
      ...group,
      member_count: memberCountMap.get(group.id)?.size ?? 0,
    })),
    uniqueStudentCount: uniqueStudentIds.size,
  };
}

async function loadQuestionRows(
  supabase: SupabaseServerClient,
  examId: string
): Promise<QuestionSeed[]> {
  const { data } = await supabase
    .from("questions")
    .select("type, points")
    .eq("exam_id", examId);

  return (data ?? []) as QuestionSeed[];
}

async function loadPassageCount(
  supabase: SupabaseServerClient,
  examId: string
) {
  const { count, error } = await supabase
    .from("question_passages")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  if (error?.code === "42P01") return 0;
  return count ?? 0;
}

async function buildExamReadinessForOwner(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string,
  seed?: ExamReadinessSeed
): Promise<ExamReadiness | null> {
  const exam = seed?.exam ?? (await getOwnedExamLite(supabase, examId, userId));
  if (!exam) return null;

  const [assignmentSummary, questionRows, passageCount, sessionSummary] = await Promise.all([
    loadAssignedGroups(supabase, examId),
    seed?.questions ? Promise.resolve(seed.questions) : loadQuestionRows(supabase, examId),
    typeof seed?.passageCount === "number"
      ? Promise.resolve(seed.passageCount)
      : loadPassageCount(supabase, examId),
    getExamSessionSummary(supabase, examId),
  ]);

  const scheduleWindowMinutes = getScheduleWindowMinutes(
    exam.start_time,
    exam.end_time
  );
  const questionCount = questionRows.length;
  const totalPoints = questionRows.reduce(
    (sum, question) => sum + Number(question.points ?? 0),
    0
  );
  const essayCount = questionRows.filter(
    (question) => question.type === "essay"
  ).length;
  const autoGradedCount = questionRows.length - essayCount;
  const assignedGroups = assignmentSummary.groups;
  const assignmentCount = assignedGroups.length;
  const assignedStudentCount = assignmentSummary.uniqueStudentCount;
  const assignmentConsistency = await getExamSubjectAssignmentConsistency(
    supabase,
    userId,
    examId,
    exam.subject_id,
    assignedGroups
  );
  const conflictMessage =
    assignmentCount > 0
      ? (await getExamAssignmentConflictError(supabase, examId)) ?? null
      : null;

  const checks: ExamReadinessCheck[] = [
    {
      key: "subject",
      label: "Хичээл",
      description: exam.subject_id
        ? "Шалгалт хичээлтэйгээ холбогдсон байна."
        : "Нийтлэхийн өмнө хичээлээ сонгоно уу.",
      status: exam.subject_id ? "complete" : "blocked",
    },
    {
      key: "schedule",
      label: "Хуваарь",
      description:
        scheduleWindowMinutes > 0
          ? `Нээлттэй цонх ${scheduleWindowMinutes} минут байна.`
          : "Эхлэх, дуусах цагийн хооронд зөрүү байх ёстой.",
      status: scheduleWindowMinutes > 0 ? "complete" : "blocked",
    },
    {
      key: "duration",
      label: "Шалгалтын хугацаа",
      description:
        scheduleWindowMinutes > 0 &&
        Number(exam.duration_minutes) <= scheduleWindowMinutes
          ? `${exam.duration_minutes} минутын хугацаа нээлттэй цонхонд багтаж байна.`
          : "Шалгалтын хугацаа нь нээлттэй цонхоос урт байна.",
      status:
        scheduleWindowMinutes > 0 &&
        Number(exam.duration_minutes) <= scheduleWindowMinutes
          ? "complete"
          : "blocked",
    },
    {
      key: "questions",
      label: "Асуултууд",
      description:
        questionCount > 0
          ? `${questionCount} асуулт, нийт ${totalPoints} оноотой.`
          : "Нийтлэхийн өмнө дор хаяж 1 асуулт нэмнэ үү.",
      status: questionCount > 0 ? "complete" : "blocked",
    },
    {
      key: "assignments",
      label: "Оноосон бүлэг",
      description:
        assignmentCount > 0
          ? `${assignmentCount} бүлэгт оноосон байна.`
          : "Шалгалтыг дор хаяж 1 бүлэгт онооно уу.",
      status: assignmentCount > 0 ? "complete" : "blocked",
    },
    {
      key: "assignment_scope",
      label: "Хичээл ба assignment",
      description:
        assignmentConsistency.error ??
        "Оноосон бүлгүүд одоогийн хичээл, багшийн teaching assignment-тай нийцэж байна.",
      status: assignmentConsistency.error ? "blocked" : "complete",
    },
    {
      key: "students",
      label: "Хамрагдах сурагчид",
      description:
        assignedStudentCount > 0
          ? `${assignedStudentCount} сурагч шалгалт өгөхөөр хамрагдаж байна.`
          : assignmentCount > 0
          ? "Оноосон бүлгүүдэд одоогоор сурагч байхгүй байна."
          : "Бүлэг оноосны дараа хамрагдах сурагчид тооцогдоно.",
      status: assignedStudentCount > 0 ? "complete" : "blocked",
    },
    {
      key: "conflicts",
      label: "Хуваарийн давхцал",
      description:
        conflictMessage ??
        "Нэг сурагч давхар шалгалт өгөх зөрчил илрээгүй байна.",
      status: conflictMessage ? "blocked" : "complete",
    },
    {
      key: "grading",
      label: "Шалгалтын засалт",
      description:
        essayCount > 0
          ? `${essayCount} essay асуулттай тул багш гараар шалгах хэсэг үлдэнэ.`
          : "Бүх асуулт автоматаар дүнлэгдэх боломжтой.",
      status: essayCount > 0 ? "warning" : "complete",
    },
  ];

  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  const lifecycle = deriveExamLifecycle({
    isPublished: Boolean(exam.is_published),
    subjectId: exam.subject_id,
    startTime: exam.start_time,
    endTime: exam.end_time,
    durationMinutes: Number(exam.duration_minutes),
    questionCount,
    assignmentCount,
    assignedStudentCount,
    pendingGradingCount: sessionSummary.pendingGradingCount,
    gradedCount: sessionSummary.gradedCount,
    hasBlockingIssues: blockedCount > 0,
  });

  return {
    examId: exam.id,
    examTitle: exam.title,
    isPublished: Boolean(exam.is_published),
    lifecycle,
    canPublish: blockedCount === 0 && !exam.is_published,
    blockedCount,
    warningCount,
    questionCount,
    passageCount,
    totalPoints,
    essayCount,
    autoGradedCount,
    assignmentCount,
    assignedStudentCount,
    scheduleWindowMinutes,
    durationMinutes: Number(exam.duration_minutes),
    assignedGroups,
    conflictMessage,
    checks,
  };
}

export async function getExamReadiness(
  examId: string,
  seed?: ExamReadinessSeed
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return buildExamReadinessForOwner(supabase, user.id, examId, seed);
}

export async function getExamPublishGuardError(
  supabase: SupabaseServerClient,
  userId: string,
  examId: string
) {
  const readiness = await buildExamReadinessForOwner(supabase, userId, examId);
  if (!readiness) return "Шалгалт олдсонгүй";

  const firstBlocked = readiness.checks.find(
    (check) => check.status === "blocked"
  );

  return firstBlocked?.description ?? null;
}
