import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "./env";
import { log } from "./logger";

export interface InboundMessage {
  uid: number;
  from: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  date: Date;
}

function angleWrap(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t.startsWith("<") ? t : `<${t}>`;
}

/**
 * Strip quoted reply blocks. Handles "On ... wrote:" headers and "> "-prefixed
 * lines (the two patterns Gmail and most clients produce).
 */
export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const l of lines) {
    const t = l.trim();
    if (/^On\b.+\bwrote:\s*$/i.test(t)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(t)) break;
    if (t.startsWith(">")) continue;
    out.push(l);
  }
  return out.join("\n").trim();
}

const IMAP_BATCH_SIZE = 10;
const IMAP_OP_TIMEOUT_MS = 15_000;
/** Gmail/IMAP servers can choke on huge OR chains — chunk candidate FROM clauses. */
const IMAP_OR_CHUNK = 40;

/** Known bounce sender addresses to include in IMAP search (in addition to candidate emails). */
const BOUNCE_FROM_ADDRESSES = [
  "mailer-daemon@googlemail.com",
  "mailer-daemon@gmail.com",
  "postmaster@googlemail.com",
  "postmaster@gmail.com",
];

export function extractEmailAddress(from: string): string | null {
  const angled = from.match(/<([^>]+)>/);
  if (angled?.[1]) return angled[1].toLowerCase().trim();
  const bare = from.match(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  return bare?.[0]?.toLowerCase() ?? null;
}

function buildFromSearchClauses(candidateEmails: ReadonlySet<string>): { from: string }[] {
  const clauses: { from: string }[] = [];
  for (const email of candidateEmails) {
    const normalized = email.toLowerCase().trim();
    if (normalized) clauses.push({ from: normalized });
  }
  for (const addr of BOUNCE_FROM_ADDRESSES) {
    clauses.push({ from: addr });
  }
  return clauses;
}

async function searchUnseenUids(
  client: ImapFlow,
  fromClauses: { from: string }[],
): Promise<number[]> {
  if (fromClauses.length === 0) return [];

  const uidSet = new Set<number>();
  for (let i = 0; i < fromClauses.length; i += IMAP_OR_CHUNK) {
    const chunk = fromClauses.slice(i, i + IMAP_OR_CHUNK);
    const criteria =
      chunk.length === 1 ? { seen: false, ...chunk[0]! } : { seen: false, or: chunk };
    const uids = await withTimeout(
      client.search(criteria, { uid: true }),
      IMAP_OP_TIMEOUT_MS,
      "imap.search",
    );
    if (Array.isArray(uids)) {
      for (const uid of uids) {
        uidSet.add(Number(uid));
      }
    }
  }
  return [...uidSet];
}

function shouldTouchMessage(
  msg: InboundMessage,
  candidateEmails: ReadonlySet<string>,
): boolean {
  if (isBounceFromAddress(msg.from)) return true;
  const addr = extractEmailAddress(msg.from);
  return !!addr && candidateEmails.has(addr);
}

function isBounceFromAddress(from: string): boolean {
  const f = from.toLowerCase();
  return (
    f.includes("mailer-daemon") ||
    f.includes("postmaster@") ||
    f.includes("noreply-bounce@") ||
    f.includes("bounces@")
  );
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  // If the timeout wins the race, imapflow still settles the original promise
  // later. Without a handler that late rejection surfaces as an
  // `unhandledRejection` ("Connection not available") and can destabilize the
  // worker. Attach a no-op catch so the loser is always handled.
  p.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export async function fetchUnseenInbound(opts: {
  candidateEmails: ReadonlySet<string>;
}): Promise<InboundMessage[]> {
  const fromClauses = buildFromSearchClauses(opts.candidateEmails);
  if (fromClauses.length === 0) {
    log.debug("imap: no candidate emails — skipping poll");
    return [];
  }

  const client = new ImapFlow({
    host: env.gmailImapHost(),
    port: 993,
    secure: true,
    auth: { user: env.gmailUser(), pass: env.gmailAppPassword() },
    logger: false,
  });

  // ImapFlow is an EventEmitter — an emitted 'error' with no listener throws as
  // an uncaughtException (e.g. socket drop mid-poll). Swallow it; the per-op
  // timeouts below already surface failures to the caller.
  client.on("error", (err) => {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "imap: client error event (ignored)",
    );
  });

  let connected = false;
  const out: InboundMessage[] = [];
  try {
    await withTimeout(client.connect(), IMAP_OP_TIMEOUT_MS, "imap.connect");
    connected = true;
    await withTimeout(client.mailboxOpen("INBOX"), IMAP_OP_TIMEOUT_MS, "imap.mailboxOpen");

    // Only unseen mail FROM known candidates (or bounce senders).
    const uids = await searchUnseenUids(client, fromClauses);
    if (uids.length === 0) {
      return [];
    }
    const slice = uids.slice(0, IMAP_BATCH_SIZE);
    log.info(
      { totalUnseen: uids.length, fetching: slice.length, candidates: opts.candidateEmails.size },
      "imap: search done",
    );

    for (const uid of slice) {
      try {
        const fetched = await withTimeout(
          client.fetchOne(String(uid), { source: true }, { uid: true }),
          IMAP_OP_TIMEOUT_MS,
          `imap.fetchOne(${uid})`,
        );
        if (!fetched || !fetched.source) {
          log.warn({ uid }, "imap: empty source");
          continue;
        }
        const parsed = await simpleParser(fetched.source as Buffer);
        const messageId = angleWrap(parsed.messageId ?? null) ?? `<synth-${uid}@local>`;
        const inReplyTo = angleWrap(parsed.inReplyTo ?? null);
        const refs = Array.isArray(parsed.references)
          ? parsed.references
          : parsed.references
            ? [parsed.references]
            : [];
        const msg: InboundMessage = {
          uid: Number(uid),
          from: parsed.from?.text ?? "",
          subject: parsed.subject ?? "",
          text: parsed.text ?? "",
          messageId,
          inReplyTo,
          references: refs.map((r) => angleWrap(r)).filter((r): r is string => !!r),
          date: parsed.date ?? new Date(),
        };

        // Defense in depth: never mark unrelated personal mail as read.
        if (!shouldTouchMessage(msg, opts.candidateEmails)) {
          log.debug(
            { from: msg.from, subject: msg.subject },
            "imap: skipping non-candidate message (left unread)",
          );
          continue;
        }

        out.push(msg);
        await withTimeout(
          client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }),
          IMAP_OP_TIMEOUT_MS,
          `imap.flagsAdd(${uid})`,
        );
      } catch (err) {
        log.warn(
          { uid, err: err instanceof Error ? err.message : String(err) },
          "imap: per-message error (continuing)",
        );
      }
    }
  } finally {
    // Only LOGOUT over a live connection — calling it after a failed/timed-out
    // connect throws "Connection not available". Always close() afterward to
    // tear down the socket and avoid leaking half-open connections.
    if (connected) {
      try {
        await withTimeout(client.logout(), 5_000, "imap.logout");
      } catch {
        // ignore — close() below still frees the socket
      }
    }
    try {
      client.close();
    } catch {
      // ignore
    }
  }
  return out;
}
