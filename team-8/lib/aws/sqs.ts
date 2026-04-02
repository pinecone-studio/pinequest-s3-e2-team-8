import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { ExamProcessingJob, LearningJob } from "@/lib/aws/jobs";

type QueuePublishResult = {
  queued: boolean;
  fallbackRequired: boolean;
  queueUrl?: string | null;
};

let sqsClient: SQSClient | null = null;

function getAwsRegion() {
  return process.env.AWS_REGION?.trim() || null;
}

function getExamQueueUrl() {
  return process.env.AWS_SQS_EXAM_QUEUE_URL?.trim() || null;
}

function getLearningQueueUrl() {
  return process.env.AWS_SQS_LEARNING_QUEUE_URL?.trim() || null;
}

function isAwsCredentialConfigured() {
  return Boolean(
    getAwsRegion() &&
      process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
}

function getSqsClient() {
  if (sqsClient) {
    return sqsClient;
  }

  const region = getAwsRegion();
  if (!region) {
    throw new Error("AWS_REGION is not configured.");
  }

  sqsClient = new SQSClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() ?? "",
    },
  });
  return sqsClient;
}

async function publishJsonMessage(
  queueUrl: string | null,
  message: Record<string, unknown>,
): Promise<QueuePublishResult> {
  if (!queueUrl || !isAwsCredentialConfigured()) {
    return {
      queued: false,
      fallbackRequired: true,
      queueUrl,
    };
  }

  const client = getSqsClient();
  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
    }),
  );

  return {
    queued: true,
    fallbackRequired: false,
    queueUrl,
  };
}

export async function publishExamProcessingJob(
  job: ExamProcessingJob,
): Promise<QueuePublishResult> {
  return publishJsonMessage(getExamQueueUrl(), job);
}

export async function publishLearningJob(
  job: LearningJob,
): Promise<QueuePublishResult> {
  return publishJsonMessage(getLearningQueueUrl(), job);
}

export function isExamQueueConfigured() {
  return Boolean(getExamQueueUrl() && isAwsCredentialConfigured());
}

export function isLearningQueueConfigured() {
  return Boolean(getLearningQueueUrl() && isAwsCredentialConfigured());
}
