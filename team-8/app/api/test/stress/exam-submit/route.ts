import { NextResponse } from "next/server";
import { submitExamForUserClient } from "@/lib/student/actions";
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
    const result = await submitExamForUserClient(
      supabase,
      user.id,
      sessionId,
      answers,
      answerAnalytics,
      {
        skipPostFinalizeSideEffects: true,
      }
    );

    if ("error" in result) {
      const errorMessage = String(result.error ?? "submit_failed");
      const status = errorMessage.includes("Хэт олон")
        ? 429
        : errorMessage.includes("Session олдсонгүй")
          ? 404
          : 409;

      return NextResponse.json(
        {
          ok: false,
          error: errorMessage,
          durationMs: Math.round(performance.now() - startedAt),
        },
        { status }
      );
    }

    if (
      !("totalScore" in result) ||
      !("maxScore" in result) ||
      !("percentage" in result)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "submit_result_incomplete",
          durationMs: Math.round(performance.now() - startedAt),
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      percentage: result.percentage,
      finalStatus: "finalStatus" in result ? result.finalStatus : null,
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
