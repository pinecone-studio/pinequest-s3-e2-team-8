import http from "k6/http";
import { check, fail } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const EXAM_ID = __ENV.EXAM_ID;
const PASSWORD = __ENV.PASSWORD || "PineExam123!";
const STUDENT_START = Number(__ENV.STUDENT_START || 1);
const STUDENT_COUNT = Number(__ENV.STUDENT_COUNT || 10);
const VUS = Number(__ENV.VUS || STUDENT_COUNT);
const STRESS_SECRET =
  __ENV.STRESS_SECRET ||
  __ENV.CRON_SECRET ||
  "smart-exam-local-cron-secret-2026";
const RESET_BEFORE_RUN = (__ENV.RESET_BEFORE_RUN || "1") === "1";
const WARM_PAYLOAD_CACHE = (__ENV.WARM_PAYLOAD_CACHE || "1") === "1";

export const options = {
  scenarios: {
    start_rush: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: "1m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
  },
};

function jsonHeaders(extra = {}) {
  return {
    "content-type": "application/json",
    "x-cron-secret": STRESS_SECRET,
    ...extra,
  };
}

function studentEmail(index) {
  return `student${String(index).padStart(2, "0")}@pineexam.test`;
}

export function setup() {
  if (!EXAM_ID) {
    fail("EXAM_ID env is required.");
  }

  const users = [];

  for (let index = STUDENT_START; index < STUDENT_START + STUDENT_COUNT; index += 1) {
    const response = http.post(
      `${BASE_URL}/api/test/stress/login`,
      JSON.stringify({
        email: studentEmail(index),
        password: PASSWORD,
      }),
      { headers: jsonHeaders() }
    );

    const body = response.json();

    const ok = check(response, {
      "login status is 200": (res) => res.status === 200,
      "login returned token": () => Boolean(body && body.accessToken),
    });

    if (!ok) {
      fail(`Login failed for ${studentEmail(index)}: ${response.status} ${response.body}`);
    }

    users.push({
      email: body.email,
      userId: body.userId,
      accessToken: body.accessToken,
    });
  }

  if (RESET_BEFORE_RUN) {
    const resetResponse = http.post(
      `${BASE_URL}/api/test/stress/reset-exam`,
      JSON.stringify({
        examId: EXAM_ID,
        userIds: users.map((user) => user.userId),
      }),
      { headers: jsonHeaders() }
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

export default function startRush(data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const response = http.post(
    `${BASE_URL}/api/test/stress/exam-start`,
    JSON.stringify({
      examId: EXAM_ID,
      warmPayloadCache: WARM_PAYLOAD_CACHE,
    }),
    {
      headers: jsonHeaders({
        authorization: `Bearer ${user.accessToken}`,
      }),
    }
  );

  const body = response.json();

  check(response, {
    "start status is 200": (res) => res.status === 200,
    "start returned session": () => Boolean(body && body.session && body.session.id),
  });
}

export function teardown() {
  const response = http.get(
    `${BASE_URL}/api/test/stress/exam-integrity?examId=${encodeURIComponent(EXAM_ID)}`,
    {
      headers: jsonHeaders(),
    }
  );

  console.log(`exam-integrity => ${response.status} ${response.body}`);
}
