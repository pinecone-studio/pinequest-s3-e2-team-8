import { parseExamProcessingJob } from "@/lib/aws/jobs";
import { processExamProcessingJob } from "@/lib/student/actions";

type SqsRecord = {
  body: string;
  messageId: string;
};

type SqsEvent = {
  Records?: SqsRecord[];
};

type BatchItemFailure = {
  itemIdentifier: string;
};

export async function handler(event: SqsEvent) {
  const batchItemFailures: BatchItemFailure[] = [];

  for (const record of event.Records ?? []) {
    try {
      const job = parseExamProcessingJob(record.body);
      const result = await processExamProcessingJob(job, {
        allowRevalidate: false,
      });

      console.info("[exam-worker] processed", {
        finalStatus: result.finalStatus,
        gradingPending: result.gradingPending,
        messageId: record.messageId,
        sessionId: job.sessionId,
      });
    } catch (error) {
      console.error("[exam-worker] failed", {
        error: error instanceof Error ? error.message : "unknown_error",
        messageId: record.messageId,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
