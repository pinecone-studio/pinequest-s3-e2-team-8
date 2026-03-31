import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";
import { check, fail, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const EXAM_ID = __ENV.EXAM_ID;
const PASSWORD = __ENV.PASSWORD || "PineExam123!";
const STUDENT_PREFIX = __ENV.STUDENT_PREFIX || "stressstudent";
const STUDENT_START = Number(__ENV.STUDENT_START || 1);
const STUDENT_COUNT = Number(__ENV.STUDENT_COUNT || 50);
const VUS = Number(__ENV.VUS || STUDENT_COUNT);
const STRESS_SECRET =
  __ENV.STRESS_SECRET ||
  __ENV.CRON_SECRET ||
  "smart-exam-local-cron-secret-2026";
const RESET_BEFORE_RUN = (__ENV.RESET_BEFORE_RUN || "1") === "1";
const WARM_PAYLOAD_CACHE = (__ENV.WARM_PAYLOAD_CACHE || "1") === "1";
const START_RETRIES = Number(__ENV.START_RETRIES || 6);
const SUBMIT_RETRIES = Number(__ENV.SUBMIT_RETRIES || 2);
const LOGIN_RETRIES = Number(__ENV.LOGIN_RETRIES || 8);
const LOGIN_RETRY_SLEEP_SECONDS = Number(
  __ENV.LOGIN_RETRY_SLEEP_SECONDS || 0.75
);
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || "180s";
const RESULTS_DIR = __ENV.RESULTS_DIR || ".";
const RUN_LABEL = __ENV.RUN_LABEL || `run-${STUDENT_COUNT}`;
const SESSION_FILE = __ENV.SESSION_FILE || "";
const PRELOADED_USERS = SESSION_FILE ? JSON.parse(open(SESSION_FILE)) : null;

const startActionMs = new Trend("start_action_ms");
const startRpcMs = new Trend("start_rpc_ms");
const startPostCreateMs = new Trend("start_postcreate_ms");
const readyToAnswerMs = new Trend("ready_to_answer_ms");
const checkpointServerMs = new Trend("checkpoint_ms");
const submitServerMs = new Trend("submit_ms");
const flowClientMs = new Trend("flow_ms");
const startSuccess = new Rate("start_success");
const checkpointSuccess = new Rate("checkpoint_success");
const submitSuccess = new Rate("submit_success");
const startRetries = new Counter("start_retry_count");
const submitRetries = new Counter("submit_retry_count");

const statusCounters = {
  start: {
    200: new Counter("start_status_200"),
    409: new Counter("start_status_409"),
    429: new Counter("start_status_429"),
    500: new Counter("start_status_500"),
  },
  checkpoint: {
    200: new Counter("checkpoint_status_200"),
    409: new Counter("checkpoint_status_409"),
    429: new Counter("checkpoint_status_429"),
    500: new Counter("checkpoint_status_500"),
  },
  submit: {
    200: new Counter("submit_status_200"),
    404: new Counter("submit_status_404"),
    409: new Counter("submit_status_409"),
    429: new Counter("submit_status_429"),
    500: new Counter("submit_status_500"),
  },
};

export const options = {
  scenarios: {
    full_flow: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: "10m",
    },
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  thresholds: {
    http_req_failed: ["rate<0.10"],
  },
};

function jsonHeaders(extra = {}) {
  return {
    "content-type": "application/json",
    "x-cron-secret": STRESS_SECRET,
    ...extra,
  };
}

function requestParams(extraHeaders = {}) {
  return {
    headers: jsonHeaders(extraHeaders),
    timeout: REQUEST_TIMEOUT,
  };
}

function studentEmail(index) {
  return `${STUDENT_PREFIX}${String(index).padStart(3, "0")}@pineexam.test`;
}

function recordStatus(action, response) {
  const counter = statusCounters[action]?.[response.status];
  if (counter) {
    counter.add(1);
  }
}

function buildAnswerForQuestion(question, index) {
  if (Array.isArray(question.options) && question.options.length > 0) {
    return String(question.options[0]);
  }

  if (Array.isArray(question.matching_prompts) && question.matching_prompts.length > 0) {
    const pairs = {};
    for (const prompt of question.matching_prompts) {
      pairs[prompt] = question.matching_choices?.[0] || "";
    }
    return JSON.stringify(pairs);
  }

  return `stress-answer-${index + 1}`;
}

function buildAnalyticsMap(questionIds) {
  const timestamp = new Date().toISOString();
  const result = {};
  for (const questionId of questionIds) {
    result[questionId] = {
      firstAnsweredAt: timestamp,
      lastChangedAt: timestamp,
      changeCount: 1,
    };
  }
  return result;
}

function safeJson(response) {
  if (!response || !response.body) {
    return null;
  }

  try {
    return response.json();
  } catch {
    return null;
  }
}

function metricValues(metric) {
  return metric?.values
    ? {
        avg: metric.values.avg ?? null,
        min: metric.values.min ?? null,
        med: metric.values.med ?? null,
        max: metric.values.max ?? null,
        p90: metric.values["p(90)"] ?? null,
        p95: metric.values["p(95)"] ?? null,
        p99: metric.values["p(99)"] ?? null,
      }
    : null;
}

function rateValue(metric) {
  return metric?.values?.rate ?? 0;
}

function countValue(metric) {
  return metric?.values?.count ?? 0;
}

function summaryMarkdown(summary) {
  const rows = [
    ["start_action_ms", summary.metrics.start_action_ms, summary.success.start_success],
    ["start_rpc_ms", summary.metrics.start_rpc_ms, null],
    ["start_postcreate_ms", summary.metrics.start_postcreate_ms, null],
    ["ready_to_answer_ms", summary.metrics.ready_to_answer_ms, null],
    ["checkpoint_ms", summary.metrics.checkpoint_ms, summary.success.checkpoint_success],
    ["submit_ms", summary.metrics.submit_ms, summary.success.submit_success],
    ["flow_ms", summary.metrics.flow_ms, null],
  ];

  const header = [
    `# k6 Full Flow Summary (${summary.runLabel})`,
    "",
    "| metric | avg | p50 | p95 | p99 | max | success |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  const body = rows.map(([label, metric, success]) => {
    const successCell = success === null ? "-" : `${(success * 100).toFixed(2)}%`;
    return `| ${label} | ${metric?.avg?.toFixed?.(2) ?? "-"} | ${metric?.med?.toFixed?.(2) ?? "-"} | ${metric?.p95?.toFixed?.(2) ?? "-"} | ${metric?.p99?.toFixed?.(2) ?? "-"} | ${metric?.max?.toFixed?.(2) ?? "-"} | ${successCell} |`;
  });

  return header.concat(body).join("\n");
}

function shouldRetryLogin(response, body) {
  const message = String(body?.error ?? response.body ?? "");
  return (
    response.status === 429 ||
    message.includes("Request rate limit reached") ||
    message.includes("rate limit")
  );
}

export function setup() {
  if (!EXAM_ID) {
    fail("EXAM_ID env is required.");
  }

  let users = [];
  const selectedEmails = Array.from(
    { length: STUDENT_COUNT },
    (_, offset) => studentEmail(STUDENT_START + offset)
  );

  if (PRELOADED_USERS) {
    const sessionMap = new Map(
      PRELOADED_USERS.map((user) => [String(user.email), user])
    );

    users = selectedEmails.map((email) => {
      const session = sessionMap.get(email);
      if (!session?.accessToken || !session?.userId) {
        fail(`Missing preloaded session for ${email}`);
      }

      return {
        email: session.email,
        userId: session.userId,
        accessToken: session.accessToken,
      };
    });
  } else {
    for (const email of selectedEmails) {
      let loginResponse;
      let loginBody = null;

      for (let attempt = 0; attempt <= LOGIN_RETRIES; attempt += 1) {
        loginResponse = http.post(
          `${BASE_URL}/api/test/stress/login`,
          JSON.stringify({
            email,
            password: PASSWORD,
          }),
          requestParams()
        );
        loginBody = safeJson(loginResponse);

        if (
          loginResponse.status === 200 &&
          loginBody &&
          loginBody.accessToken
        ) {
          break;
        }

        if (
          attempt < LOGIN_RETRIES &&
          shouldRetryLogin(loginResponse, loginBody)
        ) {
          sleep(Math.min(LOGIN_RETRY_SLEEP_SECONDS * (attempt + 1), 3));
          continue;
        }

        fail(`Login failed for ${email}: ${loginResponse.status} ${loginResponse.body}`);
      }

      const ok = check(loginResponse, {
        "login status is 200": (res) => res.status === 200,
        "login returned token": () => Boolean(loginBody && loginBody.accessToken),
      });

      if (!ok) {
        fail(`Login failed for ${email}: ${loginResponse.status} ${loginResponse.body}`);
      }

      users.push({
        email: loginBody.email,
        userId: loginBody.userId,
        accessToken: loginBody.accessToken,
      });
    }
  }

  if (RESET_BEFORE_RUN) {
    const resetResponse = http.post(
      `${BASE_URL}/api/test/stress/reset-exam`,
      JSON.stringify({
        examId: EXAM_ID,
        userIds: users.map((user) => user.userId),
      }),
      requestParams()
    );

    const resetOk = check(resetResponse, {
      "reset status is 200": (res) => res.status === 200,
    });

    if (!resetOk) {
      fail(`Reset failed: ${resetResponse.status} ${resetResponse.body}`);
    }
  }

  return { users };
}

export default function fullFlow(data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const flowStartedAt = Date.now();

  let startResponse;
  let startBody;
  let startAttempt = 0;

  while (startAttempt <= START_RETRIES) {
    startResponse = http.post(
      `${BASE_URL}/api/test/stress/exam-start`,
      JSON.stringify({
        examId: EXAM_ID,
        warmPayloadCache: WARM_PAYLOAD_CACHE,
      }),
      {
        ...requestParams({
          authorization: `Bearer ${user.accessToken}`,
        }),
      }
    );

    startBody = safeJson(startResponse);
    recordStatus("start", startResponse);

    if (startResponse.status === 200 && startBody?.session?.id) {
      break;
    }

    startAttempt += 1;
    startRetries.add(1);
    sleep(Math.min(0.25 * startAttempt, 1.5));
  }

  const startOk = startResponse.status === 200;
  startSuccess.add(startOk);

  if (!startOk) {
    return;
  }

  startActionMs.add(
    Number(startBody.startActionDurationMs ?? startBody.durationMs ?? startResponse.timings.duration)
  );
  startRpcMs.add(
    Number(startBody.startRpcDurationMs ?? startResponse.timings.duration)
  );
  startPostCreateMs.add(
    Number(
      startBody.startPostCreateDurationMs ??
        Math.max(
          Number(startBody.durationMs ?? startResponse.timings.duration) -
            Number(startBody.startActionDurationMs ?? 0),
          0
        )
    )
  );
  readyToAnswerMs.add(
    Number(startBody.readyToAnswerDurationMs ?? startBody.durationMs ?? startResponse.timings.duration)
  );

  check(startResponse, {
    "start status is 200": (res) => res.status === 200,
    "start returned session": () => Boolean(startBody?.session?.id),
  });

  const questions = Array.isArray(startBody.questions) ? startBody.questions : [];
  const midpoint = Math.max(1, Math.ceil(questions.length / 2));
  const firstHalf = questions.slice(0, midpoint);
  const secondHalf = questions.slice(midpoint);
  const firstAnswers = Object.fromEntries(
    firstHalf.map((question, index) => [
      question.id,
      buildAnswerForQuestion(question, index),
    ])
  );
  const allAnswers = Object.fromEntries(
    questions.map((question, index) => [
      question.id,
      buildAnswerForQuestion(question, index),
    ])
  );

  const checkpointRequests = [
    {
      answers: firstAnswers,
      answerAnalytics: buildAnalyticsMap(Object.keys(firstAnswers)),
    },
  ];

  if (secondHalf.length > 0) {
    checkpointRequests.push({
      answers: allAnswers,
      answerAnalytics: buildAnalyticsMap(Object.keys(allAnswers)),
    });
  }

  for (const checkpoint of checkpointRequests) {
    const response = http.post(
      `${BASE_URL}/api/test/stress/exam-checkpoint`,
      JSON.stringify({
        sessionId: startBody.session.id,
        answers: checkpoint.answers,
        answerAnalytics: checkpoint.answerAnalytics,
      }),
      {
        ...requestParams({
          authorization: `Bearer ${user.accessToken}`,
        }),
      }
    );

    const body = safeJson(response);
    recordStatus("checkpoint", response);
    const ok = response.status === 200;
    checkpointSuccess.add(ok);

    if (ok) {
      checkpointServerMs.add(
        Number(body.durationMs ?? response.timings.duration)
      );
    }

    if (!ok) {
      return;
    }
  }

  let submitResponse;
  let submitBody;
  let submitAttempt = 0;

  while (submitAttempt <= SUBMIT_RETRIES) {
    submitResponse = http.post(
      `${BASE_URL}/api/test/stress/exam-submit`,
      JSON.stringify({
        sessionId: startBody.session.id,
      }),
      {
        ...requestParams({
          authorization: `Bearer ${user.accessToken}`,
        }),
      }
    );

    submitBody = safeJson(submitResponse);
    recordStatus("submit", submitResponse);

    if (submitResponse.status === 200) {
      break;
    }

    submitAttempt += 1;
    submitRetries.add(1);
    sleep(Math.min(0.35 * submitAttempt, 1.5));
  }

  const submitOk = submitResponse.status === 200;
  submitSuccess.add(submitOk);

  if (!submitOk) {
    return;
  }

  submitServerMs.add(
    Number(submitBody.durationMs ?? submitResponse.timings.duration)
  );
  flowClientMs.add(Date.now() - flowStartedAt);
}

export function teardown() {
  const response = http.get(
    `${BASE_URL}/api/test/stress/exam-integrity?examId=${encodeURIComponent(EXAM_ID)}`,
    requestParams()
  );

  console.log(`exam-integrity => ${response.status} ${response.body}`);
}

export function handleSummary(data) {
  const summary = {
    runLabel: RUN_LABEL,
    generatedAt: new Date().toISOString(),
    metrics: {
      start_action_ms: metricValues(data.metrics.start_action_ms),
      start_rpc_ms: metricValues(data.metrics.start_rpc_ms),
      start_postcreate_ms: metricValues(data.metrics.start_postcreate_ms),
      ready_to_answer_ms: metricValues(data.metrics.ready_to_answer_ms),
      checkpoint_ms: metricValues(data.metrics.checkpoint_ms),
      submit_ms: metricValues(data.metrics.submit_ms),
      flow_ms: metricValues(data.metrics.flow_ms),
    },
    success: {
      start_success: rateValue(data.metrics.start_success),
      checkpoint_success: rateValue(data.metrics.checkpoint_success),
      submit_success: rateValue(data.metrics.submit_success),
    },
    counts: {
      start_retry_count: countValue(data.metrics.start_retry_count),
      submit_retry_count: countValue(data.metrics.submit_retry_count),
      start_status_200: countValue(data.metrics.start_status_200),
      start_status_409: countValue(data.metrics.start_status_409),
      start_status_429: countValue(data.metrics.start_status_429),
      start_status_500: countValue(data.metrics.start_status_500),
      checkpoint_status_200: countValue(data.metrics.checkpoint_status_200),
      checkpoint_status_409: countValue(data.metrics.checkpoint_status_409),
      checkpoint_status_429: countValue(data.metrics.checkpoint_status_429),
      checkpoint_status_500: countValue(data.metrics.checkpoint_status_500),
      submit_status_200: countValue(data.metrics.submit_status_200),
      submit_status_404: countValue(data.metrics.submit_status_404),
      submit_status_409: countValue(data.metrics.submit_status_409),
      submit_status_429: countValue(data.metrics.submit_status_429),
      submit_status_500: countValue(data.metrics.submit_status_500),
    },
  };

  return {
    [`${RESULTS_DIR}/k6-summary.json`]: JSON.stringify(summary, null, 2),
    [`${RESULTS_DIR}/k6-summary.md`]: summaryMarkdown(summary),
    stdout: `${summaryMarkdown(summary)}\n`,
  };
}
