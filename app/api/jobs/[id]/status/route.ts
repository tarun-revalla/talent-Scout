import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { autoEngageForJob } from "@/lib/matching";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { status?: string };
  if (body.status !== "open" && body.status !== "closed" && body.status !== "draft") {
    return NextResponse.json(
      { error: "status must be 'open', 'closed', or 'draft'" },
      { status: 400 },
    );
  }
  const { error } = await supabaseServer()
    .from("jobs")
    .update({ status: body.status })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let autoEnqueued = 0;
  if (body.status === "open") {
    try {
      const engage = await autoEngageForJob(id);
      autoEnqueued = engage.autoEnqueued;
    } catch {
      // Status saved; user can re-toggle auto-engage or run match.
    }
  }

  return NextResponse.json({ status: body.status, autoEnqueued });
}
