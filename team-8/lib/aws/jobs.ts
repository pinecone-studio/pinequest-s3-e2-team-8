export type ExamProcessingTrigger =
  | "student_submit"
  | "timeout_finalize"
  | "manual_recovery";

export type ActionRequiredReason =
  | "essay_review"
  | "proctor_flag"
  | "essay_review_and_proctor_flag";

export type ExamProcessingJob = {
  sessionId: string;
  examId: string;
  userId: string;
  reason: "submit" | "timeout";
  queuedAt: string;
  triggeredBy: ExamProcessingTrigger;
  actionRequiredReason?: ActionRequiredReason | null;
};

export type LearningJobType =
  | "mastery_refresh"
  | "study_plan"
  | "practice_build";

export type LearningJob = {
  jobType: LearningJobType;
  studentId: string;
  subjectId?: string | null;
  practiceExamId?: string | null;
  queuedAt: string;
  triggeredBy:
    | "enqueue_mastery_refresh"
    | "study_plan_request"
    | "practice_build_request"
    | "practice_build_retry"
    | "manual_recovery"
    | "student_page_poller";
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseExamProcessingJob(raw: unknown): ExamProcessingJob {
  if (!isObject(raw)) {
    throw new Error("Invalid exam processing job payload.");
  }

  const sessionId = String(raw.sessionId ?? "").trim();
  const examId = String(raw.examId ?? "").trim();
  const userId = String(raw.userId ?? "").trim();
  const reason = raw.reason === "timeout" ? "timeout" : "submit";
  const queuedAt = String(raw.queuedAt ?? "").trim();
  const triggeredBy = String(raw.triggeredBy ?? "").trim();
  const actionRequiredReasonRaw = raw.actionRequiredReason;
  const actionRequiredReason =
    actionRequiredReasonRaw === "essay_review" ||
    actionRequiredReasonRaw === "proctor_flag" ||
    actionRequiredReasonRaw === "essay_review_and_proctor_flag"
      ? actionRequiredReasonRaw
      : null;

  if (!sessionId || !examId || !userId || !queuedAt || !triggeredBy) {
    throw new Error("Exam processing job is missing required fields.");
  }

  return {
    sessionId,
    examId,
    userId,
    reason,
    queuedAt,
    triggeredBy: triggeredBy as ExamProcessingTrigger,
    actionRequiredReason,
  };
}

export function parseLearningJob(raw: unknown): LearningJob {
  if (!isObject(raw)) {
    throw new Error("Invalid learning job payload.");
  }

  const jobType = String(raw.jobType ?? "").trim();
  const studentId = String(raw.studentId ?? "").trim();
  const queuedAt = String(raw.queuedAt ?? "").trim();
  const triggeredBy = String(raw.triggeredBy ?? "").trim();
  const subjectId = raw.subjectId == null ? null : String(raw.subjectId).trim();
  const practiceExamId =
    raw.practiceExamId == null ? null : String(raw.practiceExamId).trim();

  if (
    !["mastery_refresh", "study_plan", "practice_build"].includes(jobType) ||
    !studentId ||
    !queuedAt ||
    !triggeredBy
  ) {
    throw new Error("Learning job is missing required fields.");
  }

  return {
    jobType: jobType as LearningJobType,
    studentId,
    subjectId,
    practiceExamId,
    queuedAt,
    triggeredBy: triggeredBy as LearningJob["triggeredBy"],
  };
}
