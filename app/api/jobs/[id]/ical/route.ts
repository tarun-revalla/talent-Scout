import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { DateTime } from "luxon";

export const runtime = "nodejs";

function fmtIcalDate(iso: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function escapeIcal(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** GET /api/jobs/[id]/ical
 *  Returns an iCal (.ics) feed of all confirmed interviews for a job.
 *  Recruiters can subscribe to this URL in their calendar app.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;
  const sb = supabaseServer();

  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) {
    return new NextResponse("Job not found", { status: 404 });
  }

  const { data: confirmedInterviews, error: ivErr } = await sb
    .from("scheduled_interviews")
    .select(
      `
      id, round_index, starts_at, ends_at, ics_uid, confirmed_at,
      match:matches!inner ( id, job_id,
        candidate:candidates ( name, email ),
        job:jobs ( id, title, interview_rounds )
      ),
      session:scheduling_sessions ( id, interviewer_ids, duration_minutes, timezone )
    `,
    )
    .eq("match.job_id", jobId)
    .not("confirmed_at", "is", null);
  if (ivErr) {
    return new NextResponse(ivErr.message, { status: 500 });
  }

  const events: string[] = [];
  const now = fmtIcalDate(new Date().toISOString());

  for (const iv of confirmedInterviews ?? []) {
    const matchData = Array.isArray(iv.match) ? iv.match[0] : iv.match;
    const sessionData = Array.isArray(iv.session) ? iv.session[0] : iv.session;
    if (!matchData || !sessionData) continue;

    const candidate = Array.isArray(matchData.candidate)
      ? matchData.candidate[0]
      : matchData.candidate;
    const jobRow = Array.isArray(matchData.job) ? matchData.job[0] : matchData.job;

    const rounds = (jobRow?.interview_rounds as { name: string; order: number }[] | null) ?? [];
    const sorted = [...rounds].sort((a, b) => a.order - b.order);
    const roundName = sorted[iv.round_index as number]?.name ?? `Round ${(iv.round_index as number) + 1}`;

    const uid = (iv.ics_uid as string) ?? `talentscout-${iv.id}@talentscout`;
    const summary = escapeIcal(
      `${roundName}: ${candidate?.name ?? "Candidate"} — ${job.title as string}`,
    );
    const description = escapeIcal(
      `Interview for ${job.title as string}\\nCandidate: ${candidate?.name ?? "Unknown"} <${candidate?.email ?? ""}>\\nRound: ${roundName}`,
    );

    events.push(
      [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${fmtIcalDate(iv.starts_at as string)}`,
        `DTEND:${fmtIcalDate(iv.ends_at as string)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
      ].join("\r\n"),
    );
  }

  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Talent Scout//Interview Schedule//EN",
    `X-WR-CALNAME:${escapeIcal(job.title as string)} Interviews`,
    "X-WR-CALDESC:Confirmed interviews for this role",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${jobId}-interviews.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
