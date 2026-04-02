"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getSnapshotQuestionMap,
  getStoredPublishedExamSnapshot,
} from "@/lib/exam-snapshot";
import {
  applyStoredVariantToQuestion,
  getSessionQuestionVariantMap,
} from "@/lib/question-variants";
import {
  canManageExamStudent,
  getExamManagementScope,
  isAdminUser,
} from "@/lib/exam-scope";
import { attachPassagesToAnswers } from "@/lib/question-passages";
import {
  notifyStudentOfGrading,
  notifyParentOfGrading,
  notifyStudentOfReviewResolved,
} from "@/lib/notification/actions";
import { enqueueStudentTopicMasteryRefresh } from "@/lib/student-learning/actions";

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function revalidateExamResultPaths(examId: string, sessionId?: string | null) {
  revalidatePath("/educator/grading");
  revalidatePath(`/educator/exams/${examId}/results`);
  revalidatePath("/student");
  revalidatePath("/student/exams");
  revalidatePath("/student/results");
  revalidatePath("/student/schedule");
  revalidatePath("/student/learning");
  revalidatePath(`/student/exams/${examId}/result`);

  if (sessionId) {
    revalidatePath(`/educator/grading/${sessionId}`);
  }
}

async function recalculateSessionTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  examId: string,
  nextStatus?: "graded" | "submitted" | "timed_out"
) {
  const snapshot = await getStoredPublishedExamSnapshot(supabase, examId);

  const [{ data: answers }, { data: questions }] = await Promise.all([
    supabase
      .from("answers")
      .select("score")
      .eq("session_id", sessionId),
    snapshot
      ? Promise.resolve({
          data: snapshot.questions.map((question) => ({
            points: question.points,
          })),
        })
      : supabase
          .from("questions")
          .select("points")
          .eq("exam_id", examId),
  ]);

  const totalScore = (answers ?? []).reduce(
    (sum, answer) => sum + Number(answer.score ?? 0),
    0
  );
  const maxScore = (questions ?? []).reduce(
    (sum, question) => sum + Number(question.points ?? 0),
    0
  );

  const updatePayload: {
    total_score: number;
    max_score: number;
    status?: "graded" | "submitted" | "timed_out";
  } = {
    total_score: totalScore,
    max_score: maxScore,
  };

  if (nextStatus) {
    updatePayload.status = nextStatus;
  }

  const { error } = await supabase
    .from("exam_sessions")
    .update(updatePayload)
    .eq("id", sessionId);

  if (error) {
    return { error: error.message };
  }

  return { totalScore, maxScore };
}

type ManagedExamScope = {
  admin: boolean;
  examIds: string[];
  ownExamIdSet: Set<string>;
  scopedExamGroups: Map<string, Set<string>>;
};

export type PendingReviewSession = {
  id: string;
  exam_id: string;
  user_id: string;
  status: string;
  total_score: number | null;
  max_score: number | null;
  submitted_at: string | null;
  started_at: string | null;
  active_review_count: number;
  latest_review_requested_at: string | null;
  exams?:
    | { title: string }
    | { title: string }[]
    | null;
  profiles?:
    | { full_name: string | null; email: string | null; avatar_url: string | null }
    | { full_name: string | null; email: string | null; avatar_url: string | null }[]
    | null;
  answers?: { id: string; review_requested_at: string | null }[];
};

async function getManagedExamScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ManagedExamScope> {
  const admin = await isAdminUser(supabase, userId);
  if (admin) {
    return {
      admin: true,
      examIds: [],
      ownExamIdSet: new Set<string>(),
      scopedExamGroups: new Map<string, Set<string>>(),
    };
  }

  const examIdSet = new Set<string>();
  const { data: ownExams } = await supabase
    .from("exams")
    .select("id")
    .eq("created_by", userId);

  const ownExamIdSet = new Set((ownExams ?? []).map((exam) => String(exam.id)));
  for (const examId of ownExamIdSet) examIdSet.add(examId);

  const scopedExamGroups = new Map<string, Set<string>>();
  const { data: teachingRows } = await supabase
    .from("teaching_assignments")
    .select("group_id, subject_id")
    .eq("teacher_id", userId)
    .eq("is_active", true);

  if (teachingRows && teachingRows.length > 0) {
    const groupIds = [...new Set(teachingRows.map((row) => row.group_id))];
    const { data: assignedExams } = await supabase
      .from("exam_assignments")
      .select("exam_id, group_id, exams(subject_id)")
      .in("group_id", groupIds);

    for (const assignedExam of assignedExams ?? []) {
      const examSubjectId = Array.isArray(assignedExam.exams)
        ? assignedExam.exams[0]?.subject_id
        : (assignedExam.exams as { subject_id: string } | null)?.subject_id;
      const validAssignment = teachingRows.find(
        (row) =>
          row.subject_id === examSubjectId &&
          row.group_id === assignedExam.group_id,
      );
      if (!validAssignment) continue;

      const examId = String(assignedExam.exam_id);
      examIdSet.add(examId);

      if (!ownExamIdSet.has(examId)) {
        const groups = scopedExamGroups.get(examId) ?? new Set<string>();
        groups.add(String(assignedExam.group_id));
        scopedExamGroups.set(examId, groups);
      }
    }
  }

  return {
    admin: false,
    examIds: [...examIdSet],
    ownExamIdSet,
    scopedExamGroups,
  };
}

async function filterManagedSessionsByGroupScope<
  T extends { exam_id: string; user_id: string }
>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessions: T[],
  scope: ManagedExamScope,
) {
  if (scope.admin || sessions.length === 0 || scope.scopedExamGroups.size === 0) {
    return sessions;
  }

  const scopedStudentIds = Array.from(
    new Set(
      sessions
        .filter((session) => !scope.ownExamIdSet.has(String(session.exam_id)))
        .map((session) => String(session.user_id)),
    ),
  );

  if (scopedStudentIds.length === 0) {
    return sessions;
  }

  const scopedGroupIds = Array.from(
    new Set(
      Array.from(scope.scopedExamGroups.values()).flatMap((groupIds) =>
        Array.from(groupIds),
      ),
    ),
  );

  const { data: memberRows } = await supabase
    .from("student_group_members")
    .select("student_id, group_id")
    .in("student_id", scopedStudentIds)
    .in("group_id", scopedGroupIds);

  const studentGroups = new Map<string, Set<string>>();
  for (const row of memberRows ?? []) {
    const groups = studentGroups.get(String(row.student_id)) ?? new Set<string>();
    groups.add(String(row.group_id));
    studentGroups.set(String(row.student_id), groups);
  }

  return sessions.filter((session) => {
    const examId = String(session.exam_id);
    const studentId = String(session.user_id);

    if (scope.ownExamIdSet.has(examId)) return true;

    const allowedGroups = scope.scopedExamGroups.get(examId);
    const currentGroups = studentGroups.get(studentId);
    if (!allowedGroups || !currentGroups) return false;

    return Array.from(currentGroups).some((groupId) => allowedGroups.has(groupId));
  });
}

function getRequestedReviewMetadata(
  answers:
    | { id: string; review_requested_at: string | null }[]
    | { id: string; review_requested_at: string | null }[]
    | null
    | undefined,
) {
  const requestedAnswers = Array.isArray(answers) ? answers : [];
  const latestReviewRequestedAt = requestedAnswers.reduce<string | null>(
    (latest, answer) => {
      if (!answer.review_requested_at) return latest;
      if (!latest) return answer.review_requested_at;

      return new Date(answer.review_requested_at).getTime() >
        new Date(latest).getTime()
        ? answer.review_requested_at
        : latest;
    },
    null,
  );

  return {
    active_review_count: requestedAnswers.length,
    latest_review_requested_at: latestReviewRequestedAt,
  };
}

export async function getPendingSubmissions(): Promise<PendingReviewSession[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const scope = await getManagedExamScope(supabase, user.id);

  let query = supabase
    .from("exam_sessions")
    .select(
      "id, exam_id, user_id, status, total_score, max_score, submitted_at, started_at, exams!exam_sessions_exam_id_fkey(title), profiles!exam_sessions_user_id_fkey(full_name, email, avatar_url), answers!inner(id, review_requested_at)",
    )
    .eq("answers.review_status", "requested");

  if (!scope.admin) {
    if (scope.examIds.length === 0) return [];
    query = query.in("exam_id", scope.examIds);
  }

  const { data } = await query;
  const sessionMap = new Map<string, Record<string, unknown>>();

  for (const session of data ?? []) {
    const sessionId = String(session.id);
    const requestedAnswers = Array.isArray(session.answers)
      ? (session.answers as { id: string; review_requested_at: string | null }[])
      : [];
    const existing = sessionMap.get(sessionId);
    const mergedAnswers = [
      ...(Array.isArray(existing?.answers)
        ? (existing?.answers as { id: string; review_requested_at: string | null }[])
        : []),
      ...requestedAnswers,
    ];

    sessionMap.set(sessionId, {
      ...(existing ?? {}),
      ...session,
      answers: mergedAnswers,
      ...getRequestedReviewMetadata(mergedAnswers),
    });
  }

  const filteredSessions = await filterManagedSessionsByGroupScope(
    supabase,
    Array.from(sessionMap.values()) as Array<{
      id: string;
      exam_id: string;
      user_id: string;
      status: string;
      total_score: number | null;
      max_score: number | null;
      submitted_at?: string | null;
      started_at?: string | null;
      latest_review_requested_at?: string | null;
      active_review_count: number;
      exams?:
        | { title: string }
        | { title: string }[]
        | null;
      profiles?:
        | {
            full_name: string | null;
            email: string | null;
            avatar_url: string | null;
          }
        | {
            full_name: string | null;
            email: string | null;
            avatar_url: string | null;
          }[]
        | null;
      answers?: { id: string; review_requested_at: string | null }[];
    }>,
    scope,
  );

  return filteredSessions
    .map((session) => ({
      ...session,
      submitted_at: session.submitted_at ?? null,
      started_at: session.started_at ?? null,
      latest_review_requested_at: session.latest_review_requested_at ?? null,
      active_review_count: Number(session.active_review_count ?? 0),
    }))
    .sort((left, right) => {
      const leftTime = new Date(
        String(
          left.latest_review_requested_at ?? left.submitted_at ?? left.started_at ?? 0,
        ),
      ).getTime();
      const rightTime = new Date(
        String(
          right.latest_review_requested_at ??
            right.submitted_at ??
            right.started_at ??
            0,
        ),
      ).getTime();
      return leftTime - rightTime;
    });
}

export async function getGradingStats(pendingReviewCount?: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { toBeGraded: 0, ongoing: 0, graded: 0 };
  }
  const scope = await getManagedExamScope(supabase, user.id);
  const statusScope = ["in_progress", "graded", "timed_out"] as const;
  const toBeGraded = pendingReviewCount ?? (await getPendingSubmissions()).length;

  let query = supabase
    .from("exam_sessions")
    .select("user_id, exam_id, status")
    .in("status", statusScope);

  if (!scope.admin) {
    if (scope.examIds.length === 0) {
      return { toBeGraded, ongoing: 0, graded: 0 };
    }
    query = query.in("exam_id", scope.examIds);
  }

  const { data } = await query;
  const sessions = await filterManagedSessionsByGroupScope(
    supabase,
    (data ?? []).map((session) => ({
      user_id: String(session.user_id),
      exam_id: String(session.exam_id),
      status: String(session.status),
    })),
    scope,
  );

  return sessions.reduce(
    (acc, row) => {
      if (row.status === "in_progress") acc.ongoing += 1;
      if (row.status === "graded" || row.status === "timed_out") acc.graded += 1;
      return acc;
    },
    {
      toBeGraded,
      ongoing: 0,
      graded: 0,
    },
  );
}

export async function getSessionForGrading(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("*, exams(id, title, created_by), profiles(full_name, email, avatar_url)")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return null;

  const exam = getRelationObject(session.exams);
  if (!exam) return null;

  const scope = await getExamManagementScope(supabase, exam.id, user.id);
  if (!scope.canManage) return null;
  if (!scope.manageAll && !scope.managedStudentIds.includes(session.user_id)) {
    return null;
  }

  const snapshot = await getStoredPublishedExamSnapshot(supabase, exam.id);
  const snapshotQuestionMap = getSnapshotQuestionMap(snapshot);

  const [{ data: answers }, proctorEventsResult, questionVariantMap] =
    await Promise.all([
    supabase
      .from("answers")
      .select(
        "id, session_id, question_id, user_id, answer, score, feedback, ai_score, ai_feedback, ai_graded_at, review_status, review_requested_at, review_reason, review_resolved_at, questions(*)",
      )
      .eq("session_id", sessionId)
      .eq("review_status", "requested")
      .order("questions(order_index)", { ascending: true }),
    supabase
      .from("proctor_events")
      .select("id, event_type, metadata, created_at, severity, snapshot_url, derived_risk_delta")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
      getSessionQuestionVariantMap(supabase, sessionId),
    ]);

  const proctorEvents =
    proctorEventsResult.error?.code === "42P01"
      ? []
      : (proctorEventsResult.data ?? []);

  const passageAwareAnswers =
    snapshot && snapshotQuestionMap.size > 0
      ? (answers ?? []).map((answer) => {
          const baseQuestion = getRelationObject(
            answer.questions as
              | Record<string, unknown>
              | Record<string, unknown>[]
              | null,
          );
          const questionId = String(baseQuestion?.id ?? "");
          const snapshotQuestion = snapshotQuestionMap.get(questionId);

          return snapshotQuestion
            ? {
                ...answer,
                questions: applyStoredVariantToQuestion(
                  snapshotQuestion,
                  questionVariantMap.get(questionId)
                ),
              }
            : answer;
        })
      : await attachPassagesToAnswers(
          supabase,
          ((answers ?? []) as unknown) as Array<{
            questions?: ({ passage_id?: string | null } & Record<string, unknown>) | null;
          }>,
        );

  const variantAwareAnswers =
    snapshot && snapshotQuestionMap.size > 0
      ? passageAwareAnswers
      : passageAwareAnswers.map((answer) => {
          const baseQuestion = getRelationObject(
            answer.questions as
              | Record<string, unknown>
              | Record<string, unknown>[]
              | null
          );
          const questionId = String(
            Array.isArray(answer.questions)
              ? answer.questions[0]?.id
              : answer.questions?.id
          );

          return baseQuestion
            ? {
                ...answer,
                questions: applyStoredVariantToQuestion(
                  baseQuestion as {
                    type: string;
                    content: string;
                    content_html: string | null;
                    image_url: string | null;
                    options: string[] | null;
                    correct_answer?: string | null;
                    explanation?: string | null;
                  },
                  questionVariantMap.get(questionId)
                ),
              }
            : answer;
        });

  const reportedAnswers = variantAwareAnswers.filter((answer) => {
    const question = getRelationObject(
      answer.questions as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null
    );

    return question?.type === "essay";
  });

  if (reportedAnswers.length === 0) {
    return null;
  }

  return { session, answers: reportedAnswers, proctorEvents };
}

export async function gradeAnswer(
  answerId: string,
  score: number,
  feedback: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: answer } = await supabase
    .from("answers")
    .select("id, question_id, session_id")
    .eq("id", answerId)
    .maybeSingle();

  if (!answer) return { error: "Хариулт олдсонгүй" };

  const { data: question } = await supabase
    .from("questions")
    .select("exam_id, points")
    .eq("id", answer.question_id)
    .maybeSingle();

  if (!question) return { error: "Асуулт олдсонгүй" };

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("user_id, status")
    .eq("id", answer.session_id)
    .maybeSingle();

  if (!session) return { error: "Session олдсонгүй" };

  const canManage = await canManageExamStudent(
    supabase,
    question.exam_id,
    user.id,
    session.user_id
  );

  if (!canManage) {
    return { error: "Энэ шалгалтын дүнг засах эрх алга" };
  }

  const { error } = await supabase
    .from("answers")
    .update({
      score,
      is_correct: score >= (question.points ?? 1),
      feedback,
      graded_by: user.id,
      graded_at: new Date().toISOString(),
    })
    .eq("id", answerId);

  if (error) return { error: error.message };

  const totals = await recalculateSessionTotals(
    supabase,
    answer.session_id,
    question.exam_id
  );
  if ("error" in totals) {
    return { error: totals.error };
  }

  if (session.status === "graded") {
    await enqueueStudentTopicMasteryRefresh(session.user_id).catch(() => {});
  }

  revalidateExamResultPaths(question.exam_id, answer.session_id);
  return { success: true, totalScore: totals.totalScore, maxScore: totals.maxScore };
}

export async function resolveReportedEssayReviews(
  sessionId: string,
  reviews: Array<{
    answerId: string;
    score: number;
    feedback?: string | null;
  }>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("exam_id, user_id, status, exams(title, subject_id)")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session олдсонгүй" };

  const canManage = await canManageExamStudent(
    supabase,
    session.exam_id,
    user.id,
    session.user_id,
  );
  if (!canManage) {
    return { error: "Энэ шалгалтын review-г шийдэх эрх алга" };
  }

  const { data: requestedAnswers, error: answersError } = await supabase
    .from("answers")
    .select("id, score, ai_score, review_status, questions!inner(points, type)")
    .eq("session_id", sessionId)
    .eq("review_status", "requested");

  if (answersError) return { error: answersError.message };

  const essayAnswers = (requestedAnswers ?? []).filter((answer) => {
    const question = getRelationObject(
      answer.questions as
        | { points: number | null; type: string }
        | { points: number | null; type: string }[]
        | null,
    );

    return question?.type === "essay";
  });

  if (essayAnswers.length === 0) {
    return { error: "Шийдэх review request олдсонгүй" };
  }

  const reviewMap = new Map(reviews.map((review) => [review.answerId, review]));
  const nowIso = new Date().toISOString();

  for (const answer of essayAnswers) {
    const question = getRelationObject(
      answer.questions as
        | { points: number | null; type: string }
        | { points: number | null; type: string }[]
        | null,
    );
    const maxPoints = Number(question?.points ?? 0);
    const review = reviewMap.get(String(answer.id));
    const nextScore = Math.max(
      0,
      Math.min(
        maxPoints,
        review?.score ?? Number(answer.score ?? answer.ai_score ?? 0),
      ),
    );
    const nextFeedback =
      typeof review?.feedback === "string" && review.feedback.trim().length > 0
        ? review.feedback.trim()
        : null;

    const { error: updateError } = await supabase
      .from("answers")
      .update({
        score: nextScore,
        feedback: nextFeedback,
        is_correct: null,
        graded_by: user.id,
        graded_at: nowIso,
        score_source: "teacher",
        review_status: "resolved",
        review_resolved_at: nowIso,
      })
      .eq("id", answer.id)
      .eq("review_status", "requested");

    if (updateError) return { error: updateError.message };
  }

  const nextStatus = session.status === "timed_out" ? "timed_out" : "graded";
  const totals = await recalculateSessionTotals(
    supabase,
    sessionId,
    session.exam_id,
    nextStatus,
  );
  if ("error" in totals) return { error: totals.error };

  const exam = getRelationObject(
    session.exams as
      | { title: string; subject_id: string | null }
      | { title: string; subject_id: string | null }[]
      | null,
  );

  if (exam) {
    notifyStudentOfReviewResolved({
      sessionId,
      userId: session.user_id,
      examId: session.exam_id,
      examTitle: exam.title,
      totalScore: totals.totalScore,
      maxScore: totals.maxScore ?? 0,
    }).catch(() => {});
  }

  await enqueueStudentTopicMasteryRefresh(
    session.user_id,
    exam?.subject_id ?? null,
  ).catch(() => {});

  revalidateExamResultPaths(session.exam_id, sessionId);
  return { success: true, totalScore: totals.totalScore, maxScore: totals.maxScore };
}

export async function finalizeGrading(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("exam_id, user_id, exams(subject_id)")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session олдсонгүй" };

  const canManage = await canManageExamStudent(
    supabase,
    session.exam_id,
    user.id,
    session.user_id
  );

  if (!canManage) {
    return { error: "Энэ шалгалтын дүнг баталгаажуулах эрх алга" };
  }

  const totals = await recalculateSessionTotals(
    supabase,
    sessionId,
    session.exam_id,
    "graded"
  );
  if ("error" in totals) return { error: totals.error };

  // Notify student + parent that grading is complete
  const [{ data: examRow }, { data: studentProfile }] = await Promise.all([
    supabase.from("exams").select("title").eq("id", session.exam_id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", session.user_id).maybeSingle(),
  ]);

  if (examRow && totals.totalScore !== undefined) {
    notifyStudentOfGrading(
      sessionId,
      session.user_id,
      session.exam_id,
      examRow.title,
      totals.totalScore,
      totals.maxScore ?? 0
    ).catch(() => {});

    // Notify parent
    notifyParentOfGrading(
      sessionId,
      session.user_id,
      studentProfile?.full_name || "Сурагч",
      examRow.title,
      totals.totalScore,
      totals.maxScore ?? 0
    ).catch(() => {});
  }

  const sessionExam = getRelationObject(
    session.exams as { subject_id: string | null } | { subject_id: string | null }[] | null
  );
  await enqueueStudentTopicMasteryRefresh(
    session.user_id,
    sessionExam?.subject_id ?? null
  ).catch(() => {});

  revalidateExamResultPaths(session.exam_id, sessionId);
  return { success: true, totalScore: totals.totalScore, maxScore: totals.maxScore };
}
