import { DateTime } from "luxon";
import { buildScheduleRespondUrl } from "./scheduling-token";

export function formatSlotLocal(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: "utc" })
    .setZone(timezone)
    .toFormat("EEE, MMM d · h:mm a");
}

/** Shorter label for Slack buttons (75 char limit). */
export function formatSlotButtonLabel(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: "utc" })
    .setZone(timezone)
    .toFormat("MMM d · h:mm a");
}

export interface ProposalEmailArgs {
  interviewerName: string;
  candidateName: string | null;
  jobTitle: string;
  roundName: string;
  slotStart: string;
  slotEnd: string;
  /** All proposed options; if more than one, the recipient picks on the page. */
  proposedSlots?: { start: string; end: string }[];
  timezone: string;
  durationMinutes: number;
  responseToken: string;
  origin?: string;
  recruiterName?: string;
}

export function buildSchedulingProposalEmail(args: ProposalEmailArgs): {
  subject: string;
  body: string;
} {
  const respondUrl = buildScheduleRespondUrl(args.responseToken, args.origin);
  const candidate = args.candidateName ?? "the candidate";
  const recruiter = args.recruiterName ?? "Talent Team";

  const slots =
    args.proposedSlots && args.proposedSlots.length > 0
      ? args.proposedSlots
      : [{ start: args.slotStart, end: args.slotEnd }];
  const multi = slots.length > 1;
  const when = formatSlotLocal(slots[0]!.start, args.timezone);

  const subject = multi
    ? `Interview request: ${candidate} · ${slots.length} times to choose from`
    : `Interview request: ${candidate} · ${when}`;

  const timesBlock = multi
    ? `Proposed times (${args.timezone}) — pick whichever works:\n` +
      slots.map((s, i) => `  ${i + 1}. ${formatSlotLocal(s.start, args.timezone)}`).join("\n")
    : `Proposed time (${args.timezone}):\n${when}`;

  const actionLine = multi
    ? `Open the link below to pick your preferred time:\n${respondUrl}\n\n` +
      `Pick a time — we'll invite the candidate and send calendar details.\n` +
      `None work — we'll automatically propose new overlapping slots.\n\n` +
      `If you use Slack, you can tap a time button directly in the approval message.`
    : `Please confirm this works with your calendar:\n${respondUrl}\n\n` +
      `Yes — we'll invite the candidate and send calendar details.\n` +
      `No — we'll automatically propose the next best overlapping slot.\n\n` +
      `If you use Slack, tap Yes or No on the approval message.`;

  const body =
    `Hi ${args.interviewerName},\n\n` +
    `${recruiter} would like to schedule a ${args.durationMinutes}-minute interview with ${candidate} for the ${args.jobTitle} role (${args.roundName}).\n\n` +
    `${timesBlock}\n\n` +
    `${actionLine}\n\n` +
    `Thanks,\n${recruiter}`;

  return { subject, body };
}

export interface ConfirmedEmailArgs {
  recruiterName: string;
  candidateName: string | null;
  jobTitle: string;
  roundName: string;
  slotStart: string;
  timezone: string;
  interviewerNames: string[];
  interviewerRescheduleUrl?: string;
  candidateRescheduleUrl?: string;
}

export function buildSchedulingConfirmedEmail(args: ConfirmedEmailArgs): {
  subject: string;
  body: string;
} {
  const when = formatSlotLocal(args.slotStart, args.timezone);
  const panel = args.interviewerNames.join(", ");
  const candidate = args.candidateName ?? "Candidate";
  const rescheduleLines = [
    args.interviewerRescheduleUrl
      ? `Interviewers — need to reschedule? ${args.interviewerRescheduleUrl}`
      : null,
    args.candidateRescheduleUrl
      ? `Candidate reschedule link: ${args.candidateRescheduleUrl}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `Confirmed: ${candidate} interview · ${when}`,
    body:
      `Interview scheduled for ${args.jobTitle} (${args.roundName}).\n\n` +
      `Candidate: ${candidate}\n` +
      `When: ${when} (${args.timezone})\n` +
      `Interviewers: ${panel}\n\n` +
      `The candidate has been sent a calendar invite.\n` +
      (rescheduleLines ? `\n${rescheduleLines}\n` : "\n") +
      `\n${args.recruiterName}`,
  };
}

export interface CandidateInviteEmailArgs {
  candidateName: string | null;
  jobTitle: string;
  roundName: string;
  slotStart: string;
  timezone: string;
  durationMinutes: number;
  recruiterName: string;
  interviewerNames: string[];
  rescheduleUrl?: string;
  interviewerRescheduleUrl?: string;
}

export function buildCandidateInviteEmail(args: CandidateInviteEmailArgs): {
  subject: string;
  body: string;
} {
  const when = formatSlotLocal(args.slotStart, args.timezone);
  const name = args.candidateName?.split(" ")[0] ?? "there";
  const panel = args.interviewerNames.join(", ");

  const rescheduleNote = args.rescheduleUrl
    ? `\nNeed to reschedule? Use this link (valid up to 24h before the interview):\n${args.rescheduleUrl}\n`
    : "";
  const panelRescheduleNote = args.interviewerRescheduleUrl
    ? `\nInterviewers — need to reschedule? ${args.interviewerRescheduleUrl}\n`
    : "";

  return {
    subject: `Your ${args.jobTitle} interview — ${when}`,
    body:
      `Hi ${name},\n\n` +
      `Great news — your ${args.durationMinutes}-minute ${args.roundName} for the ${args.jobTitle} role is confirmed.\n\n` +
      `When: ${when} (${args.timezone})\n` +
      `With: ${panel}\n\n` +
      `A calendar invite (.ics) is attached — please accept it to add the interview to your calendar.\n` +
      rescheduleNote +
      panelRescheduleNote +
      `\nLooking forward to speaking with you!\n\n` +
      `${args.recruiterName}`,
  };
}

export interface CandidateReschedulePendingEmailArgs {
  candidateName: string | null;
  jobTitle: string;
  roundName: string;
  timezone: string;
  durationMinutes: number;
  recruiterName: string;
  interviewerNames: string[];
  previousSlotStart?: string;
  proposedSlots: { start: string; end: string }[];
}

/** Candidate notice while the panel confirms newly proposed times after a reschedule. */
export function buildCandidateReschedulePendingEmail(args: CandidateReschedulePendingEmailArgs): {
  subject: string;
  body: string;
} {
  const name = args.candidateName?.split(" ")[0] ?? "there";
  const panel = args.interviewerNames.join(", ");
  const slots = args.proposedSlots;
  const multi = slots.length > 1;
  const timesBlock = multi
    ? slots.map((s, i) => `  ${i + 1}. ${formatSlotLocal(s.start, args.timezone)}`).join("\n")
    : formatSlotLocal(slots[0]!.start, args.timezone);
  const previousLine = args.previousSlotStart
    ? `Previous time: ${formatSlotLocal(args.previousSlotStart, args.timezone)}\n\n`
    : "";

  return {
    subject: `Your ${args.jobTitle} interview is being rescheduled`,
    body:
      `Hi ${name},\n\n` +
      `Your ${args.roundName} for the ${args.jobTitle} role is being rescheduled.\n\n` +
      previousLine +
      (multi
        ? `We're confirming one of these new times with your interview panel:\n${timesBlock}\n`
        : `We're confirming this new time with your interview panel:\n${timesBlock}\n`) +
      `\nDuration: ${args.durationMinutes} minutes\n` +
      `Panel: ${panel}\n\n` +
      `You'll receive a confirmation email with an updated calendar invite once the panel approves.\n\n` +
      `${args.recruiterName}`,
  };
}

export interface CandidateRescheduledEmailArgs extends CandidateInviteEmailArgs {
  previousSlotStart: string;
}

/** Candidate confirmation after a reschedule is approved by the panel. */
export function buildCandidateRescheduledEmail(args: CandidateRescheduledEmailArgs): {
  subject: string;
  body: string;
} {
  const when = formatSlotLocal(args.slotStart, args.timezone);
  const previousWhen = formatSlotLocal(args.previousSlotStart, args.timezone);
  const name = args.candidateName?.split(" ")[0] ?? "there";
  const panel = args.interviewerNames.join(", ");
  const rescheduleNote = args.rescheduleUrl
    ? `\nNeed to reschedule again? Use this link (valid up to 24h before the interview):\n${args.rescheduleUrl}\n`
    : "";

  return {
    subject: `Updated: your ${args.jobTitle} interview — ${when}`,
    body:
      `Hi ${name},\n\n` +
      `Your ${args.durationMinutes}-minute ${args.roundName} for the ${args.jobTitle} role has been rescheduled.\n\n` +
      `Previous time: ${previousWhen}\n` +
      `New time: ${when} (${args.timezone})\n` +
      `With: ${panel}\n\n` +
      `An updated calendar invite (.ics) is attached — please accept it to update your calendar.\n` +
      rescheduleNote +
      `\nLooking forward to speaking with you!\n\n` +
      `${args.recruiterName}`,
  };
}

/** Build a reschedule URL for a candidate using their reschedule token. */
export function buildCandidateRescheduleUrl(token: string, origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/schedule/reschedule/${token}`;
}

/** Panel link to release a confirmed slot and propose new times. */
export function buildInterviewerRescheduleUrl(responseToken: string, origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/slack/actions?token=${responseToken}&action=cancel`;
}
