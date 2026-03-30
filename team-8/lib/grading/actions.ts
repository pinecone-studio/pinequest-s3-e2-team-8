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
} from "@/lib/notification/actions";
import { recomputeStudentTopicMastery } from "@/lib/student-learning/actions";

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
  nextStatus?: "graded" | "submitted"
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
    status?: "graded" | "submitted";
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

export async function getPendingSubmissions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = await isAdminUser(supabase, user.id);

  // Collect exam IDs: owned + exams in teacher's subject scope
  const examIdSet = new Set<string>();

  if (admin) {
    // Admin sees all pending submissions
    const { data } = await supabase
      .from("exam_sessions")
      .select("*, exams(title), profiles(full_name, email)")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true });
    return data ?? [];
  }

  // Teacher's own exams
  const { data: ownExams } = await supabase
    .from("exams")
    .select("id")
    .eq("created_by", user.id);

  const ownExamIdSet = new Set((ownExams ?? []).map((exam) => exam.id));
  for (const examId of ownExamIdSet) examIdSet.add(examId);

  // Exams assigned to groups where teacher has an active teaching_assignment
  // (subject must match — group-specific, not subject-wide)
  const scopedExamGroups = new Map<string, Set<string>>();
  const { data: teachingRows } = await supabase
    .from("teaching_assignments")
    .select("group_id, subject_id")
    .eq("teacher_id", user.id)
    .eq("is_active", true);

  if (teachingRows && teachingRows.length > 0) {
    const groupIds = [...new Set(teachingRows.map((r) => r.group_id))];

    const { data: assignedExams } = await supabase
      .from("exam_assignments")
      .select("exam_id, group_id, exams(subject_id)")
      .in("group_id", groupIds);

    for (const ae of assignedExams ?? []) {
      const examSubjectId = Array.isArray(ae.exams)
        ? ae.exams[0]?.subject_id
        : (ae.exams as { subject_id: string } | null)?.subject_id;

      // Must match both subject AND the specific group (not just subject-wide)
      const validTA = teachingRows.find(
        (ta) => ta.subject_id === examSubjectId && ta.group_id === ae.group_id
      );
      if (!validTA) continue;
      examIdSet.add(ae.exam_id);
      if (!ownExamIdSet.has(ae.exam_id)) {
        const groups = scopedExamGroups.get(ae.exam_id) ?? new Set<string>();
        groups.add(ae.group_id);
        scopedExamGroups.set(ae.exam_id, groups);
      }
    }
  }

  const examIds = [...examIdSet];
  if (examIds.length === 0) return [];

  const { data } = await supabase
    .from("exam_sessions")
    .select("*, exams(title), profiles(full_name, email)")
    .in("exam_id", examIds)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  const sessions = data ?? [];
  if (sessions.length === 0 || scopedExamGroups.size === 0) {
    return sessions;
  }

  const scopedStudentIds = Array.from(
    new Set(
      sessions
        .filter((session) => !ownExamIdSet.has(session.exam_id))
        .map((session) => session.user_id as string)
    )
  );
  if (scopedStudentIds.length === 0) {
    return sessions;
  }

  const scopedGroupIds = Array.from(
    new Set(
      Array.from(scopedExamGroups.values()).flatMap((groupIds) =>
        Array.from(groupIds)
      )
    )
  );
  const { data: memberRows } = await supabase
    .from("student_group_members")
    .select("student_id, group_id")
    .in("student_id", scopedStudentIds)
    .in("group_id", scopedGroupIds);

  const studentGroups = new Map<string, Set<string>>();
  for (const row of memberRows ?? []) {
    const groups = studentGroups.get(row.student_id) ?? new Set<string>();
    groups.add(row.group_id);
    studentGroups.set(row.student_id, groups);
  }

  return sessions.filter((session) => {
    if (ownExamIdSet.has(session.exam_id)) return true;
    const allowedGroups = scopedExamGroups.get(session.exam_id);
    const currentGroups = studentGroups.get(session.user_id as string);
    if (!allowedGroups || !currentGroups) return false;
    return Array.from(currentGroups).some((groupId) => allowedGroups.has(groupId));
  });
}

export async function getSessionForGrading(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("*, exams(id, title, created_by), profiles(full_name, email)")
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
      .select("*, questions(*)")
      .eq("session_id", sessionId)
      .order("questions(order_index)", { ascending: true }),
    supabase
      .from("proctor_events")
      .select("id, event_type, metadata, created_at")
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
          const questionId = String(
            Array.isArray(answer.questions)
              ? answer.questions[0]?.id
              : answer.questions?.id
          );
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
      : await attachPassagesToAnswers(supabase, answers ?? []);

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

  return { session, answers: variantAwareAnswers, proctorEvents };
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
    await recomputeStudentTopicMastery(session.user_id).catch(() => {});
  }

  revalidateExamResultPaths(question.exam_id, answer.session_id);
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
    .select("exam_id, user_id")
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

  await recomputeStudentTopicMastery(session.user_id).catch(() => {});

  revalidateExamResultPaths(session.exam_id, sessionId);
  return { success: true, totalScore: totals.totalScore, maxScore: totals.maxScore };
}
