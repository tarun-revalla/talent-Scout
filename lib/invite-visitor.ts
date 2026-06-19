"use client";

const COOKIE_NAME = "ts_visitor";
const MAX_AGE_DAYS = 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

/** Anonymous visitor id for invite-link funnel analytics (cookie-based). */
export function getOrCreateVisitorId(): string {
  const existing = readCookie(COOKIE_NAME);
  if (existing && existing.length >= 8 && existing.length <= 128) return existing;
  const id = crypto.randomUUID();
  writeCookie(COOKIE_NAME, id);
  return id;
}
