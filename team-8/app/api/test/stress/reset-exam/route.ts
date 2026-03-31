import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStressRouteAuthorizationError } from "@/lib/stress-test";

function getSessionAnswersCacheKey(sessionId: string, userId: string) {
  return `session:${sessionId}:user:${userId}:answers`;
}

function getSessionAnswerMetaCacheKey(sessionId: string, userId: string) {
  return `session:${sessionId}:user:${userId}:answer-meta`;
}

function getSessionHeartbeatCacheKey(sessionId: string) {
  return `heartbeat:session:${sessionId}`;
}

function getSubmitSessionLockKey(sessionId: string) {
  return `lock:exam-submit:${sessionId}`;
}

function getSessionMetaCacheKey(sessionId: string, userId: string) {
  return `session:${sessionId}:user:${userId}:meta`;
}

export async function POST(request: Request) {
  const authorizationError = getStressRouteAuthorizationError(request);
  if (authorizationError) {
    return NextResponse.json(
      { ok: false, error: authorizationError },
      { status: authorizationError === "Unauthorized" ? 401 : 403 }
    );
  }

  let body: { examId?: string; userIds?: string[] };

  try {
    body = (await request.json()) as { examId?: string; userIds?: string[] };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const examId = body.examId?.trim();
  const userIds = Array.isArray(body.userIds)
    ? body.userIds.map((value) => value.trim()).filter(Boolean)
    : [];

  if (!examId) {
    return NextResponse.json(
      { ok: false, error: "examId is required." },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    let query = admin
      .from("exam_sessions")
      .select("id, user_id, status")
      .eq("exam_id", examId);

    if (userIds.length > 0) {
      query = query.in("user_id", userIds);
    }

    const { data: sessions, error: sessionError } = await query;

    if (sessionError) {
      return NextResponse.json(
        { ok: false, error: sessionError.message },
        { status: 500 }
      );
    }

    const sessionRows = (sessions ?? []).map((session) => ({
      id: String(session.id),
      userId: String(session.user_id),
      status: String(session.status),
    }));
    const sessionIds = sessionRows.map((session) => session.id);

    if (sessionIds.length > 0) {
      const { error: deleteError } = await admin
        .from("exam_sessions")
        .delete()
        .in("id", sessionIds);

      if (deleteError) {
        return NextResponse.json(
          { ok: false, error: deleteError.message },
          { status: 500 }
        );
      }

      await Promise.allSettled(
        sessionRows.flatMap((session) => [
          redis.del(getSessionAnswersCacheKey(session.id, session.userId)),
          redis.del(getSessionAnswerMetaCacheKey(session.id, session.userId)),
          redis.del(getSessionMetaCacheKey(session.id, session.userId)),
          redis.del(getSessionHeartbeatCacheKey(session.id)),
          redis.del(getSubmitSessionLockKey(session.id)),
        ])
      );
    }

    return NextResponse.json({
      ok: true,
      examId,
      deletedSessionCount: sessionRows.length,
      deletedSessionIds: sessionIds,
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
