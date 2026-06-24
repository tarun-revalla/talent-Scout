import nodemailer, { type SendMailOptions } from "nodemailer";
import { env } from "./env";
import { wrapEmailHtml, type EmailHtmlOptions } from "./email-html";

export interface SendArgs {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string[];
  /** Optional context for the HTML wrapper (header/footer). Plain text body is always sent too. */
  htmlOptions?: EmailHtmlOptions;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface SendResult {
  messageId: string;
  envelopeMessageId: string | null;
  acceptedAt: string;
}

async function sendViaGmailApi(message: SendMailOptions): Promise<SendResult> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.gmailClientId(),
      client_secret: env.gmailClientSecret(),
      refresh_token: env.gmailRefreshToken(),
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`gmail api token refresh failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("gmail api token refresh failed: missing access_token");

  const compiler = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const compiled = await compiler.sendMail(message);
  const rawMessage = Buffer.isBuffer(compiled.message)
    ? compiled.message
    : Buffer.from(String(compiled.message));
  const raw = rawMessage.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const sendRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(env.gmailUser())}/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );
  if (!sendRes.ok) {
    throw new Error(`gmail api send failed: ${sendRes.status} ${await sendRes.text()}`);
  }

  return {
    messageId: compiled.messageId ?? "",
    envelopeMessageId: null,
    acceptedAt: new Date().toISOString(),
  };
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const headers: Record<string, string> = {};
  if (args.inReplyTo) headers["In-Reply-To"] = args.inReplyTo;
  if (args.references && args.references.length) {
    headers["References"] = args.references.join(" ");
  }
  const message = {
    from: env.gmailUser(),
    to: args.to,
    subject: args.subject,
    text: args.body,
    html: wrapEmailHtml(args.body, args.htmlOptions),
    headers,
    attachments: args.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType ?? "application/octet-stream",
    })),
  };

  return sendViaGmailApi(message);
}
