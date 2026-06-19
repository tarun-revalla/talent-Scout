import { NextRequest, NextResponse } from "next/server";
import { fetchCandidateIdsReservedOnOtherJobs } from "@/lib/candidate-availability";
import { supabaseServer } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("matches")
    .select(
      `
      id,
      match_score,
      match_explanation,
      status,
      rounds_sent,
      interest_score,
      interest_breakdown,
      combined_score,
      last_action_at,
      pipeline_stage,
      interview_state,
      current_round_index,
      rejected_at,
      rejected_at_round,
      rejection_reason,
      re_eligible_after,
      candidate:candidates ( id, name, email, email_invalid, source, parsed_profile )
    `,
    )
    .eq("job_id", id)
    .order("combined_score", { ascending: false })
    .order("match_score", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reservedElsewhere = await fetchCandidateIdsReservedOnOtherJobs(sb, id);
  const visible = (data ?? []).filter((m) => {
    const cand = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
    const candidateId = cand?.id as string | undefined;
    return !candidateId || !reservedElsewhere.has(candidateId);
  });

  return NextResponse.json({ matches: visible });
}
