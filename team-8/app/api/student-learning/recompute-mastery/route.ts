import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/notification/cron";
import { processPendingStudentMasteryRefreshJobs } from "@/lib/student-learning/actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 10);

  try {
    const result = await processPendingStudentMasteryRefreshJobs(limit);
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
      { status: 500 }
    );
  }
}
