import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  isAnalyticsUnlocked,
  isAnalyticsUnlockConfigured,
  unlockToken,
  verifyAnalyticsPassword,
} from "@/lib/analytics-unlock";

export const runtime = "nodejs";

export async function GET() {
  const configured = isAnalyticsUnlockConfigured();
  const unlocked = configured ? await isAnalyticsUnlocked() : false;
  return NextResponse.json({ configured, unlocked });
}

export async function POST(req: NextRequest) {
  if (!isAnalyticsUnlockConfigured()) {
    return NextResponse.json(
      { error: "Analytics unlock is not configured on this server." },
      { status: 503 },
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!verifyAnalyticsPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, unlockToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
