import { NextRequest, NextResponse } from "next/server";
import { fetchCandidateIdsReservedOnOtherJobs } from "@/lib/candidate-availability";
import { supabaseServer } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const jobId = req.nextUrl.searchParams.get("job");

  // Filter to candidates considered for a specific job (via the matches join).
  if (jobId) {
    const { data, error } = await sb
      .from("matches")
      .select(
        `candidate:candidates ( id, name, email, email_invalid, source, parsed_profile, pipeline_stage, created_at )`,
      )
      .eq("job_id", jobId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const reservedElsewhere = await fetchCandidateIdsReservedOnOtherJobs(sb, jobId);
    const flat = (data ?? [])
      .map((row) => (Array.isArray(row.candidate) ? row.candidate[0] : row.candidate))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .filter((c) => !reservedElsewhere.has(c.id as string));
    // Deduplicate (a candidate could appear once per match, but still — guard).
    const seen = new Set<string>();
    const uniq = flat.filter((c) => {
      const id = c.id as string;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    uniq.sort(
      (a, b) =>
        new Date((b.created_at as string) ?? 0).getTime() -
        new Date((a.created_at as string) ?? 0).getTime(),
    );
    return NextResponse.json({ candidates: uniq });
  }

  const { data, error } = await sb
    .from("candidates")
    .select(
      "id, name, email, email_invalid, source, parsed_profile, pipeline_stage, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ candidates: data });
}
