import { parseLearningJob } from "@/lib/aws/jobs";
import { processLearningQueueJob } from "@/lib/student-learning/actions";

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
      const job = parseLearningJob(record.body);
      const result = await processLearningQueueJob(job, {
        allowRevalidate: false,
      });

      console.info("[learning-worker] processed", {
        kind: result.kind,
        messageId: record.messageId,
        processed: result.processed,
        status: result.status,
      });
    } catch (error) {
      console.error("[learning-worker] failed", {
        error: error instanceof Error ? error.message : "unknown_error",
        messageId: record.messageId,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
