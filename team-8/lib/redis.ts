import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function createRatelimit(limit: number, window: `${number} s` | `${number} m`) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
  });
}

export const startExamRateLimit = createRatelimit(6, "10 s");
export const submitExamRateLimit = createRatelimit(4, "30 s");
export const proctorEventRateLimit = createRatelimit(40, "60 s");

// Backward-compatible generic limiter
export const ratelimit = startExamRateLimit;
