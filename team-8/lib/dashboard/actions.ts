"use server";

import { createClient } from "@/lib/supabase/server";

export async function getEducatorStats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { totalExams: 0, totalQuestions: 0, activeExams: 0, pendingGrading: 0 };

  const now = new Date().toISOString();

  const [examsRes, questionsRes, activeRes, pendingRes] = await Promise.all([
    supabase
      .from("exams")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id),
    supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .in(
        "exam_id",
        (
          await supabase.from("exams").select("id").eq("created_by", user.id)
        ).data?.map((e) => e.id) ?? []
      ),
    supabase
      .from("exams")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id)
      .eq("is_published", true)
      .lte("start_time", now)
      .gte("end_time", now),
    supabase
      .from("exam_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .in(
        "exam_id",
        (
          await supabase.from("exams").select("id").eq("created_by", user.id)
        ).data?.map((e) => e.id) ?? []
      ),
  ]);

  return {
    totalExams: examsRes.count ?? 0,
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
