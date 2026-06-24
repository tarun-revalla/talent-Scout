import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";
import { wrapEmailHtml, type EmailHtmlOptions } from "./email-html";

let _transport: Transporter | null = null;

export function transport(): Transporter {
  if (!_transport) {
    const port = env.gmailSmtpPort();
    _transport = nodemailer.createTransport({
      host: env.gmailSmtpHost(),
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      requireTLS: port !== 465,
      auth: { user: env.gmailUser(), pass: env.gmailAppPassword() },
      // Fail fast on a stalled connection (Railway egress can be slow/blocked)
      // so the queue's exponential-backoff retry kicks in instead of hanging.
      dnsTimeout: 10_000,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return _transport;
}

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

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const headers: Record<string, string> = {};
  if (args.inReplyTo) headers["In-Reply-To"] = args.inReplyTo;
  if (args.references && args.references.length) {
    headers["References"] = args.references.join(" ");
  }
  const info = await transport().sendMail({
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
  });
  return {
    messageId: info.messageId ?? "",
    envelopeMessageId: info.envelope?.from ?? null,
    acceptedAt: new Date().toISOString(),
  };
}
