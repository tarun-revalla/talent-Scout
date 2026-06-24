"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import type { InterviewRound } from "@/lib/schemas";

interface Interviewer {
  id: string;
  name: string;
  email: string;
  timezone: string;
  round_index: number | null;
}

interface CalendarPreview {
  loading: boolean;
  reachable: boolean | null;
  timezone: string | null;
  needsTimezone: boolean;
}

const EMPTY_PREVIEW: CalendarPreview = {
  loading: false,
  reachable: null,
  timezone: null,
  needsTimezone: false,
};

function isValidEmail(email: string): boolean {
  return email.includes("@") && email.includes(".");
}

export function InterviewerTeamPanel({
  jobId,
  jobRounds = [],
}: {
  jobId: string;
  jobRounds?: InterviewRound[];
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [calendarPreview, setCalendarPreview] = useState<CalendarPreview>(EMPTY_PREVIEW);
  const [form, setForm] = useState({
    name: "",
    email: "",
    timezone: "",
    roundIndex: "" as string,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/interviewers`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setInterviewers(json.interviewers ?? []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load interviewers", "error");
    } finally {
      setLoading(false);
    }
  }, [jobId, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!showForm || !isValidEmail(form.email.trim())) {
      setCalendarPreview(EMPTY_PREVIEW);
      return;
    }

    const email = form.email.trim().toLowerCase();
    let alive = true;
    setCalendarPreview((p) => ({ ...p, loading: true }));

    const t = setTimeout(() => {
      void fetch(
        `/api/jobs/${jobId}/interviewers/preview?email=${encodeURIComponent(email)}`,
        { cache: "no-store" },
      )
        .then(async (res) => {
          const json = (await res.json()) as {
            reachable?: boolean;
            timezone?: string | null;
            needsTimezone?: boolean;
            error?: string;
          };
          if (!alive) return;
          if (!res.ok) {
            setCalendarPreview({
              loading: false,
              reachable: false,
              timezone: null,
              needsTimezone: false,
            });
            return;
          }
          setCalendarPreview({
            loading: false,
            reachable: json.reachable ?? false,
            timezone: json.timezone ?? null,
            needsTimezone: json.needsTimezone ?? false,
          });
          if (json.timezone) {
            setForm((f) => ({ ...f, timezone: json.timezone! }));
          }
        })
        .catch(() => {
          if (alive) setCalendarPreview(EMPTY_PREVIEW);
        });
    }, 500);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [form.email, jobId, showForm]);

  function resetForm() {
    setForm({ name: "", email: "", timezone: "", roundIndex: "" });
    setCalendarPreview(EMPTY_PREVIEW);
  }

  async function addInterviewer(e: React.FormEvent) {
    e.preventDefault();
    if (calendarPreview.needsTimezone && !form.timezone.trim()) {
      toast("Please enter a timezone for this calendar", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/interviewers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          timezone: form.timezone.trim() || undefined,
          roundIndex: form.roundIndex === "" ? null : Number(form.roundIndex),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add");
      toast(`${form.name} added`, "success");
      resetForm();
      setShowForm(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (
      !(await confirm(`Remove ${name} from this job?`, {
        title: "Remove interviewer",
        confirmLabel: "Remove",
        variant: "danger",
      }))
    )
      return;
    const res = await fetch(`/api/jobs/${jobId}/interviewers/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast(`${name} removed`, "success");
      await load();
    } else {
      toast("Failed to remove", "error");
    }
  }

  const sortedRounds = [...jobRounds].sort((a, b) => a.order - b.order);
  const showTimezoneField =
    calendarPreview.needsTimezone ||
    (calendarPreview.reachable === true && !calendarPreview.timezone && !calendarPreview.loading);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Users className="h-4 w-4 text-cobalt-600" />
          Interview team
          {!open && interviewers.length > 0 && (
            <span className="rounded-full bg-cobalt-50 px-2 py-0.5 text-xs font-medium text-cobalt-700">
              {interviewers.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
              <p className="text-xs text-slate-500 leading-relaxed">
                Add interviewers by name and Google Workspace email. We connect to their public
                calendar automatically — they just need{" "}
                <strong className="font-medium text-slate-600">Make available to public</strong>{" "}
                enabled in Google Calendar settings.
              </p>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : interviewers.length === 0 && !showForm ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center">
                  <Calendar className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500 mb-3">No interviewers yet</p>
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cobalt-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cobalt-700 cursor-pointer"
                  >
                    <UserPlus className="h-4 w-4" /> Add interviewer
                  </button>
                </div>
              ) : (
                <>
                  <ul className="space-y-2">
                    {interviewers.map((iv) => (
                      <li
                        key={iv.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{iv.name}</p>
                          <p className="text-xs text-slate-500 truncate">{iv.email}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {iv.timezone}
                            {iv.round_index != null && sortedRounds[iv.round_index]
                              ? ` · ${sortedRounds[iv.round_index].name}`
                              : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void remove(iv.id, iv.name)}
                          className="shrink-0 p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                          aria-label={`Remove ${iv.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!showForm && (
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-cobalt-600 hover:text-cobalt-700 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" /> Add another
                    </button>
                  )}
                </>
              )}

              {showForm && (
                <form
                  onSubmit={(e) => void addInterviewer(e)}
                  className="space-y-3 pt-2 border-t border-slate-100"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Name</span>
                      <input
                        required
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Jane Smith"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Google email</span>
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, email: e.target.value, timezone: "" }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="jane@company.com"
                      />
                    </label>
                  </div>

                  {isValidEmail(form.email) && (
                    <div className="text-xs">
                      {calendarPreview.loading ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          <Loader2 className="h-3 w-3 animate-spin" /> Checking calendar…
                        </span>
                      ) : calendarPreview.reachable === false ? (
                        <span className="text-red-600">
                          Calendar not reachable — enable &quot;Make available to public&quot; in
                          Google Calendar.
                        </span>
                      ) : calendarPreview.timezone ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Calendar connected · timezone {calendarPreview.timezone}
                        </span>
                      ) : calendarPreview.reachable ? (
                        <span className="text-amber-700">
                          Calendar connected — timezone not in feed, please enter below.
                        </span>
                      ) : null}
                    </div>
                  )}

                  {showTimezoneField && (
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Timezone</span>
                      <input
                        required
                        value={form.timezone}
                        onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Asia/Kolkata"
                        list="iana-timezones"
                      />
                      <datalist id="iana-timezones">
                        <option value="America/New_York" />
                        <option value="America/Los_Angeles" />
                        <option value="America/Chicago" />
                        <option value="Europe/London" />
                        <option value="Europe/Berlin" />
                        <option value="Asia/Kolkata" />
                        <option value="Asia/Singapore" />
                        <option value="Asia/Tokyo" />
                        <option value="Australia/Sydney" />
                      </datalist>
                      <p className="mt-1 text-[10px] text-slate-400">
                        IANA timezone name (e.g. Asia/Kolkata, America/New_York)
                      </p>
                    </label>
                  )}

                  {sortedRounds.length > 0 && (
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Default round</span>
                      <select
                        value={form.roundIndex}
                        onChange={(e) => setForm((f) => ({ ...f, roundIndex: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white cursor-pointer"
                      >
                        <option value="">Any round</option>
                        {sortedRounds.map((r, i) => (
                          <option key={r.order} value={String(i)}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={
                        saving ||
                        calendarPreview.loading ||
                        (isValidEmail(form.email) && calendarPreview.reachable === false)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cobalt-600 px-4 py-2 text-sm font-medium text-white hover:bg-cobalt-700 disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setShowForm(false);
                      }}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
