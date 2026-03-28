import { NextResponse } from "next/server";
import {
  getEffectiveExamAccess,
  type RecipientAccessOverride,
} from "@/lib/exam-session-lifecycle";
import {
  sendExamReminderNotifications,
  type ExamReminderCandidate,
} from "@/lib/notification/actions";
import { isAuthorizedCronRequest } from "@/lib/notification/cron";
import { createAdminClient } from "@/lib/supabase/admin";

type ReminderRecipientRow = {
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
  profiles:
    | {
        full_name: string | null;
        email: string | null;
        parent_email: string | null;
      }
    | Array<{
        full_name: string | null;
        email: string | null;
        parent_email: string | null;
      }>
    | null;
};

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

function toReminderCandidate(
  row: ReminderRecipientRow,
  windowStartIso: string,
  windowEndIso: string
) {
  if (row.excused_at) return null;

  const exam = getRelationObject(row.exams);
  const profile = getRelationObject(row.profiles);
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

  if (!isWithinWindow(access.effectiveStartTime, windowStartIso, windowEndIso)) {
    return null;
  }

  return {
    studentId: String(row.student_id),
    studentName: profile?.full_name?.trim() || "Сурагч",
    studentEmail: profile?.email ?? null,
    parentEmail: profile?.parent_email ?? null,
    examId: String(exam.id),
    examTitle: String(exam.title),
    startTime: access.effectiveStartTime,
    endTime: access.effectiveEndTime,
    durationMinutes: Number(exam.duration_minutes ?? 0),
  } satisfies ExamReminderCandidate;
}

async function loadReminderCandidates(
  windowStartIso: string,
  windowEndIso: string
) {
  const admin = createAdminClient();
  const selectClause = `
    student_id,
    access_start_time,
    access_end_time,
    max_attempts_override,
    excused_at,
    exams!inner(id, title, start_time, end_time, duration_minutes, is_published),
    profiles:profiles!exam_recipients_student_id_fkey(full_name, email, parent_email)
  `;

  const [baseResult, overrideResult] = await Promise.all([
    admin
      .from("exam_recipients")
      .select(selectClause)
      .eq("exams.is_published", true)
      .is("excused_at", null)
      .gte("exams.start_time", windowStartIso)
      .lte("exams.start_time", windowEndIso),
    admin
      .from("exam_recipients")
      .select(selectClause)
      .eq("exams.is_published", true)
      .is("excused_at", null)
      .not("access_start_time", "is", null)
      .gte("access_start_time", windowStartIso)
      .lte("access_start_time", windowEndIso),
  ]);

  if (baseResult.error) {
    throw new Error(baseResult.error.message);
  }

  if (overrideResult.error) {
    throw new Error(overrideResult.error.message);
  }

  const candidates = new Map<string, ExamReminderCandidate>();

  for (const row of [
    ...(((baseResult.data ?? []) as unknown) as ReminderRecipientRow[]),
    ...(((overrideResult.data ?? []) as unknown) as ReminderRecipientRow[]),
  ]) {
    const candidate = toReminderCandidate(row, windowStartIso, windowEndIso);
    if (!candidate) continue;

    const key = `${candidate.examId}:${candidate.studentId}:${candidate.startTime}`;
    candidates.set(key, candidate);
  }

  return Array.from(candidates.values());
}

/**
 * Cron-compatible endpoint: шалгалтын сануулга илгээх
 * - 1 өдрийн өмнө reminder
 * - 1 цагийн өмнө reminder
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const oneHourWindowStart = new Date(
    now.getTime() + 55 * 60 * 1000
  ).toISOString();
  const oneHourWindowEnd = new Date(
    now.getTime() + 65 * 60 * 1000
  ).toISOString();
  const oneDayWindowStart = new Date(
    now.getTime() + 23.5 * 60 * 60 * 1000
  ).toISOString();
  const oneDayWindowEnd = new Date(
    now.getTime() + 24.5 * 60 * 60 * 1000
  ).toISOString();

  try {
    const [hourCandidates, dayCandidates] = await Promise.all([
      loadReminderCandidates(oneHourWindowStart, oneHourWindowEnd),
      loadReminderCandidates(oneDayWindowStart, oneDayWindowEnd),
    ]);

    const [hourResult, dayResult] = await Promise.all([
      sendExamReminderNotifications(hourCandidates, "exam_reminder_1hour"),
      sendExamReminderNotifications(dayCandidates, "exam_reminder_1day"),
    ]);

    return NextResponse.json({
      ok: true,
      checkedAt: now.toISOString(),
      oneHour: hourResult,
      oneDay: dayResult,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Reminder processing failed",
      },
      { status: 500 }
    );
  }
}
