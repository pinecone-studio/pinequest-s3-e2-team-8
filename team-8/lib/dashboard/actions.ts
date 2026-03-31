"use server";

import { createClient } from "@/lib/supabase/server";
import { deriveStudentExamLifecycle, getEffectiveExamAccess } from "@/lib/exam-session-lifecycle";
import {
  getAttemptPercentage,
  pickBestAttempt,
  pickLatestAttempt,
} from "@/lib/exam-attempt-utils";
import { getStudentLearningDashboardSummary } from "@/lib/student-learning/actions";

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type StudentUpcomingExam = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  session_status: string | null;
  lifecycle_status: string;
  lifecycle_label: string;
};

type StudentDashboardExam = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  max_attempts: number;
};

export async function getEducatorStats() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      totalExams: 0,
      totalQuestions: 0,
      activeExams: 0,
      pendingGrading: 0,
      totalParticipants: 0,
      upcomingExams: [],
      pendingItems: [],
    };
  }

  const now = new Date().toISOString();

  // Own exam IDs (for totalExams, totalQuestions, activeExams)
  const { data: ownExams } = await supabase
    .from("exams")
    .select("id")
    .eq("created_by", user.id);
  const ownExamIds = (ownExams ?? []).map((e) => e.id);

  // Teaching-scope exam IDs (for pendingGrading — includes admin-created exams assigned to teacher's groups)
  const teachingScopeExamIds = new Set<string>(ownExamIds);
  const ownExamIdSet = new Set(ownExamIds);
  const scopedExamGroups = new Map<string, Set<string>>();

  const { data: teachingRows, error: teachingRowsError } = await supabase
    .from("teaching_assignments")
    .select("group_id, subject_id")
    .eq("teacher_id", user.id)
    .eq("is_active", true);

  if (!teachingRowsError && teachingRows && teachingRows.length > 0) {
    const groupIds = [...new Set(teachingRows.map((r) => r.group_id))];
    const { data: assignedExams, error: assignedExamsError } = await supabase
      .from("exam_assignments")
      .select("exam_id, group_id, exams(subject_id)")
      .in("group_id", groupIds);

    for (const ae of assignedExamsError ? [] : assignedExams ?? []) {
      const subjectId = Array.isArray(ae.exams)
        ? ae.exams[0]?.subject_id
        : (ae.exams as { subject_id: string } | null)?.subject_id;
      // Must match both subject AND group (not just subject)
      if (
        teachingRows.find(
          (ta) => ta.subject_id === subjectId && ta.group_id === ae.group_id
        )
      ) {
        teachingScopeExamIds.add(ae.exam_id);
        if (!ownExamIdSet.has(ae.exam_id)) {
          const groups = scopedExamGroups.get(ae.exam_id) ?? new Set<string>();
          groups.add(ae.group_id);
          scopedExamGroups.set(ae.exam_id, groups);
        }
      }
    }
  }

  const scopeExamIds = [...teachingScopeExamIds];

  const [
    questionsRes,
    activeRes,
    upcomingRes,
    submittedSessionsRes,
    participantRowsRes,
  ] = await Promise.all([
    supabase
      .from("question_bank")
      .select("id", { count: "exact", head: true }),
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
          .from("exams")
          .select("id, title, start_time, end_time, is_published, subjects(name)")
          .in("id", scopeExamIds)
          .gte("end_time", now)
          .order("start_time", { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [] }),
    scopeExamIds.length > 0
      ? supabase
          .from("exam_sessions")
          .select(
            "id, user_id, submitted_at, exam_id, exams(title), profiles!exam_sessions_user_id_fkey(full_name, email)"
          )
          .eq("status", "submitted")
          .in("exam_id", scopeExamIds)
          .order("submitted_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    scopeExamIds.length > 0
      ? supabase.from("exam_sessions").select("user_id").in("exam_id", scopeExamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const submittedSessions = submittedSessionsRes.data ?? [];
  let filteredSubmittedSessions = submittedSessions;

  if (scopedExamGroups.size > 0) {
    const scopedStudentIds = Array.from(
      new Set(
        submittedSessions
          .filter((session) => !ownExamIdSet.has(session.exam_id))
          .map((session) => session.user_id as string)
      )
    );

    if (scopedStudentIds.length > 0) {
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

      filteredSubmittedSessions = submittedSessions.filter((session) => {
        if (ownExamIdSet.has(session.exam_id)) return true;
        const allowedGroups = scopedExamGroups.get(session.exam_id);
        const currentGroups = studentGroups.get(session.user_id as string);
        if (!allowedGroups || !currentGroups) return false;
        return Array.from(currentGroups).some((groupId) =>
          allowedGroups.has(groupId)
        );
      });
    }
  }

  const upcomingExams = (upcomingRes.data ?? []).map((exam) => ({
    id: exam.id,
    title: exam.title,
    start_time: exam.start_time,
    end_time: exam.end_time,
    is_published: exam.is_published,
    subject_name: getRelationObject(exam.subjects)?.name ?? null,
  }));

  const pendingItems = filteredSubmittedSessions.slice(0, 5).map((session) => {
    const exam = getRelationObject(session.exams);
    const profile = getRelationObject(session.profiles);

    return {
      id: session.id,
      submitted_at: session.submitted_at,
      exam_title: exam?.title ?? "Шалгалт",
      student_label: profile?.full_name || profile?.email || "Сурагч",
    };
  });

  const participantIds = new Set(
    (participantRowsRes.data ?? [])
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );

  return {
    totalExams: ownExamIds.length,
    totalQuestions: questionsRes && "count" in questionsRes ? (questionsRes.count ?? 0) : 0,
    activeExams: "error" in activeRes ? 0 : (activeRes.count ?? 0),
    pendingGrading: filteredSubmittedSessions.length,
    totalParticipants: participantIds.size,
    upcomingExams,
    pendingItems,
  };
}

export async function getStudentStats() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      activeExams: 0,
      completedExams: 0,
      avgScore: null,
      upcomingExams: [],
      recentResults: [],
      learningSummary: {
        weakSubjects: [],
        weakTopics: [],
        isRefreshing: false,
      },
    };
  }

  const now = new Date().toISOString();

  const [assignedRowsRes, sessionsRes] = await Promise.all([
    supabase
      .from("exam_recipients")
      .select(
        "exam_id, access_start_time, access_end_time, max_attempts_override, excused_at"
      )
      .eq("student_id", user.id),
    supabase
      .from("exam_sessions")
      .select(
        "exam_id, status, started_at, submitted_at, total_score, max_score, attempt_number, exams(title, passing_score)"
      )
      .eq("user_id", user.id)
      .in("status", ["in_progress", "submitted", "graded", "timed_out"]),
  ]);
  if (assignedRowsRes.error || sessionsRes.error) {
    return {
      activeExams: 0,
      completedExams: 0,
      avgScore: null,
      upcomingExams: [],
      recentResults: [],
      learningSummary: {
        weakSubjects: [],
        weakTopics: [],
        isRefreshing: false,
      },
    };
  }
  const sessions = sessionsRes.data ?? [];
  const assignedRows = assignedRowsRes.data ?? [];
  const assignedExamIds = [...new Set(assignedRows.map((row) => row.exam_id))];
  const { data: examRows, error: examRowsError } =
    assignedExamIds.length > 0
      ? await supabase
          .from("exams")
          .select("id, title, start_time, end_time, duration_minutes, max_attempts")
          .eq("is_published", true)
          .in("id", assignedExamIds)
      : { data: [], error: null };

  if (examRowsError) {
    return {
      activeExams: 0,
      completedExams: 0,
      avgScore: null,
      upcomingExams: [],
      recentResults: [],
      learningSummary: {
        weakSubjects: [],
        weakTopics: [],
        isRefreshing: false,
      },
    };
  }

  const examMap = new Map<string, StudentDashboardExam>(
    ((examRows ?? []) as StudentDashboardExam[]).map((exam) => [String(exam.id), exam])
  );
  const sessionsByExam = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const examSessions = sessionsByExam.get(String(session.exam_id)) ?? [];
    examSessions.push(session);
    sessionsByExam.set(String(session.exam_id), examSessions);
  }

  const bestSessionsByExam = Array.from(sessionsByExam.values())
    .map((examSessions) =>
      pickBestAttempt(
        examSessions.filter((session) =>
          ["submitted", "graded", "timed_out"].includes(String(session.status))
        )
      )
    )
    .filter((session): session is NonNullable<typeof session> => Boolean(session));
  let avgScore: number | null = null;
  if (bestSessionsByExam.length > 0) {
    const totalPct = bestSessionsByExam.reduce(
      (sum, session) => sum + getAttemptPercentage(session),
      0
    );
    avgScore = Math.round(totalPct / bestSessionsByExam.length);
  }

  const latestSessionByExam = new Map<
    string,
    { status: string; attemptNumber: number; startedAt: string | null }
  >();
  for (const [examId, examSessions] of sessionsByExam.entries()) {
    const latestSession = pickLatestAttempt(examSessions);
    if (!latestSession) continue;

    latestSessionByExam.set(examId, {
      status: String(latestSession.status),
      attemptNumber: Number(latestSession.attempt_number ?? 0),
      startedAt: (latestSession.started_at as string | null) ?? null,
    });
  }

  const nowMs = new Date(now).getTime();
  const decoratedExamMap = new Map<string, StudentUpcomingExam>();

  for (const row of assignedRows) {
    const exam = examMap.get(String(row.exam_id));
    if (!exam) continue;

    const access = getEffectiveExamAccess(
      {
        start_time: exam.start_time,
        end_time: exam.end_time,
        duration_minutes: exam.duration_minutes,
        max_attempts: exam.max_attempts,
      },
      row
    );
    const lifecycle = deriveStudentExamLifecycle({
      exam: {
        start_time: exam.start_time,
        end_time: exam.end_time,
        duration_minutes: exam.duration_minutes,
        max_attempts: exam.max_attempts,
      },
      recipient: row,
      latestSessionStatus:
        latestSessionByExam.get(String(exam.id))?.status ?? null,
      latestAttemptNumber:
        latestSessionByExam.get(String(exam.id))?.attemptNumber ?? 0,
      latestSessionStartedAt:
        latestSessionByExam.get(String(exam.id))?.startedAt ?? null,
      nowMs,
    });

    decoratedExamMap.set(String(exam.id), {
      id: exam.id,
      title: exam.title,
      start_time: access.effectiveStartTime,
      end_time: access.effectiveEndTime,
      duration_minutes: exam.duration_minutes,
      session_status:
        latestSessionByExam.get(exam.id)?.status ?? null,
      lifecycle_status: lifecycle.key,
      lifecycle_label: lifecycle.label,
    });
  }

  const decoratedExams = Array.from(decoratedExamMap.values());

  const activeExams = decoratedExams.filter(
    (exam) =>
      exam.lifecycle_status === "available" ||
      exam.lifecycle_status === "retake_available" ||
      exam.lifecycle_status === "in_progress"
  ).length;

  const upcomingExams = decoratedExams
    .filter(
      (exam) =>
        exam.lifecycle_status === "scheduled" ||
        exam.lifecycle_status === "retake_scheduled" ||
        exam.lifecycle_status === "available" ||
        exam.lifecycle_status === "retake_available" ||
        exam.lifecycle_status === "in_progress"
    )
    .sort(
      (left, right) =>
        new Date(left.start_time).getTime() -
        new Date(right.start_time).getTime()
    )
    .slice(0, 5);

  const recentResults = bestSessionsByExam
    .slice()
    .sort(
      (left, right) =>
        new Date(String(right.submitted_at ?? right.started_at ?? 0)).getTime() -
        new Date(String(left.submitted_at ?? left.started_at ?? 0)).getTime()
    )
    .slice(0, 3)
    .map((session) => {
      const exam = getRelationObject(session.exams);
      const percentage = getAttemptPercentage(session);

      return {
        id: session.exam_id,
        exam_title: exam?.title ?? "Шалгалт",
        submitted_at: session.submitted_at,
        percentage,
        status: session.status,
      };
    });

  const learningSummary = await getStudentLearningDashboardSummary(user.id);

  return {
    activeExams,
    completedExams: bestSessionsByExam.length,
    avgScore,
    upcomingExams,
    recentResults,
    learningSummary,
  };
}
