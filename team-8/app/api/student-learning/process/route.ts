import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/notification/cron";
import { processPendingStudentLearningJobs } from "@/lib/student-learning/actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);

  try {
    const result = await processPendingStudentLearningJobs({
      masteryBatchSize: Number(url.searchParams.get("masteryLimit") ?? 10),
      studyPlanBatchSize: Number(url.searchParams.get("studyPlanLimit") ?? 2),
      practiceBuildBatchSize: Number(url.searchParams.get("practiceLimit") ?? 2),
    });

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
