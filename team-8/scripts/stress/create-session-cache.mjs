import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STRESS_PASSWORD,
  STRESS_USER_COUNT,
  getStressEmail,
} from "./shared.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..", "..");
const OUTPUT_PATH =
  process.env.STRESS_SESSION_FILE ||
  resolve(APP_ROOT, "stress-results", "stress-sessions.json");
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3100";
const CRON_SECRET =
  process.env.CRON_SECRET || "smart-exam-local-cron-secret-2026";
const SESSION_COUNT = Number(process.env.STRESS_SESSION_COUNT || STRESS_USER_COUNT);
const LOGIN_RETRIES = Number(process.env.STRESS_LOGIN_RETRIES || 10);
const LOGIN_RETRY_DELAY_MS = Number(process.env.STRESS_LOGIN_RETRY_DELAY_MS || 1000);
const REQUEST_TIMEOUT_MS = Number(process.env.STRESS_LOGIN_TIMEOUT_MS || 20000);

function shouldRetryLogin(response, errorMessage) {
  const message = String(errorMessage ?? "");
  return (
    response?.status === 429 ||
    response?.status === 401 ||
    message.includes("Request rate limit reached") ||
    message.toLowerCase().includes("rate limit")
  );
}

async function loginStressUser(index) {
  const email = getStressEmail(index);

  for (let attempt = 0; attempt <= LOGIN_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    let body = null;

    try {
      response = await fetch(`${BASE_URL}/api/test/stress/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": CRON_SECRET,
        },
        body: JSON.stringify({
          email,
          password: STRESS_PASSWORD,
        }),
        signal: controller.signal,
      });
      body = await response.json();
    } catch (error) {
      clearTimeout(timeout);

      if (attempt < LOGIN_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(LOGIN_RETRY_DELAY_MS * (attempt + 1), 5000))
        );
        continue;
      }

      throw new Error(
        `Failed to create session for ${email}: ${
          error instanceof Error ? error.message : "network_error"
        }`
      );
    }

    clearTimeout(timeout);

    if (response.ok && body?.accessToken && body?.userId) {
      return {
        email: body.email ?? email,
        userId: body.userId,
        accessToken: body.accessToken,
        expiresAt: body.expiresAt ?? null,
      };
    }

    if (attempt < LOGIN_RETRIES && shouldRetryLogin(response, body?.error)) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(LOGIN_RETRY_DELAY_MS * (attempt + 1), 5000))
      );
      continue;
    }

    throw new Error(
      `Failed to create session for ${email}: ${body?.error ?? response.status}`
    );
  }

  throw new Error(`Failed to create session for ${email}: retries exhausted`);
}

async function main() {
  const sessions = [];
  for (let index = 1; index <= SESSION_COUNT; index += 1) {
    sessions.push(await loginStressUser(index));
    if (index % 25 === 0 || index === SESSION_COUNT) {
      console.log(`Prepared ${index}/${SESSION_COUNT} stress sessions...`);
    }
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(sessions, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputPath: OUTPUT_PATH,
        sessionCount: sessions.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
