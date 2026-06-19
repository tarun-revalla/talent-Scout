import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { match?: number; interest?: number };
  const m = Number(body.match ?? 0.5);
  const i = Number(body.interest ?? 0.5);
  if (Number.isNaN(m) || Number.isNaN(i)) {
    return NextResponse.json({ error: "weights must be numeric" }, { status: 400 });
  }
  const sum = m + i || 1;
  const weights = { match: m / sum, interest: i / sum };
  const { error } = await supabaseServer()
    .from("jobs")
    .update({ weights })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ weights });
}
