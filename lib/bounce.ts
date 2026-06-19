/**
 * Heuristics for detecting and parsing email delivery bounces.
 * Gmail / Postfix / SES all share roughly the same conventions.
 */

const BOUNCE_FROM_PATTERNS = [
  "mailer-daemon@",
  "postmaster@",
  "noreply-bounce@",
  "bounces@",
];

const BOUNCE_SUBJECT_PATTERNS = [
  "delivery status notification",
  "undeliverable",
  "returned mail",
  "address not found",
  "delivery failure",
  "mail delivery failed",
  "could not be delivered",
];

export function isBounce(from: string, subject: string): boolean {
  const f = (from ?? "").toLowerCase();
  const s = (subject ?? "").toLowerCase();
  if (BOUNCE_FROM_PATTERNS.some((p) => f.includes(p))) return true;
  if (BOUNCE_SUBJECT_PATTERNS.some((p) => s.includes(p))) return true;
  return false;
}

/**
 * Pull the failed recipient address out of the bounce body. Tries:
 * 1. RFC 3464 "Final-Recipient: rfc822; user@host"
 * 2. Angle-bracketed "<user@host>"
 * 3. Any "user@host" token (last resort).
 */
export function extractBouncedAddress(body: string): string | null {
  if (!body) return null;
  const final = body.match(/Final-Recipient:\s*rfc822;\s*([^\s<>\r\n]+@[^\s<>\r\n]+)/i);
  if (final?.[1]) return final[1].toLowerCase();
  const angled = body.match(/<([^@\s<>]+@[^@\s<>]+)>/);
  if (angled?.[1]) return angled[1].toLowerCase();
  const bare = body.match(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  if (bare?.[0]) return bare[0].toLowerCase();
  return null;
}
