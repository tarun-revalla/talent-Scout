import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Lightweight global search across jobs (title) and candidates (name + email).
 * Used by the nav search dropdown — case-insensitive substring match, capped.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ jobs: [], candidates: [] });
  }
  const sb = supabaseServer();
  const ilike = `%${q.replace(/[%_]/g, "")}%`;

  const [jobsRes, candsRes] = await Promise.all([
    sb
      .from("jobs")
      .select("id, title, status")
      .ilike("title", ilike)
      .limit(5),
    sb
      .from("candidates")
      .select("id, name, email")
      .or(`name.ilike.${ilike},email.ilike.${ilike}`)
      .limit(5),
  ]);

  return NextResponse.json({
    jobs: jobsRes.data ?? [],
    candidates: candsRes.data ?? [],
  });
}
