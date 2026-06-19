import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("conversations")
    .select(
      "id, direction, subject, body, message_id, sent_at, received_at, llm_analysis",
    )
    .eq("match_id", id)
    .order("sent_at", { ascending: true, nullsFirst: true })
    .order("received_at", { ascending: true, nullsFirst: true })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sorted = (data ?? []).slice().sort((a, b) => {
    const ta = new Date((a.sent_at ?? a.received_at) as string).getTime();
    const tb = new Date((b.sent_at ?? b.received_at) as string).getTime();
    return ta - tb;
  });

  const [{ data: matchRow }, { data: queueRows }] = await Promise.all([
    sb.from("matches").select("status").eq("id", id).maybeSingle(),
    sb
      .from("outreach_queue")
      .select("action, status")
      .eq("match_id", id)
      .in("status", ["pending", "running"])
      .in("action", ["send_followup", "send_initial", "send_round_pass", "send_application_ack", "send_no_show"])
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const pending = queueRows?.[0] ?? null;

  return NextResponse.json(
    {
      conversations: sorted,
      matchStatus: matchRow?.status ?? null,
      outreachPending: pending
        ? { action: pending.action as string, status: pending.status as string }
        : null,
    },
    { headers: { "Cache-Control": "private, no-cache" } },
  );
}
