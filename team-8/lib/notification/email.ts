const RESEND_API_URL = "https://api.resend.com/emails";

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
    process.env.RESEND_API_KEY && process.env.NOTIFICATION_FROM_EMAIL
  );
}

export async function sendEmailMessage(
  message: EmailMessage
): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      success: false,
      skipped: true,
      error: "Email provider is not configured.",
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

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: cleanedRecipients,
        reply_to: message.replyTo ?? process.env.NOTIFICATION_REPLY_TO_EMAIL ?? undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; error?: { message?: string } }
      | null;

    if (!response.ok) {
      return {
        success: false,
        error:
          payload?.message ??
          payload?.error?.message ??
          `Email send failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      providerId: payload?.id ?? null,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown email send error",
    };
  }
}
