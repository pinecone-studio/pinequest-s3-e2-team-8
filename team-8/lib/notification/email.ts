const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type GmailAccessToken = {
  token: string;
  expiresAt: number;
};

let cachedGmailAccessToken: GmailAccessToken | null = null;
const GMAIL_FETCH_RETRY_DELAY_MS = 600;

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
};

export type EmailSendResult =
  | { success: true; providerId: string | null }
  | { success: false; error: string }
  | { success: false; skipped: true; error: string };

export function isEmailDeliveryConfigured() {
  return Boolean(
    process.env.GMAIL_CLIENT_ID?.trim() &&
      process.env.GMAIL_CLIENT_SECRET?.trim() &&
      process.env.GMAIL_REFRESH_TOKEN?.trim() &&
      process.env.GMAIL_SENDER_EMAIL?.trim()
  );
}

function containsNonAscii(value: string) {
  return /[^\x20-\x7E]/.test(value);
}

function encodeHeaderWord(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/\r?\n/g, " ").trim();
}

function parseMailbox(value: string) {
  const sanitized = sanitizeHeaderValue(value);
  const match = sanitized.match(/^(.*)<([^<>]+)>$/);

  if (!match) {
    return {
      address: sanitized,
      displayName: "",
    };
  }

  return {
    displayName: match[1].trim().replace(/^"(.*)"$/, "$1"),
    address: match[2].trim(),
  };
}

function formatMailboxHeader(value: string) {
  const { address, displayName } = parseMailbox(value);
  if (!displayName) return address;

  const safeName = sanitizeHeaderValue(displayName);
  const renderedName = containsNonAscii(safeName)
    ? encodeHeaderWord(safeName)
    : `"${safeName.replace(/"/g, '\\"')}"`;

  return `${renderedName} <${address}>`;
}

function formatSubjectHeader(value: string) {
  const safeSubject = sanitizeHeaderValue(value);
  return containsNonAscii(safeSubject) ? encodeHeaderWord(safeSubject) : safeSubject;
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildMimeMessage(from: string, message: EmailMessage, recipients: string[]) {
  const boundary = `smart-exam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const lines = [
    `From: ${formatMailboxHeader(from)}`,
    `To: ${recipients.map((recipient) => sanitizeHeaderValue(recipient)).join(", ")}`,
    `Subject: ${formatSubjectHeader(message.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (message.replyTo?.trim()) {
    lines.push(`Reply-To: ${sanitizeHeaderValue(message.replyTo)}`);
  }

  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 8bit");
  lines.push("");
  lines.push(message.text);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 8bit");
  lines.push("");
  lines.push(message.html);
  lines.push("");
  lines.push(`--${boundary}--`);
  lines.push("");

  return lines.join("\r\n");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  attempts = 2
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      const payload = await response.json().catch(() => null);
      return { response, payload };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(GMAIL_FETCH_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Email fetch failed");
}

async function getGmailAccessToken(forceRefresh = false) {
  if (
    !forceRefresh &&
    cachedGmailAccessToken &&
    cachedGmailAccessToken.expiresAt > Date.now() + 30_000
  ) {
    return { success: true as const, token: cachedGmailAccessToken.token };
  }

  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return {
      success: false as const,
      skipped: true as const,
      error: "Gmail API is not fully configured.",
    };
  }

  try {
    const { response, payload } = await fetchJsonWithRetry(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const typedPayload = payload as
      | {
          access_token?: string;
          expires_in?: number;
          error?: string;
          error_description?: string;
        }
      | null;

    if (!response.ok || !typedPayload?.access_token) {
      return {
        success: false as const,
        error:
          typedPayload?.error_description ||
          typedPayload?.error ||
          `Gmail token refresh failed with status ${response.status}`,
      };
    }

    const expiresInMs = Math.max(Number(typedPayload.expires_in ?? 3600) - 60, 60) * 1000;
    cachedGmailAccessToken = {
      token: typedPayload.access_token,
      expiresAt: Date.now() + expiresInMs,
    };

    return { success: true as const, token: typedPayload.access_token };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Unknown Gmail token refresh error",
    };
  }
}

export async function sendEmailMessage(
  message: EmailMessage
): Promise<EmailSendResult> {
  const senderEmail = process.env.GMAIL_SENDER_EMAIL?.trim();

  if (!senderEmail) {
    return {
      success: false,
      skipped: true,
      error: "Gmail sender is not configured.",
    };
  }

  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  const cleanedRecipients = recipients
    .map((recipient) => recipient.trim())
    .filter(Boolean);

  if (cleanedRecipients.length === 0) {
    return {
      success: false,
      skipped: true,
      error: "No email recipient provided.",
    };
  }

  const sendAttempt = async (forceRefresh = false) => {
    const accessToken = await getGmailAccessToken(forceRefresh);
    if (!accessToken.success) {
      return {
        ok: false,
        status: 0,
        providerId: null,
        error: accessToken.error,
        skipped: "skipped" in accessToken && accessToken.skipped ? true : undefined,
      };
    }

    const raw = buildMimeMessage(senderEmail, message, cleanedRecipients);
    const { response, payload } = await fetchJsonWithRetry(GMAIL_API_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: toBase64Url(raw),
      }),
    });
    const typedPayload = payload as
      | { id?: string; error?: { message?: string }; message?: string }
      | null;

    return {
      ok: response.ok,
      status: response.status,
      providerId: typedPayload?.id ?? null,
      error:
        typedPayload?.error?.message ??
        typedPayload?.message ??
        `Gmail send failed with status ${response.status}`,
    };
  };

  try {
    let result = await sendAttempt(false);

    if (!result.ok && result.status === 401) {
      cachedGmailAccessToken = null;
      result = await sendAttempt(true);
    }

    if (!result.ok) {
      if ("skipped" in result && result.skipped) {
        return {
          success: false,
          skipped: true,
          error: result.error,
        };
      }

      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      providerId: result.providerId,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown Gmail send error",
    };
  }
}
