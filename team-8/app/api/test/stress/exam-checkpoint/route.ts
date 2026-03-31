import { NextResponse } from "next/server";
import { saveAnswersBatchForUserClient } from "@/lib/student/actions";
import type { AnswerChangeAnalytics } from "@/lib/proctoring";
import {
  getStressRouteAuthorizationError,
  getStressUserContext,
} from "@/lib/stress-test";

export async function POST(request: Request) {
  const authorizationError = getStressRouteAuthorizationError(request);
  if (authorizationError) {
    return NextResponse.json(
      { ok: false, error: authorizationError },
      { status: authorizationError === "Unauthorized" ? 401 : 403 }
    );
  }

  let body: {
    sessionId?: string;
    answers?: Record<string, string>;
    answerAnalytics?: Record<string, AnswerChangeAnalytics>;
  };

  try {
    body = (await request.json()) as {
      sessionId?: string;
      answers?: Record<string, string>;
      answerAnalytics?: Record<string, AnswerChangeAnalytics>;
    };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const sessionId = body.sessionId?.trim();
  const answers = body.answers ?? {};
  const answerAnalytics = body.answerAnalytics ?? {};

  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: "sessionId is required." },
      { status: 400 }
    );
  }

  const startedAt = performance.now();

  try {
    const { supabase, user } = await getStressUserContext(request);
    const result = await saveAnswersBatchForUserClient(
      supabase,
      user.id,
      sessionId,
      answers,
      answerAnalytics
    );

    if ("error" in result) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          durationMs: Math.round(performance.now() - startedAt),
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      savedAnswerCount: Object.keys(answers).length,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
        durationMs: Math.round(performance.now() - startedAt),
      },
      { status: 500 }
    );
  }
}
