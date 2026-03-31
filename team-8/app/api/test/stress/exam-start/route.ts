import { NextResponse } from "next/server";
import { examBurstRateLimit, redis, startExamRateLimit } from "@/lib/redis";
import {
  getStressRouteAuthorizationError,
  getStressUserContext,
} from "@/lib/stress-test";

type CachedExamPayload = {
  questions?: unknown[];
};

type MinimalStressQuestion = {
  id: string;
  type: string;
  options: string[] | null;
  matching_prompts?: string[];
  matching_choices?: string[];
};

function getQuestionCacheKey(examId: string) {
  return `exam:${examId}:questions`;
}

function getCachedQuestionCount(cached: unknown) {
  if (!cached) return 0;

  const parsed =
    typeof cached === "string"
      ? (JSON.parse(cached) as CachedExamPayload)
      : (cached as CachedExamPayload);

  return Array.isArray(parsed.questions) ? parsed.questions.length : 0;
}

function toMinimalQuestionList(cached: unknown): MinimalStressQuestion[] {
  if (!cached) return [];

  const parsed =
    typeof cached === "string"
      ? (JSON.parse(cached) as CachedExamPayload)
      : (cached as CachedExamPayload);

  if (!Array.isArray(parsed.questions)) {
    return [];
  }

  const questions: MinimalStressQuestion[] = [];
  for (const question of parsed.questions) {
    if (!question || typeof question !== "object") continue;

    const row = question as Record<string, unknown>;
    const id = String(row.id ?? "");
    if (!id) continue;

    questions.push({
      id,
      type: String(row.type ?? ""),
      options: Array.isArray(row.options)
        ? row.options.map((option) => String(option))
        : null,
      matching_prompts: Array.isArray(row.matching_prompts)
        ? row.matching_prompts.map((item) => String(item))
        : undefined,
      matching_choices: Array.isArray(row.matching_choices)
        ? row.matching_choices.map((item) => String(item))
        : undefined,
    });
  }

  return questions;
}

export async function POST(request: Request) {
  const authorizationError = getStressRouteAuthorizationError(request);
  if (authorizationError) {
    return NextResponse.json(
      { ok: false, error: authorizationError },
      { status: authorizationError === "Unauthorized" ? 401 : 403 }
    );
  }

  let body: { examId?: string; warmPayloadCache?: boolean };

  try {
    body = (await request.json()) as {
      examId?: string;
      warmPayloadCache?: boolean;
    };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const examId = body.examId?.trim();

  if (!examId) {
    return NextResponse.json(
      { ok: false, error: "examId is required." },
      { status: 400 }
    );
  }

  const requestStartedAt = performance.now();

  try {
    const { supabase, user } = await getStressUserContext(request);

    const startLimit = await startExamRateLimit.limit(
      `start-exam:${user.id}:${examId}`
    );
    if (!startLimit.success) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Хэт олон эхлүүлэх оролдлого илгээлээ. Түр хүлээгээд дахин оролдоно уу.",
        },
        { status: 429 }
      );
    }

    const burstLimit = await examBurstRateLimit.limit(`exam-burst:${examId}`);
    if (!burstLimit.success) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Олон сурагч нэгэн зэрэг эхлүүлж байна. 2-3 секунд хүлээгээд дахин оролдоно уу.",
        },
        { status: 429 }
      );
    }

    const rpcStartedAt = performance.now();
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "start_exam_session_atomic",
      { p_exam_id: examId }
    );
    const rpcFinishedAt = performance.now();

    if (rpcError) {
      return NextResponse.json(
        {
          ok: false,
          error: rpcError.message,
          durationMs: Math.round(performance.now() - requestStartedAt),
        },
        { status: 500 }
      );
    }

    const result = (rpcResult ?? {}) as Record<string, unknown>;
    if (result.error || result.expired_session_id) {
      return NextResponse.json(
        {
          ok: false,
          error: String(result.error ?? "expired_session"),
          result,
          durationMs: Math.round(performance.now() - requestStartedAt),
        },
        { status: 409 }
      );
    }

    const cacheKey = getQuestionCacheKey(examId);
    let payloadCacheHit = false;
    const payloadCacheWarmed = false;
    let payloadQuestionCount = 0;
    let minimalQuestions: MinimalStressQuestion[] = [];

    const cachedPayload = await redis.get(cacheKey);
    if (cachedPayload) {
      payloadCacheHit = true;
      payloadQuestionCount = getCachedQuestionCount(cachedPayload);
      minimalQuestions = toMinimalQuestionList(cachedPayload);
    }

    if (minimalQuestions.length === 0) {
      const { data: questionRows } = await supabase
        .from("questions")
        .select("id, type, options")
        .eq("exam_id", examId)
        .order("order_index", { ascending: true });

      minimalQuestions = (questionRows ?? []).map((question) => ({
        id: String(question.id),
        type: String(question.type),
        options: Array.isArray(question.options)
          ? question.options.map((option) => String(option))
          : null,
      }));
      payloadQuestionCount = minimalQuestions.length;
    }

    const readyAt = performance.now();
    const startRpcDurationMs = Math.round(rpcFinishedAt - rpcStartedAt);
    const startActionDurationMs = Math.round(rpcFinishedAt - requestStartedAt);
    const readyToAnswerDurationMs = Math.round(readyAt - requestStartedAt);
    const startPostCreateDurationMs = Math.max(
      readyToAnswerDurationMs - startActionDurationMs,
      0
    );

    return NextResponse.json({
      ok: true,
      examId,
      userId: user.id,
      session: result.session ?? null,
      payloadCacheHit,
      payloadCacheWarmed,
      payloadQuestionCount,
      questions: minimalQuestions,
      startActionDurationMs,
      startRpcDurationMs,
      startPostCreateDurationMs,
      readyToAnswerDurationMs,
      durationMs: readyToAnswerDurationMs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
        durationMs: Math.round(performance.now() - requestStartedAt),
      },
      { status: 500 }
    );
  }
}
