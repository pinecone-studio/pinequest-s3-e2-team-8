import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStressRouteAuthorizationError } from "@/lib/stress-test";

export async function GET(request: Request) {
  const authorizationError = getStressRouteAuthorizationError(request);
  if (authorizationError) {
    return NextResponse.json(
      { ok: false, error: authorizationError },
      { status: authorizationError === "Unauthorized" ? 401 : 403 }
    );
  }

  const url = new URL(request.url);
  const examId = url.searchParams.get("examId")?.trim();

  if (!examId) {
    return NextResponse.json(
      { ok: false, error: "examId is required." },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data: sessions, error } = await admin
      .from("exam_sessions")
      .select("id, user_id, status, attempt_number, started_at, submitted_at, total_score, max_score")
      .eq("exam_id", examId)
      .order("user_id", { ascending: true })
      .order("attempt_number", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const inProgressCounts = new Map<string, number>();
    for (const session of sessions ?? []) {
      if (session.status !== "in_progress") continue;
      const key = String(session.user_id);
      inProgressCounts.set(key, (inProgressCounts.get(key) ?? 0) + 1);
    }

    const duplicateInProgressUsers = Array.from(inProgressCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([userId, count]) => ({ userId, count }));

    const sessionIds = (sessions ?? []).map((session) => String(session.id));
    const statusCounts = (sessions ?? []).reduce<Record<string, number>>(
      (counts, session) => {
        const key = String(session.status);
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      },
      {}
    );

    let duplicateAnswerRows: Array<{
      sessionId: string;
      questionId: string;
      count: number;
    }> = [];
    let corruptedSessions: Array<{
      sessionId: string;
      userId: string;
      status: string;
      issue: string;
    }> = [];
    let answerCount = 0;

    if (sessionIds.length > 0) {
      const { data: answers, error: answersError } = await admin
        .from("answers")
        .select("session_id, question_id")
        .in("session_id", sessionIds);

      if (answersError) {
        return NextResponse.json(
          { ok: false, error: answersError.message },
          { status: 500 }
        );
      }

      answerCount = (answers ?? []).length;
      const answerKeyCounts = new Map<string, number>();

      for (const answer of answers ?? []) {
        const key = `${answer.session_id}:${answer.question_id}`;
        answerKeyCounts.set(key, (answerKeyCounts.get(key) ?? 0) + 1);
      }

      duplicateAnswerRows = Array.from(answerKeyCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([key, count]) => {
          const [sessionId, questionId] = key.split(":");
          return { sessionId, questionId, count };
        });

      const answersBySession = new Map<string, number>();
      for (const answer of answers ?? []) {
        const sessionId = String(answer.session_id);
        answersBySession.set(sessionId, (answersBySession.get(sessionId) ?? 0) + 1);
      }

      corruptedSessions = (sessions ?? [])
        .flatMap((session) => {
          const issues: string[] = [];
          const status = String(session.status);
          const submittedAt = session.submitted_at ? String(session.submitted_at) : null;
          const answersForSession = answersBySession.get(String(session.id)) ?? 0;

          if (status === "in_progress" && submittedAt) {
            issues.push("in_progress_has_submitted_at");
          }

          if ((status === "submitted" || status === "graded" || status === "timed_out") && !submittedAt) {
            issues.push("finalized_missing_submitted_at");
          }

          if ((status === "submitted" || status === "graded" || status === "timed_out") && answersForSession === 0) {
            issues.push("finalized_without_answers");
          }

          return issues.map((issue) => ({
            sessionId: String(session.id),
            userId: String(session.user_id),
            status,
            issue,
          }));
        });
    }

    return NextResponse.json({
      ok: true,
      examId,
      totalSessions: (sessions ?? []).length,
      totalAnswers: answerCount,
      inProgressCount: Array.from(inProgressCounts.values()).reduce(
        (sum, count) => sum + count,
        0
      ),
      statusCounts,
      duplicateInProgressUsers,
      duplicateAnswerRows,
      corruptedSessions,
      sampleSessions: (sessions ?? []).slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 }
    );
  }
}
