import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  STRESS_EXAM_ID,
  STRESS_PASSWORD,
  STRESS_USER_COUNT,
} from "./shared.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..", "..");
const RESULTS_ROOT = resolve(
  APP_ROOT,
  "stress-results",
  new Date().toISOString().replace(/[:.]/g, "-")
);
const DEFAULT_PORT = Number(process.env.STRESS_PORT || 3100);
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${DEFAULT_PORT}`;
const SIZES = [50, 100, 500];
const LOCAL_K6_PATH = resolve(
  APP_ROOT,
  ".stress-tools",
  "k6-v1.7.1-macos-arm64",
  "k6"
);

function formatMetric(metric) {
  if (!metric) return "-";
  return `${metric.avg?.toFixed?.(1) ?? "-"} / ${metric.p95?.toFixed?.(1) ?? "-"} / ${metric.p99?.toFixed?.(1) ?? "-"} / ${metric.max?.toFixed?.(1) ?? "-"}`;
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: APP_ROOT,
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? "inherit",
      shell: options.shell ?? false,
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        rejectPromise(
          new Error(`${command} ${args.join(" ")} failed with code ${code}\n${stderr}`)
        );
      }
    });
  });
}

async function resolveK6Binary() {
  if (process.env.K6_BIN) {
    return process.env.K6_BIN;
  }

  try {
    const whichResult = await spawnCommand("sh", ["-lc", "command -v k6"], {
      stdio: "pipe",
    });
    const binary = whichResult.stdout.trim();
    if (binary) {
      return binary;
    }
  } catch {
    // ignore
  }

  try {
    await spawnCommand("sh", ["-lc", `test -x "${LOCAL_K6_PATH}"`], {
      stdio: "pipe",
    });
    return LOCAL_K6_PATH;
  } catch {
    // continue
  }

  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error(
      "k6 is not installed. Set K6_BIN or install k6 manually for your platform."
    );
  }

  const toolsDir = resolve(APP_ROOT, ".stress-tools");
  await mkdir(toolsDir, { recursive: true });
  const zipPath = join(toolsDir, "k6.zip");
  const extractDir = resolve(APP_ROOT, ".stress-tools", "k6-v1.7.1-macos-arm64");

  await rm(zipPath, { force: true });
  await spawnCommand("curl", [
    "-fL",
    "--retry",
    "3",
    "--retry-delay",
    "2",
    "-o",
    zipPath,
    "https://github.com/grafana/k6/releases/download/v1.7.1/k6-v1.7.1-macos-arm64.zip",
  ]);
  await rm(extractDir, { recursive: true, force: true });
  await spawnCommand("ditto", ["-x", "-k", zipPath, resolve(APP_ROOT, ".stress-tools")]);
  await spawnCommand("chmod", ["+x", LOCAL_K6_PATH]);
  return LOCAL_K6_PATH;
}

async function waitForServer(baseUrl, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await fetch(`${baseUrl}/api/ping`);
      if (result.ok) return;
    } catch {
      // ignore
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }

  throw new Error(`Server at ${baseUrl} did not become ready.`);
}

async function fetchJson(url, secret) {
  const response = await fetch(url, {
    headers: {
      "x-cron-secret": secret,
    },
  });

  const body = await response.text();
  return {
    status: response.status,
    json: body ? JSON.parse(body) : null,
  };
}

function buildAggregateMarkdown(runRows) {
  const lines = [
    "# Local Stress Benchmark",
    "",
    "| users | start action avg/p95/p99/max (ms) | start rpc avg/p95/p99/max (ms) | ready avg/p95/p99/max (ms) | checkpoint avg/p95/p99/max (ms) | submit avg/p95/p99/max (ms) | flow avg/p95/p99/max (ms) | start success | submit success | dup sessions | dup answers | corrupted sessions |",
    "| ---: | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of runRows) {
    lines.push(
      `| ${row.users} | ${formatMetric(row.summary.metrics.start_action_ms)} | ${formatMetric(row.summary.metrics.start_rpc_ms)} | ${formatMetric(row.summary.metrics.ready_to_answer_ms)} | ${formatMetric(row.summary.metrics.checkpoint_ms)} | ${formatMetric(row.summary.metrics.submit_ms)} | ${formatMetric(row.summary.metrics.flow_ms)} | ${(row.summary.success.start_success * 100).toFixed(2)}% | ${(row.summary.success.submit_success * 100).toFixed(2)}% | ${row.integrity.json?.duplicateInProgressUsers?.length ?? 0} | ${row.integrity.json?.duplicateAnswerRows?.length ?? 0} | ${row.integrity.json?.corruptedSessions?.length ?? 0} |`
    );
  }

  return lines.join("\n");
}

async function runOneBenchmark({
  k6Bin,
  users,
  runDir,
  secret,
  sessionFile,
}) {
  const runLabel = `${String(users).padStart(3, "0")}-users`;

  await mkdir(runDir, { recursive: true });
  await spawnCommand(k6Bin, [
    "run",
    resolve(APP_ROOT, "scripts/k6/local-exam-full-flow.js"),
    "-e",
    `BASE_URL=${BASE_URL}`,
    "-e",
    `EXAM_ID=${STRESS_EXAM_ID}`,
    "-e",
    "STUDENT_PREFIX=stressstudent",
    "-e",
    "STUDENT_START=1",
    "-e",
    `STUDENT_COUNT=${users}`,
    "-e",
    `VUS=${users}`,
    "-e",
    `PASSWORD=${STRESS_PASSWORD}`,
    "-e",
    `CRON_SECRET=${secret}`,
    "-e",
    `RESULTS_DIR=${runDir}`,
    "-e",
    `RUN_LABEL=${runLabel}`,
    "-e",
    `SESSION_FILE=${sessionFile}`,
    "-e",
    "RESET_BEFORE_RUN=1",
    "-e",
    "WARM_PAYLOAD_CACHE=1",
  ]);

  const summary = JSON.parse(
    await readFile(join(runDir, "k6-summary.json"), "utf8")
  );
  const integrity = await fetchJson(
    `${BASE_URL}/api/test/stress/exam-integrity?examId=${encodeURIComponent(STRESS_EXAM_ID)}`,
    secret
  );

  await writeFile(
    join(runDir, "integrity.json"),
    JSON.stringify(integrity.json, null, 2)
  );

  return {
    users,
    summary,
    integrity,
  };
}

async function main() {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    throw new Error("CRON_SECRET is required.");
  }

  await mkdir(RESULTS_ROOT, { recursive: true });
  const k6Bin = await resolveK6Binary();
  const sessionFile = join(RESULTS_ROOT, "stress-sessions.json");

  await spawnCommand("node", [resolve(APP_ROOT, "scripts/stress/setup-dataset.mjs")]);

  if (process.env.SKIP_BUILD !== "1") {
    await spawnCommand("npm", ["run", "build"]);
  }

  const server = spawn("npm", ["run", "start", "--", "--port", String(DEFAULT_PORT)], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      PORT: String(DEFAULT_PORT),
      ENABLE_LOCAL_STRESS_ROUTES: "true",
    },
    stdio: "inherit",
  });

  try {
    await waitForServer(BASE_URL);
    await spawnCommand(
      "node",
      [resolve(APP_ROOT, "scripts/stress/create-session-cache.mjs")],
      {
        env: {
          BASE_URL,
          CRON_SECRET: cronSecret,
          STRESS_SESSION_FILE: sessionFile,
        },
      }
    );

    const runRows = [];
    for (const users of SIZES) {
      if (users > STRESS_USER_COUNT) {
        throw new Error(`Requested ${users} users but only ${STRESS_USER_COUNT} stress users exist.`);
      }

      const runDir = join(RESULTS_ROOT, `${String(users).padStart(3, "0")}-users`);
      const row = await runOneBenchmark({
        k6Bin,
        users,
        runDir,
        secret: cronSecret,
        sessionFile,
      });
      runRows.push(row);
    }

    const aggregate = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      examId: STRESS_EXAM_ID,
      runs: runRows,
    };

    await writeFile(
      join(RESULTS_ROOT, "aggregate.json"),
      JSON.stringify(aggregate, null, 2)
    );
    await writeFile(
      join(RESULTS_ROOT, "aggregate.md"),
      buildAggregateMarkdown(runRows)
    );

    console.log(`Stress benchmark results saved to ${RESULTS_ROOT}`);
  } finally {
    server.kill("SIGINT");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
