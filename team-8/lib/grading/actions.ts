"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getSnapshotQuestionMap,
  getStoredPublishedExamSnapshot,
} from "@/lib/exam-snapshot";
import { canManageExam, isAdminUser } from "@/lib/exam-scope";
import { attachPassagesToAnswers } from "@/lib/question-passages";

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
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

  for (const e of ownExams ?? []) examIdSet.add(e.id);

  // Exams assigned to groups where teacher has an active teaching_assignment
  // (subject must match — group-specific, not subject-wide)
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
      if (validTA) examIdSet.add(ae.exam_id);
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

  return data ?? [];
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

  const canManage = await canManageExam(supabase, exam.id, user.id);
  if (!canManage) return null;

  const snapshot = await getStoredPublishedExamSnapshot(supabase, exam.id);
  const snapshotQuestionMap = getSnapshotQuestionMap(snapshot);

  const [{ data: answers }, proctorEventsResult] = await Promise.all([
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
            ? { ...answer, questions: snapshotQuestion }
            : answer;
        })
      : await attachPassagesToAnswers(supabase, answers ?? []);

  return { session, answers: passageAwareAnswers, proctorEvents };
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
    .select("id, question_id")
    .eq("id", answerId)
    .maybeSingle();

  if (!answer) return { error: "Хариулт олдсонгүй" };

  const { data: question } = await supabase
    .from("questions")
    .select("exam_id")
    .eq("id", answer.question_id)
    .maybeSingle();

  if (!question) return { error: "Асуулт олдсонгүй" };

  const canManage = await canManageExam(
    supabase,
    question.exam_id,
    user.id
  );

  if (!canManage) {
    return { error: "Энэ шалгалтын дүнг засах эрх алга" };
  }

  const { error } = await supabase
    .from("answers")
    .update({
      score,
      is_correct: score > 0,
      feedback,
      graded_by: user.id,
      graded_at: new Date().toISOString(),
    })
    .eq("id", answerId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function finalizeGrading(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("exam_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session олдсонгүй" };

  const canManage = await canManageExam(
    supabase,
    session.exam_id,
    user.id
  );

  if (!canManage) {
    return { error: "Энэ шалгалтын дүнг баталгаажуулах эрх алга" };
  }

  const snapshot = await getStoredPublishedExamSnapshot(
    supabase,
    session.exam_id
  );

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
          .eq("exam_id", session.exam_id),
  ]);

  let totalScore = 0;
  const maxScore = (questions ?? []).reduce(
    (sum, question) => sum + Number(question.points ?? 0),
    0
  );

  for (const a of answers ?? []) {
    totalScore += Number(a.score ?? 0);
  }

  const { error } = await supabase
    .from("exam_sessions")
    .update({
      status: "graded",
      total_score: totalScore,
      max_score: maxScore,
    })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  revalidatePath("/educator/grading");
  revalidatePath(`/educator/grading/${sessionId}`);
  return { success: true, totalScore, maxScore };
}
