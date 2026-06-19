import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { buildInviteUrl, generateInviteToken } from "@/lib/invite-token";
import { getInviteAnalytics } from "@/lib/invite";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseServer();
  const { data: job, error } = await sb
    .from("jobs")
    .select("id, invite_token, invite_enabled, status")
    .eq("id", id)
    .single();
  if (error || !job) {
    return NextResponse.json({ error: error?.message ?? "Job not found" }, { status: 404 });
  }

  const origin = req.nextUrl.origin;
  const analytics = await getInviteAnalytics(id);

  return NextResponse.json({
    inviteToken: job.invite_token,
    inviteEnabled: job.invite_enabled !== false,
    inviteUrl: buildInviteUrl(job.invite_token as string, origin),
    status: job.status,
    analytics,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { inviteEnabled?: boolean };
    if (typeof body.inviteEnabled !== "boolean") {
      return NextResponse.json({ error: "inviteEnabled boolean required" }, { status: 400 });
    }
    const { error } = await supabaseServer()
      .from("jobs")
      .update({ invite_enabled: body.inviteEnabled })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ inviteEnabled: body.inviteEnabled });
  } catch (err) {
    log.error({ err }, "invite PATCH failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "regenerate") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    const token = generateInviteToken();
    const { error } = await supabaseServer()
      .from("jobs")
      .update({ invite_token: token, invite_enabled: true })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      inviteToken: token,
      inviteUrl: buildInviteUrl(token, req.nextUrl.origin),
    });
  } catch (err) {
    log.error({ err }, "invite regenerate failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
