import { supabaseServer } from "@/lib/db";
import { ReplyAnalysisSchema } from "@/lib/schemas";
import { log } from "@/lib/logger";
import type { QueueJob } from "@/lib/queue";

const W_AVAILABILITY = 20;
const W_NOTICE = 20;
const W_SALARY = 30;
const W_INTERVIEW = 30;

function commitmentsScore(
  c: NonNullable<unknown> | null,
  jdSalary: { min: number | null; max: number | null } | null,
): number {
  if (!c || typeof c !== "object") return 0;
  const obj = c as {
    availability?: string | null;
    notice_period_weeks?: number | null;
    salary_expectation?: string | null;
    willing_to_interview?: "yes" | "no" | "maybe" | null;
  };
  let s = 0;
  if (obj.availability) s += W_AVAILABILITY;
  if (obj.notice_period_weeks != null) s += W_NOTICE;
  if (obj.salary_expectation) {
    const m = obj.salary_expectation.match(/(\d{2,3})[kK]|(\d{4,7})/);
    const stated = m ? Number(m[1] ?? m[2]) * (m[1] ? 1000 : 1) : null;
    if (stated != null && jdSalary?.min != null && jdSalary?.max != null) {
      if (stated <= jdSalary.max && stated >= jdSalary.min * 0.9) s += W_SALARY;
      else if (stated <= jdSalary.max * 1.15) s += W_SALARY * 0.6;
      else s += W_SALARY * 0.2;
    } else {
      s += W_SALARY * 0.6;
    }
  }
  if (obj.willing_to_interview === "yes") s += W_INTERVIEW;
  else if (obj.willing_to_interview === "maybe") s += W_INTERVIEW * 0.5;
  return Math.min(100, s);
}

export async function handleFinalizeScore(jobItem: QueueJob): Promise<void> {
  const sb = supabaseServer();

  const { data: m, error: mErr } = await sb
    .from("matches")
    .select("id, status, job:jobs ( parsed_jd )")
    .eq("id", jobItem.match_id)
    .single();
  if (mErr || !m) throw new Error(mErr?.message ?? "match not found");

  if (m.status === "scored" || m.status === "declined") {
    log.info({ matchId: m.id, status: m.status }, "finalize_score: skipping (already finalized)");
    return;
  }
  const jobRow = Array.isArray(m.job) ? m.job[0] : m.job;
  const jdSalary =
    (jobRow?.parsed_jd as { salary_range?: { min: number | null; max: number | null } } | null)
      ?.salary_range ?? null;

  const { data: lastIn } = await sb
    .from("conversations")
    .select("llm_analysis")
    .eq("match_id", m.id)
    .eq("direction", "in")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const analysis = lastIn?.llm_analysis
    ? ReplyAnalysisSchema.safeParse(lastIn.llm_analysis)
    : null;
  if (!analysis || !analysis.success) {
    log.warn({ matchId: m.id }, "finalize_score: no analyzable inbound — marking declined");
    await sb
      .from("matches")
      .update({ status: "declined", interest_score: 0, last_action_at: new Date().toISOString() })
      .eq("id", m.id);
    return;
  }
  const a = analysis.data;
  const enthusiasm = a.enthusiasm_score;
  const commitments = commitmentsScore(a.commitments, jdSalary);
  const interest = Math.round(0.5 * enthusiasm + 0.5 * commitments);

  log.info(
    { matchId: m.id, sentiment: a.sentiment, enthusiasm, commitments, interest },
    "finalize_score: scored",
  );

  await sb
    .from("matches")
    .update({
      interest_score: interest,
      interest_breakdown: {
        sentiment: a.sentiment,
        enthusiasm,
        commitments_score: commitments,
        commitments: a.commitments,
      },
      status: a.decision === "decline" ? "declined" : "scored",
      last_action_at: new Date().toISOString(),
    })
    .eq("id", m.id);
}
