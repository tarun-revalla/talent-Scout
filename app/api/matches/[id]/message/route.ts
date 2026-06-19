import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveEmailSettings } from "@/lib/email-templates";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Ad-hoc outbound message from the recruiter — bypasses the agent flow.
 * Threads onto the most recent message_id on this match if there is one.
 * Logs the send as an outbound conversation row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matchId } = await params;
    const body = (await req.json()) as { subject?: string; body?: string };
    const subject = (body.subject ?? "").trim();
    const text = (body.body ?? "").trim();
    if (subject.length < 2 || text.length < 5) {
      return NextResponse.json(
        { error: "subject and body required" },
        { status: 400 },
      );
    }

    const sb = supabaseServer();
    const { data: m, error: mErr } = await sb
      .from("matches")
      .select(
        `
        id, thread_id, job_id,
        candidate:candidates ( id, email, email_invalid ),
        job:jobs ( title, email_settings )
      `,
      )
      .eq("id", matchId)
      .single();
    if (mErr || !m) throw new Error(mErr?.message ?? "match not found");
    const cand = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
    if (!cand?.email) throw new Error("candidate has no email");
    if (cand.email_invalid) throw new Error("candidate email is marked invalid");

    // Thread onto last message_id if available.
    const { data: lastConv } = await sb
      .from("conversations")
      .select("message_id, sent_at, received_at")
      .eq("match_id", matchId)
      .order("sent_at", { ascending: false })
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const inReplyTo = (lastConv?.message_id as string | null) ?? null;
    const finalSubject =
      inReplyTo && !subject.startsWith("Re:") ? `Re: ${subject}` : subject;

    const jobRow = Array.isArray(m.job) ? m.job[0] : m.job;
    const emailSettings = resolveEmailSettings(jobRow?.email_settings);
    const sent = await sendEmail({
      to: cand.email,
      subject: finalSubject,
      body: text,
      inReplyTo,
      references: inReplyTo ? [inReplyTo] : [],
      htmlOptions: {
        recruiterName: emailSettings.recruiter_name,
        jobTitle: (jobRow?.title as string | undefined) ?? undefined,
      },
    });

    await sb.from("conversations").insert({
      match_id: matchId,
      direction: "out",
      subject: finalSubject,
      body: text,
      message_id: sent.messageId,
      in_reply_to: inReplyTo,
      sent_at: sent.acceptedAt,
    });

    await sb
      .from("matches")
      .update({ last_action_at: sent.acceptedAt })
      .eq("id", matchId);

    log.info({ matchId, to: cand.email, messageId: sent.messageId }, "ad-hoc message sent");
    return NextResponse.json({ sent: true, message_id: sent.messageId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
