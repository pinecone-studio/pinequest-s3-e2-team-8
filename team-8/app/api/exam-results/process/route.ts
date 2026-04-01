import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/notification/cron";
import { processPendingReleasedExamResults } from "@/lib/student/actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 10);

  try {
    const result = await processPendingReleasedExamResults(limit);
    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
