"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, Mail, Plus, Trash2, X, Save } from "lucide-react";
import type { EmailSettings } from "@/lib/schemas";
import { DEFAULT_EMAIL_SETTINGS } from "@/lib/email-templates";

export function EmailTemplateModal({
  jobId,
  initialSettings,
  onClose,
  onSaved,
}: {
  jobId: string;
  initialSettings?: EmailSettings | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState<EmailSettings>(
    initialSettings ?? DEFAULT_EMAIL_SETTINGS,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSettings) setSettings(initialSettings);
  }, [initialSettings]);

  function updateQuestion(index: number, value: string) {
    setSettings((s) => ({
      ...s,
      interest_questions: s.interest_questions.map((q, i) => (i === index ? value : q)),
    }));
  }

  function addQuestion() {
    setSettings((s) => ({
      ...s,
      interest_questions: [...s.interest_questions, ""],
    }));
  }

  function removeQuestion(index: number) {
    setSettings((s) => ({
      ...s,
      interest_questions: s.interest_questions.filter((_, i) => i !== index),
    }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const cleaned = {
        ...settings,
        interest_questions: settings.interest_questions.map((q) => q.trim()).filter(Boolean),
      };
      const res = await fetch(`/api/jobs/${jobId}/email-settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email_settings: cleaned }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <Mail className="w-4 h-4 text-cobalt-600" />
          <span className="font-medium text-slate-900">Email templates</span>
          <span className="hidden sm:inline text-xs text-slate-500">
            Customise outreach tone, sign-off, and interest questions for this job.
          </span>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="ml-auto p-1.5 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Recruiter name (sign-off)</span>
            <input
              value={settings.recruiter_name}
              onChange={(e) => setSettings((s) => ({ ...s, recruiter_name: e.target.value }))}
              disabled={busy}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Initial email instructions</span>
            <textarea
              value={settings.initial_instructions}
              onChange={(e) =>
                setSettings((s) => ({ ...s, initial_instructions: e.target.value }))
              }
              disabled={busy}
              rows={3}
              placeholder="Optional: tone, company pitch, things to emphasise…"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Follow-up email instructions</span>
            <textarea
              value={settings.followup_instructions}
              onChange={(e) =>
                setSettings((s) => ({ ...s, followup_instructions: e.target.value }))
              }
              disabled={busy}
              rows={3}
              placeholder="Optional: how to handle scheduling, deferrals, etc."
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">
              Interview prep packet notes
            </span>
            <textarea
              value={settings.prep_packet_instructions ?? ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, prep_packet_instructions: e.target.value }))
              }
              disabled={busy}
              rows={3}
              placeholder="Optional: what to review, format of the round, who they'll meet, links to share…"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <span className="text-xs text-slate-400">
              Added as a “Notes from the team” section in the prep email candidates get before
              each interview.
            </span>
          </label>

          <div className="rounded-md border border-slate-200 p-3 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.decline_enabled ?? false}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, decline_enabled: e.target.checked }))
                }
                disabled={busy}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cobalt-600 cursor-pointer"
              />
              <span>
                <span className="text-sm font-medium text-slate-700">
                  Auto-send decline emails
                </span>
                <span className="block text-xs text-slate-400">
                  When a candidate is rejected during interviews, automatically send a kind,
                  personalised decline email. Internal scores and reasons are never disclosed.
                </span>
              </span>
            </label>
            {settings.decline_enabled && (
              <textarea
                value={settings.decline_instructions ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, decline_instructions: e.target.value }))
                }
                disabled={busy}
                rows={2}
                placeholder="Optional: tone or specifics for decline emails…"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Interest questions</span>
              <button
                type="button"
                onClick={addQuestion}
                disabled={busy || settings.interest_questions.length >= 8}
                className="inline-flex items-center gap-1 text-xs text-cobalt-600 hover:text-cobalt-700 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {settings.interest_questions.map((q, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-xs text-slate-400 pt-2.5 w-4">{i + 1}.</span>
                <input
                  value={q}
                  onChange={(e) => updateQuestion(i, e.target.value)}
                  disabled={busy}
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeQuestion(i)}
                  disabled={busy || settings.interest_questions.length <= 1}
                  className="p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 disabled:opacity-40"
                  aria-label={`Remove question ${i + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-40 px-3 py-2 text-sm font-medium text-white"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save templates
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
