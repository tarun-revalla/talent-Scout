/**
 * Single source of truth for UI design tokens / shared enums used across
 * components and API routes. Keeping these in one place means adding a stage
 * (or a status) is a one-file change instead of hunting through 5+ files.
 */

// ──────────────── Pipeline stages ────────────────

export const STAGES = ["new", "shortlisted", "contacted", "archived"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  contacted: "Contacted",
  archived: "Archived",
};

// ──────────────── Job status ────────────────

export const JOB_STATUSES = ["draft", "open", "closed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

/** Pill (border + bg + text) classes for a job status badge. */
export const JOB_STATUS_PILL: Record<JobStatus, string> = {
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  closed: "border-slate-200 bg-slate-50 text-slate-500",
};

/** Single-color tag (no border) variant — e.g. used inside the sidebar list. */
export const JOB_STATUS_TAG: Record<JobStatus, string> = {
  open: "bg-emerald-50 text-emerald-700",
  draft: "bg-amber-50 text-amber-700",
  closed: "bg-slate-100 text-slate-500",
};

/** Dot color used in the sidebar before the title. */
export const JOB_STATUS_DOT: Record<JobStatus, string> = {
  open: "bg-emerald-500",
  draft: "bg-amber-500",
  closed: "bg-slate-300",
};

// ──────────────── Interview loop (per match) ────────────────

export const INTERVIEW_STATES = [
  "not_started",
  "in_progress",
  "rejected",
  "hired",
  "withdrawn",
] as const;
export type InterviewState = (typeof INTERVIEW_STATES)[number];

export const INTERVIEW_STATE_LABEL: Record<InterviewState, string> = {
  not_started: "Pre-interview",
  in_progress: "In interviews",
  rejected: "Rejected",
  hired: "Hired",
  withdrawn: "Withdrawn",
};

export const INTERVIEW_STATE_PILL: Record<InterviewState, string> = {
  not_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-cobalt-50 text-cobalt-700",
  rejected: "bg-red-50 text-red-700",
  hired: "bg-emerald-50 text-emerald-700",
  withdrawn: "bg-slate-100 text-slate-500",
};

export const REJECTION_REASONS = [
  "skills_gap",
  "culture_fit",
  "compensation",
  "role_closed",
  "no_show",
  "other",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const REJECTION_REASON_LABEL: Record<RejectionReason, string> = {
  skills_gap: "Skills gap",
  culture_fit: "Culture fit",
  compensation: "Compensation",
  role_closed: "Role closed",
  no_show: "No-show",
  other: "Other",
};

export const ROUND_TYPE_LABEL: Record<string, string> = {
  phone_screen: "Phone screen",
  technical: "Technical",
  system_design: "System design",
  hiring_manager: "Hiring manager",
  culture: "Culture",
  panel: "Panel",
  other: "Other",
};
