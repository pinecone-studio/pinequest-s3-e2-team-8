# AWS Free-Tier Worker Setup

This project keeps the Next.js web app on Vercel and offloads heavy async jobs to AWS SQS + Lambda.

## Resources to create

Use the AWS console and create these resources in the same region:

- `pinequest-exam-processing` Standard Queue
- `pinequest-exam-processing-dlq` Standard Queue
- `pinequest-learning` Standard Queue
- `pinequest-learning-dlq` Standard Queue
- `pinequest-exam-worker` Lambda
- `pinequest-learning-worker` Lambda

Recommended defaults:

- Region: nearest to your Supabase project. If unsure, use `ap-northeast-1`.
- Lambda runtime: `Node.js 22`
- Lambda architecture: `arm64`
- Exam worker reserved concurrency: `2`
- Learning worker reserved concurrency: `1`
- Exam queue visibility timeout: `10 minutes`
- Learning queue visibility timeout: `5 minutes`
- SQS batch size: `1`
- Max receive count before DLQ: `3`

## Vercel environment variables

Add these to the Vercel project:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SQS_EXAM_QUEUE_URL`
- `AWS_SQS_LEARNING_QUEUE_URL`

## Lambda environment variables

Add these to both Lambda functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Add the existing AI-provider keys to the exam worker so essay grading can run there.

## Build artifacts

Build the Lambda bundles locally:

```bash
npm install
npm run aws:workers:build
npm run aws:workers:package
```

This outputs:

- `.aws-dist/exam-worker/index.js`
- `.aws-dist/learning-worker/index.js`
- `.aws-dist/exam-worker.zip`
- `.aws-dist/learning-worker.zip`

Upload each zip file to the matching Lambda function.

## Lambda handlers

Configure these handlers in AWS:

- exam worker: `index.handler`
- learning worker: `index.handler`

## Queue wiring

Connect SQS triggers like this:

- `pinequest-exam-processing` -> `pinequest-exam-worker`
- `pinequest-learning` -> `pinequest-learning-worker`

Use:

- batch size: `1`
- partial batch response: enabled
- DLQ redrive policy: enabled

## Failure model

- Student submit succeeds even if queue publish fails.
- If queue publish fails on Vercel, the app falls back to `after(...)` processing.
- Manual recovery routes remain available:
  - `/api/exam-results/process`
  - `/api/student-learning/process`
