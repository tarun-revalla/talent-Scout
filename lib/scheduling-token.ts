import { randomBytes } from "node:crypto";

export function generateSchedulingToken(): string {
  return randomBytes(16).toString("base64url");
}

export function buildScheduleRespondUrl(token: string, origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/schedule/respond/${token}`;
}
