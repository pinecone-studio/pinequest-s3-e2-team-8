import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Cron-compatible endpoint: шалгалтын сануулга илгээх
 * - 1 өдрийн өмнө reminder
 * - 1 цагийн өмнө reminder
 *
 * GET /api/notifications/reminders
 */
export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // 1 цагийн дотор эхлэх шалгалтууд (55-65 минутын цонх)
  const oneHourWindowStart = new Date(
    now.getTime() + 55 * 60 * 1000
  ).toISOString();
  const oneHourWindowEnd = new Date(
    now.getTime() + 65 * 60 * 1000
  ).toISOString();

  // 1 өдрийн дотор эхлэх шалгалтууд (23.5-24.5 цагийн цонх)
  const oneDayWindowStart = new Date(
    now.getTime() + 23.5 * 60 * 60 * 1000
  ).toISOString();
  const oneDayWindowEnd = new Date(
    now.getTime() + 24.5 * 60 * 60 * 1000
  ).toISOString();

  let remindersSent = 0;

  // ─── 1 Hour Reminders ──────────────────────────────────────────────
  const { data: hourExams } = await supabase
    .from("exams")
    .select("id, title, start_time")
    .eq("is_published", true)
    .gte("start_time", oneHourWindowStart)
    .lte("start_time", oneHourWindowEnd);

  for (const exam of hourExams ?? []) {
    const { data: recipients } = await supabase
      .from("exam_recipients")
      .select("student_id")
      .eq("exam_id", exam.id);

    if (!recipients || recipients.length === 0) continue;

    // Давхар илгээхгүй: өмнө нь илгээсэн эсэхийг шалгах
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "exam_reminder_1hour")
      .eq("metadata->>examId", exam.id)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const rows = recipients.map((r) => ({
      user_id: r.student_id,
      type: "exam_reminder_1hour",
      title: "Шалгалт удахгүй эхэлнэ!",
      message: `"${exam.title}" шалгалт 1 цагийн дараа эхэлнэ. Бэлтгэлээ хангаарай.`,
      link: "/student/exams",
      metadata: { examId: exam.id },
    }));

    await supabase.from("notifications").insert(rows);
    remindersSent += rows.length;
  }

  // ─── 1 Day Reminders ───────────────────────────────────────────────
  const { data: dayExams } = await supabase
    .from("exams")
    .select("id, title, start_time")
    .eq("is_published", true)
    .gte("start_time", oneDayWindowStart)
    .lte("start_time", oneDayWindowEnd);

  for (const exam of dayExams ?? []) {
    const { data: recipients } = await supabase
      .from("exam_recipients")
      .select("student_id")
      .eq("exam_id", exam.id);

    if (!recipients || recipients.length === 0) continue;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "exam_reminder_1day")
      .eq("metadata->>examId", exam.id)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const rows = recipients.map((r) => ({
      user_id: r.student_id,
      type: "exam_reminder_1day",
      title: "Маргааш шалгалт байна",
      message: `"${exam.title}" шалгалт маргааш болно. Сайн бэлтгээрэй!`,
      link: "/student/exams",
      metadata: { examId: exam.id },
    }));

    await supabase.from("notifications").insert(rows);
    remindersSent += rows.length;
  }

  return NextResponse.json({
    ok: true,
    remindersSent,
    checkedAt: now.toISOString(),
    hourExamsFound: hourExams?.length ?? 0,
    dayExamsFound: dayExams?.length ?? 0,
  });
}
