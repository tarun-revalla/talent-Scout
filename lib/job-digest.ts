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
  pending_scorecards: number;
  queue_pending: number;
}

export async function buildDigestSnapshot(): Promise<DigestSnapshotJob[]> {
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

  const { data: scorecards } = matchIds.length
    ? await sb
        .from("interviewer_scorecards")
        .select("match_id, status")
        .eq("status", "pending")
        .in("match_id", matchIds)
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

  const matchJobById = new Map<string, string>();
  for (const m of matches ?? []) {
    matchJobById.set(m.id as string, m.job_id as string);
  }

  const pendingScorecardsByJob = new Map<string, number>();
  for (const scorecard of scorecards ?? []) {
    const jid = matchJobById.get(scorecard.match_id as string);
    if (!jid) continue;
    pendingScorecardsByJob.set(jid, (pendingScorecardsByJob.get(jid) ?? 0) + 1);
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
      pending_scorecards: pendingScorecardsByJob.get(jid) ?? 0,
      queue_pending: queueByJob.get(jid) ?? 0,
    };
  });
}

export function buildDeterministicJobDigest(snapshot: DigestSnapshotJob[]): JobDigest {
  if (snapshot.length === 0) {
    return {
      headline: "No open jobs",
      summary: "Create a job to start matching and outreach.",
      items: [],
    };
  }

  const items: JobDigest["items"] = [];
  for (const job of snapshot) {
    const addItem = (priority: "high" | "medium" | "low", action: string) => {
      if (items.length < 8) {
        items.push({
          job_id: job.job_id,
          job_title: job.title,
          priority,
          action,
        });
      }
    };

    if (job.candidate_questions_pending > 0) {
      addItem(
        "high",
        `Answer ${job.candidate_questions_pending} candidate question${job.candidate_questions_pending === 1 ? "" : "s"}.`,
      );
    }
    if (job.pending_scorecards > 0) {
      addItem(
        "high",
        `Collect ${job.pending_scorecards} pending scorecard${job.pending_scorecards === 1 ? "" : "s"} from interviewers.`,
      );
    }
    if (job.high_match_uncontacted > 0) {
      addItem(
        "medium",
        `Engage ${job.high_match_uncontacted} high-match candidate${job.high_match_uncontacted === 1 ? "" : "s"} who have not been contacted.`,
      );
    }
    if (job.awaiting_reply > 0) {
      addItem(
        "medium",
        `Review ${job.awaiting_reply} candidate thread${job.awaiting_reply === 1 ? "" : "s"} awaiting recruiter action.`,
      );
    }
    if (job.queue_pending > 0) {
      addItem(
        "low",
        `Monitor ${job.queue_pending} queued automation task${job.queue_pending === 1 ? "" : "s"}.`,
      );
    }
  }

  const urgent = items.filter((item) => item.priority === "high").length;
  const totalJobs = snapshot.length;
  return {
    headline:
      urgent > 0
        ? `${urgent} urgent recruiting action${urgent === 1 ? "" : "s"}`
        : "Recruiting pipeline is moving",
    summary:
      items.length > 0
        ? `${totalJobs} open job${totalJobs === 1 ? "" : "s"} reviewed. Focus first on candidate questions, missing feedback, and high-match candidates waiting for outreach.`
        : `${totalJobs} open job${totalJobs === 1 ? "" : "s"} reviewed with no urgent recruiter action detected.`,
    items,
  };
}

export async function generateJobDigest(
  snapshot?: DigestSnapshotJob[],
): Promise<JobDigest & { generated_at: string }> {
  snapshot ??= await buildDigestSnapshot();
  if (snapshot.length === 0) {
    return { ...buildDeterministicJobDigest(snapshot), generated_at: new Date().toISOString() };
  }

  const digest = await composeJobDigest({
    jobsSnapshot: { jobs: snapshot, generated_at: new Date().toISOString() },
    usage: { operation: "compose_digest" },
  });

  return { ...digest, generated_at: new Date().toISOString() };
}

export async function getDigestSnapshot(): Promise<DigestSnapshotJob[]> {
  return buildDigestSnapshot();
}
