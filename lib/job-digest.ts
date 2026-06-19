import { supabaseServer } from "./db";
import { composeJobDigest } from "./llm";
import type { JobDigest } from "./schemas";

export interface DigestSnapshotJob {
  job_id: string;
  title: string;
  status: string;
  new_matches: number;
  invite_applicants: number;
  high_match_uncontacted: number;
  awaiting_reply: number;
  candidate_questions_pending: number;
  interview_in_progress: number;
  queue_pending: number;
}

async function buildSnapshot(): Promise<DigestSnapshotJob[]> {
  const sb = supabaseServer();
  const { data: jobs } = await sb
    .from("jobs")
    .select("id, title, status")
    .neq("status", "closed")
    .order("created_at", { ascending: false });

  if (!jobs?.length) return [];

  const jobIds = jobs.map((j) => j.id as string);
  const { data: matches } = await sb
    .from("matches")
    .select(
      "id, job_id, status, pipeline_stage, match_score, interview_state, candidate:candidates(source)",
    )
    .in("job_id", jobIds);

  const { data: queueRows } = await sb
    .from("outreach_queue")
    .select("match_id, status, matches!inner(job_id)")
    .in("status", ["pending", "running"]);

  const matchIds = (matches ?? []).map((m) => m.id as string);
  const { data: inbound } = matchIds.length
    ? await sb
        .from("conversations")
        .select("match_id, llm_analysis")
        .eq("direction", "in")
        .in("match_id", matchIds)
        .order("received_at", { ascending: false })
    : { data: [] };

  const latestAnalysisByMatch = new Map<string, { candidate_questions?: string[]; decision?: string }>();
  for (const c of inbound ?? []) {
    const mid = c.match_id as string;
    if (latestAnalysisByMatch.has(mid)) continue;
    latestAnalysisByMatch.set(mid, (c.llm_analysis as typeof latestAnalysisByMatch extends Map<string, infer V> ? V : never) ?? {});
  }

  const queueByJob = new Map<string, number>();
  for (const q of queueRows ?? []) {
    const m = Array.isArray(q.matches) ? q.matches[0] : q.matches;
    const jid = (m as { job_id?: string })?.job_id;
    if (!jid) continue;
    queueByJob.set(jid, (queueByJob.get(jid) ?? 0) + 1);
  }

  return jobs.map((job) => {
    const jid = job.id as string;
    const jobMatches = (matches ?? []).filter((m) => m.job_id === jid);
    let inviteApplicants = 0;
    let newMatches = 0;
    let highUncontacted = 0;
    let awaitingReply = 0;
    let questionsPending = 0;
    let inInterview = 0;

    for (const m of jobMatches) {
      const cand = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
      if ((cand as { source?: string } | null)?.source === "invite_link") inviteApplicants++;
      if ((m.pipeline_stage as string) === "new") newMatches++;
      if (
        (m.match_score ?? 0) >= 70 &&
        m.status === "discovered" &&
        (m.pipeline_stage as string) !== "archived"
      ) {
        highUncontacted++;
      }
      if (["replied", "follow_up_sent"].includes(m.status as string)) awaitingReply++;
      if (m.interview_state === "in_progress") inInterview++;

      const analysis = latestAnalysisByMatch.get(m.id as string);
      if (
        analysis?.decision === "follow_up" &&
        (analysis.candidate_questions?.length ?? 0) > 0
      ) {
        questionsPending++;
      }
    }

    return {
      job_id: jid,
      title: job.title as string,
      status: (job.status as string) ?? "open",
      new_matches: newMatches,
      invite_applicants: inviteApplicants,
      high_match_uncontacted: highUncontacted,
      awaiting_reply: awaitingReply,
      candidate_questions_pending: questionsPending,
      interview_in_progress: inInterview,
      queue_pending: queueByJob.get(jid) ?? 0,
    };
  });
}

export async function generateJobDigest(): Promise<JobDigest & { generated_at: string }> {
  const snapshot = await buildSnapshot();
  if (snapshot.length === 0) {
    return {
      headline: "No open jobs",
      summary: "Create a job to start matching and outreach.",
      items: [],
      generated_at: new Date().toISOString(),
    };
  }

  const digest = await composeJobDigest({
    jobsSnapshot: { jobs: snapshot, generated_at: new Date().toISOString() },
    usage: { operation: "compose_digest" },
  });

  return { ...digest, generated_at: new Date().toISOString() };
}

export async function getDigestSnapshot(): Promise<DigestSnapshotJob[]> {
  return buildSnapshot();
}
