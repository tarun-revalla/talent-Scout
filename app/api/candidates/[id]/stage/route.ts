import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { STAGES, type Stage } from "@/lib/ui-tokens";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { stage?: string };
  const stage = body.stage as Stage | undefined;
  if (!stage || !STAGES.includes(stage)) {
    return NextResponse.json(
      { error: `stage must be one of ${STAGES.join(", ")}` },
      { status: 400 },
    );
  }
  const { error } = await supabaseServer()
    .from("candidates")
    .update({ pipeline_stage: stage })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stage });
}
