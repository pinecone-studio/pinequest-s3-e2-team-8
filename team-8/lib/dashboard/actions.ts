"use server";

import { createClient } from "@/lib/supabase/server";

export async function getEducatorStats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { totalExams: 0, totalQuestions: 0, activeExams: 0, pendingGrading: 0 };

  const now = new Date().toISOString();

  // Own exam IDs (for totalExams, totalQuestions, activeExams)
  const { data: ownExams } = await supabase
    .from("exams")
    .select("id")
    .eq("created_by", user.id);
  const ownExamIds = (ownExams ?? []).map((e) => e.id);

  // Teaching-scope exam IDs (for pendingGrading — includes admin-created exams assigned to teacher's groups)
  const teachingScopeExamIds = new Set<string>(ownExamIds);

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
      const subjectId = Array.isArray(ae.exams)
        ? ae.exams[0]?.subject_id
        : (ae.exams as { subject_id: string } | null)?.subject_id;
      // Must match both subject AND group (not just subject)
      if (teachingRows.find((ta) => ta.subject_id === subjectId && ta.group_id === ae.group_id)) {
        teachingScopeExamIds.add(ae.exam_id);
      }
    }
  }

  const scopeExamIds = [...teachingScopeExamIds];

  const [questionsRes, activeRes, pendingRes] = await Promise.all([
    ownExamIds.length > 0
      ? supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .in("exam_id", ownExamIds)
      : Promise.resolve({ count: 0 }),
    ownExamIds.length > 0
      ? supabase
          .from("exams")
          .select("id", { count: "exact", head: true })
          .in("id", ownExamIds)
          .eq("is_published", true)
          .lte("start_time", now)
          .gte("end_time", now)
      : Promise.resolve({ count: 0 }),
    scopeExamIds.length > 0
      ? supabase
          .from("exam_sessions")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted")
          .in("exam_id", scopeExamIds)
      : Promise.resolve({ count: 0 }),
  ]);

  return {
    totalExams: ownExamIds.length,
    totalQuestions: questionsRes.count ?? 0,
    activeExams: activeRes.count ?? 0,
    pendingGrading: pendingRes.count ?? 0,
  };
}

export async function getStudentStats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { activeExams: 0, completedExams: 0, avgScore: null };

  const now = new Date().toISOString();

  const [activeAssignmentsRes, sessionsRes] = await Promise.all([
    supabase
      .from("exam_recipients")
      .select(
        `
        exam_id,
        exams!inner(id)
      `
      )
      .eq("student_id", user.id)
      .eq("exams.is_published", true)
      .lte("exams.start_time", now)
      .gte("exams.end_time", now),
    supabase
      .from("exam_sessions")
      .select("total_score, max_score")
      .eq("user_id", user.id)
      .in("status", ["submitted", "graded"]),
  ]);

  const activeExams = new Set(
    (activeAssignmentsRes.data ?? []).map((assignment) => assignment.exam_id)
  ).size;
  const sessions = sessionsRes.data ?? [];
  let avgScore: number | null = null;
  if (sessions.length > 0) {
    const totalPct = sessions.reduce((sum, s) => {
      if (s.max_score && s.max_score > 0) {
        return sum + (s.total_score / s.max_score) * 100;
      }
      return sum;
    }, 0);
    avgScore = Math.round(totalPct / sessions.length);
  }

  return {
    activeExams,
    completedExams: sessions.length,
    avgScore,
  };
}
