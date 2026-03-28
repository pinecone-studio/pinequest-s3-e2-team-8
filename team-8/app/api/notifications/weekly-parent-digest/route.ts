import { NextResponse } from "next/server";
import { pickBestAttempt } from "@/lib/exam-attempt-utils";
import {
  getEffectiveExamAccess,
  type RecipientAccessOverride,
} from "@/lib/exam-session-lifecycle";
import {
  sendWeeklyParentDigest,
  type ParentWeeklyDigest,
} from "@/lib/notification/actions";
import { isAuthorizedCronRequest } from "@/lib/notification/cron";
import { createAdminClient } from "@/lib/supabase/admin";

type ProfileRow = {
  id: string;
  full_name: string | null;
  parent_email: string | null;
};

type SessionRow = {
  user_id: string;
  exam_id: string;
  status: string;
  attempt_number: number | null;
  total_score: number | null;
  max_score: number | null;
  submitted_at: string | null;
  exams:
    | {
        title: string | null;
      }
    | Array<{
        title: string | null;
      }>
    | null;
};

type DigestAttempt = {
  examId: string;
  examTitle: string;
  attempt_number: number | null;
  total_score: number;
  max_score: number;
  submitted_at: string;
  status: string;
};

type ExamRecipientWindowRow = {
  student_id: string;
  access_start_time: string | null;
  access_end_time: string | null;
  max_attempts_override: number | null;
  excused_at: string | null;
  exams:
    | {
        id: string;
        title: string;
        start_time: string;
        end_time: string;
        duration_minutes: number;
      }
    | Array<{
        id: string;
        title: string;
        start_time: string;
        end_time: string;
        duration_minutes: number;
      }>
    | null;
};

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getPeriodStartStamp(now: Date) {
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - 7);
  return start;
}

function isWithinWindow(
  dateLike: string | null | undefined,
  startIso: string,
  endIso: string
) {
  if (!dateLike) return false;
  const valueMs = new Date(dateLike).getTime();
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();

  if (
    Number.isNaN(valueMs) ||
    Number.isNaN(startMs) ||
    Number.isNaN(endMs)
  ) {
    return false;
  }

  return valueMs >= startMs && valueMs <= endMs;
}

function getEffectiveExamWindow(row: ExamRecipientWindowRow) {
  const exam = getRelationObject(row.exams);
  if (!exam) return null;

  const access = getEffectiveExamAccess(
    {
      start_time: exam.start_time,
      end_time: exam.end_time,
      duration_minutes: Number(exam.duration_minutes ?? 0),
      max_attempts: 1,
    },
    row as RecipientAccessOverride
  );

  return {
    studentId: String(row.student_id),
    examId: String(exam.id),
    examTitle: String(exam.title),
    startTime: access.effectiveStartTime,
    endTime: access.effectiveEndTime,
  };
}

async function loadRecentAssignedExamWindows(
  startIso: string,
  endIso: string
) {
  const admin = createAdminClient();
  const selectClause = `
    student_id,
    access_start_time,
    access_end_time,
    max_attempts_override,
    excused_at,
    exams!inner(id, title, start_time, end_time, duration_minutes, is_published)
  `;

  const [baseResult, overrideResult] = await Promise.all([
    admin
      .from("exam_recipients")
      .select(selectClause)
      .eq("exams.is_published", true)
      .is("excused_at", null)
      .gte("exams.end_time", startIso)
      .lte("exams.end_time", endIso),
    admin
      .from("exam_recipients")
      .select(selectClause)
      .eq("exams.is_published", true)
      .is("excused_at", null)
      .not("access_end_time", "is", null)
      .gte("access_end_time", startIso)
      .lte("access_end_time", endIso),
  ]);

  if (baseResult.error) throw new Error(baseResult.error.message);
  if (overrideResult.error) throw new Error(overrideResult.error.message);

  const windows = new Map<
    string,
    { studentId: string; examId: string; examTitle: string; startTime: string; endTime: string }
  >();

  for (const row of [
    ...(((baseResult.data ?? []) as unknown) as ExamRecipientWindowRow[]),
    ...(((overrideResult.data ?? []) as unknown) as ExamRecipientWindowRow[]),
  ]) {
    if (row.excused_at) continue;
    const window = getEffectiveExamWindow(row);
    if (!window) continue;
    if (!isWithinWindow(window.endTime, startIso, endIso)) continue;
    windows.set(`${window.studentId}:${window.examId}`, window);
  }

  return Array.from(windows.values());
}

async function loadUpcomingAssignedExamWindows(
  startIso: string,
  endIso: string
) {
  const admin = createAdminClient();
  const selectClause = `
    student_id,
    access_start_time,
    access_end_time,
    max_attempts_override,
    excused_at,
    exams!inner(id, title, start_time, end_time, duration_minutes, is_published)
  `;

  const [baseResult, overrideResult] = await Promise.all([
    admin
      .from("exam_recipients")
      .select(selectClause)
      .eq("exams.is_published", true)
      .is("excused_at", null)
      .gte("exams.start_time", startIso)
      .lte("exams.start_time", endIso),
    admin
      .from("exam_recipients")
      .select(selectClause)
      .eq("exams.is_published", true)
      .is("excused_at", null)
      .not("access_start_time", "is", null)
      .gte("access_start_time", startIso)
      .lte("access_start_time", endIso),
  ]);

  if (baseResult.error) throw new Error(baseResult.error.message);
  if (overrideResult.error) throw new Error(overrideResult.error.message);

  const windows = new Map<
    string,
    { studentId: string; examId: string; examTitle: string; startTime: string }
  >();

  for (const row of [
    ...(((baseResult.data ?? []) as unknown) as ExamRecipientWindowRow[]),
    ...(((overrideResult.data ?? []) as unknown) as ExamRecipientWindowRow[]),
  ]) {
    if (row.excused_at) continue;
    const window = getEffectiveExamWindow(row);
    if (!window) continue;
    if (!isWithinWindow(window.startTime, startIso, endIso)) continue;
    windows.set(`${window.studentId}:${window.examId}`, {
      studentId: window.studentId,
      examId: window.examId,
      examTitle: window.examTitle,
      startTime: window.startTime,
    });
  }

  return Array.from(windows.values());
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const recentStart = getPeriodStartStamp(now);
  const recentStartIso = recentStart.toISOString();
  const nowIso = now.toISOString();
  const upcomingEndIso = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const digestKey = recentStartIso.slice(0, 10);

  try {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name, parent_email")
      .eq("role", "student")
      .not("parent_email", "is", null);

    if (profileError) {
      throw new Error(profileError.message);
    }

    const students = ((profiles ?? []) as ProfileRow[]).filter(
      (profile) => profile.parent_email
    );

    if (students.length === 0) {
      return NextResponse.json({
        ok: true,
        checkedAt: nowIso,
        studentsConsidered: 0,
        digestsAttempted: 0,
        digestsSent: 0,
      });
    }

    const studentIds = students.map((student) => student.id);

    const [recentSessionsResult, recentAssignedWindows, upcomingAssignedWindows] =
      await Promise.all([
        admin
          .from("exam_sessions")
          .select(
            "user_id, exam_id, status, attempt_number, total_score, max_score, submitted_at, exams(title)"
          )
          .in("user_id", studentIds)
          .in("status", ["submitted", "graded", "timed_out"])
          .gte("submitted_at", recentStartIso),
        loadRecentAssignedExamWindows(recentStartIso, nowIso),
        loadUpcomingAssignedExamWindows(nowIso, upcomingEndIso),
      ]);

    if (recentSessionsResult.error) {
      throw new Error(recentSessionsResult.error.message);
    }

    const recentSessions = ((recentSessionsResult.data ?? []) as unknown) as SessionRow[];
    const recentAssignedExamIds = Array.from(
      new Set(recentAssignedWindows.map((item) => item.examId))
    );

    const sessionPresence = new Set<string>();
    if (recentAssignedExamIds.length > 0) {
      const { data: allRelatedSessions, error: relatedSessionError } = await admin
        .from("exam_sessions")
        .select("user_id, exam_id")
        .in("user_id", studentIds)
        .in("exam_id", recentAssignedExamIds);

      if (relatedSessionError) {
        throw new Error(relatedSessionError.message);
      }

      for (const row of allRelatedSessions ?? []) {
        sessionPresence.add(`${row.user_id}:${row.exam_id}`);
      }
    }

    const attemptsByStudentExam = new Map<string, DigestAttempt[]>();
    const timedOutCountByStudent = new Map<string, number>();

    for (const session of recentSessions) {
      const exam = getRelationObject(session.exams);
      const totalScore = Number(session.total_score ?? 0);
      const maxScore = Number(session.max_score ?? 0);
      const key = `${session.user_id}:${session.exam_id}`;
      const attempts = attemptsByStudentExam.get(key) ?? [];
      attempts.push({
        examId: String(session.exam_id),
        examTitle: exam?.title ?? "Шалгалт",
        attempt_number: session.attempt_number,
        total_score: totalScore,
        max_score: maxScore,
        submitted_at: session.submitted_at ?? nowIso,
        status: session.status,
      });
      attemptsByStudentExam.set(key, attempts);

      if (session.status === "timed_out") {
        timedOutCountByStudent.set(
          session.user_id,
          Number(timedOutCountByStudent.get(session.user_id) ?? 0) + 1
        );
      }
    }

    const missedCountByStudent = new Map<string, number>();
    for (const assignedWindow of recentAssignedWindows) {
      if (sessionPresence.has(`${assignedWindow.studentId}:${assignedWindow.examId}`)) {
        continue;
      }
      missedCountByStudent.set(
        assignedWindow.studentId,
        Number(missedCountByStudent.get(assignedWindow.studentId) ?? 0) + 1
      );
    }

    const upcomingByStudent = new Map<
      string,
      ParentWeeklyDigest["upcomingExams"]
    >();
    for (const exam of upcomingAssignedWindows) {
      const rows = upcomingByStudent.get(exam.studentId) ?? [];
      rows.push({
        examId: exam.examId,
        examTitle: exam.examTitle,
        startTime: exam.startTime,
      });
      upcomingByStudent.set(exam.studentId, rows);
    }

    const bestResultsByStudent = new Map<
      string,
      ParentWeeklyDigest["recentResults"]
    >();
    for (const [key, attempts] of attemptsByStudentExam.entries()) {
      const studentId = key.split(":", 1)[0];
      const bestAttempt = pickBestAttempt(attempts);
      if (!bestAttempt) continue;

      const rows = bestResultsByStudent.get(studentId) ?? [];
      rows.push({
        examId: bestAttempt.examId,
        examTitle: bestAttempt.examTitle,
        totalScore: bestAttempt.total_score,
        maxScore: bestAttempt.max_score,
        percentage:
          bestAttempt.max_score > 0
            ? Math.round((bestAttempt.total_score / bestAttempt.max_score) * 100)
            : 0,
        submittedAt: bestAttempt.submitted_at,
      });
      bestResultsByStudent.set(studentId, rows);
    }

    let digestsAttempted = 0;
    let digestsSent = 0;

    const digests: ParentWeeklyDigest[] = students.map((student) => {
      const recentResults = (bestResultsByStudent.get(student.id) ?? [])
        .sort(
          (left, right) =>
            new Date(right.submittedAt).getTime() -
            new Date(left.submittedAt).getTime()
        );
      const completedCount = recentResults.length;
      const averagePercentage =
        completedCount > 0
          ? Math.round(
              recentResults.reduce((sum, row) => sum + row.percentage, 0) /
                completedCount
            )
          : null;
      const upcomingExams = (upcomingByStudent.get(student.id) ?? []).sort(
        (left, right) =>
          new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
      );

      return {
        studentId: student.id,
        studentName: student.full_name?.trim() || "Сурагч",
        parentEmail: String(student.parent_email),
        completedCount,
        averagePercentage,
        recentResults,
        missedCount: Number(missedCountByStudent.get(student.id) ?? 0),
        timedOutCount: Number(timedOutCountByStudent.get(student.id) ?? 0),
        upcomingExams,
        digestKey,
      };
    });

    const batchSize = 10;
    for (let index = 0; index < digests.length; index += batchSize) {
      const batch = digests.slice(index, index + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (digest) => {
          digestsAttempted += 1;
          return sendWeeklyParentDigest(digest);
        })
      );

      for (const result of batchResults) {
        if (result.success && !("skipped" in result && result.skipped)) {
          digestsSent += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      checkedAt: nowIso,
      studentsConsidered: students.length,
      digestsAttempted,
      digestsSent,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Weekly digest failed",
      },
      { status: 500 }
    );
  }
}
