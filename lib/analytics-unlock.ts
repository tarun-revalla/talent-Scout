import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "analytics_unlock";

function unlockToken(password: string): string {
  return createHmac("sha256", password).update("analytics-unlock-v1").digest("hex");
}

export function analyticsUnlockPassword(): string | null {
  const pw = process.env.ANALYTICS_UNLOCK_PASSWORD?.trim();
  return pw && pw.length > 0 ? pw : null;
}

export function isAnalyticsUnlockConfigured(): boolean {
  return analyticsUnlockPassword() != null;
}

export function verifyAnalyticsPassword(candidate: string): boolean {
  const expected = analyticsUnlockPassword();
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(candidate);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function expectedUnlockCookieValue(): string | null {
  const pw = analyticsUnlockPassword();
  return pw ? unlockToken(pw) : null;
}

export async function isAnalyticsUnlocked(): Promise<boolean> {
  const expected = expectedUnlockCookieValue();
  if (!expected) return false;
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (!value || value.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

export { COOKIE_NAME, unlockToken };
