import { createHmac, timingSafeEqual } from "node:crypto";

const STUDENT_RUNTIME_TOKEN_VERSION = 1;
const DEFAULT_RUNTIME_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

type StudentRuntimeTokenPayload = {
  v: number;
  sid: string;
  uid: string;
  iat: number;
  exp: number;
};

function getStudentRuntimeTokenSecret() {
  const secret =
    process.env.STUDENT_RUNTIME_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Student runtime token secret is not configured.");
  }

  return secret;
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signEncodedPayload(encodedPayload: string) {
  return createHmac("sha256", getStudentRuntimeTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createStudentRuntimeToken(input: {
  sessionId: string;
  userId: string;
  expiresAtMs?: number | null;
}) {
  const now = Date.now();
  const payload: StudentRuntimeTokenPayload = {
    v: STUDENT_RUNTIME_TOKEN_VERSION,
    sid: input.sessionId,
    uid: input.userId,
    iat: now,
    exp:
      typeof input.expiresAtMs === "number" && Number.isFinite(input.expiresAtMs)
        ? input.expiresAtMs
        : now + DEFAULT_RUNTIME_TOKEN_TTL_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signEncodedPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyStudentRuntimeToken(
  token: string | null | undefined,
  sessionId: string,
) {
  if (!token) return null;

  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0) return null;

  const encodedPayload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  if (!encodedPayload || !signature) return null;

  let expectedSignature: string;
  try {
    expectedSignature = signEncodedPayload(encodedPayload);
  } catch {
    return null;
  }

  const providedBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload: StudentRuntimeTokenPayload;
  try {
    payload = JSON.parse(
      decodeBase64Url(encodedPayload),
    ) as StudentRuntimeTokenPayload;
  } catch {
    return null;
  }

  if (
    payload.v !== STUDENT_RUNTIME_TOKEN_VERSION ||
    typeof payload.sid !== "string" ||
    typeof payload.uid !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.sid !== sessionId || payload.exp <= Date.now()) {
    return null;
  }

  return {
    sessionId: payload.sid,
    userId: payload.uid,
  };
}
