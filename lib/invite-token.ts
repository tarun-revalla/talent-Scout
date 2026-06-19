import { randomBytes } from "node:crypto";

/** Opaque URL-safe token for public job apply links. */
export function generateInviteToken(): string {
  return randomBytes(12).toString("base64url");
}

export function buildInviteUrl(token: string, origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/apply/${token}`;
}
