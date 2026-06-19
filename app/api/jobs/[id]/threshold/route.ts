import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { autoEngageForJob } from "@/lib/matching";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { threshold?: number; enabled?: boolean };

  const update: { auto_engage_threshold?: number; auto_engage_enabled?: boolean } = {};
  if (body.threshold != null) {
    const t = Number(body.threshold);
    if (!Number.isFinite(t)) {
      return NextResponse.json({ error: "threshold must be a number" }, { status: 400 });
    }
    update.auto_engage_threshold = Math.max(0, Math.min(100, t));
  }
  if (body.enabled != null) {
    update.auto_engage_enabled = Boolean(body.enabled);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { error } = await supabaseServer().from("jobs").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let engage = { autoEnqueued: 0, autoShortlisted: 0, threshold: 55, autoEnabled: false, jobStatus: "open" };
  try {
    engage = await autoEngageForJob(id);
  } catch {
    // Settings saved; engagement can be retried via Find matches.
  }

  return NextResponse.json({ ...update, ...engage });
}
