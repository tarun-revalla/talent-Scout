"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Copy,
  Check,
  Link2,
  Loader2,
  RefreshCw,
  Users,
  Eye,
  MousePointerClick,
  CheckCircle2,
  Power,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";

interface InviteAnalytics {
  uniqueOpens: number;
  uniqueStarted: number;
  uniqueCompleted: number;
  applicants: number;
  totalOpens: number;
}

interface InviteData {
  inviteUrl: string;
  inviteEnabled: boolean;
  analytics: InviteAnalytics;
}

function shortenApplyPath(url: string): string {
  try {
    const path = new URL(url).pathname;
    if (path.length <= 22) return path;
    return `${path.slice(0, 14)}…${path.slice(-6)}`;
  } catch {
    return url.length > 22 ? `${url.slice(0, 14)}…` : url;
  }
}

function FunnelStep({
  label,
  value,
  max,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  icon: typeof Eye;
  accent: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <Icon className="h-3 w-3 shrink-0 opacity-70" />
          {label}
        </span>
        <span className="text-sm font-bold tabular-nums text-slate-900">{value}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, value > 0 ? 8 : 0)}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className={cn("h-full rounded-full", accent)}
        />
      </div>
    </div>
  );
}

export function InviteLinkCard({ jobId }: { jobId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/invite`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load invite link");
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyLink() {
    if (!data?.inviteUrl) return;
    await navigator.clipboard.writeText(data.inviteUrl);
    setCopied(true);
    toast("Invite link copied", "success");
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerate(e: React.MouseEvent) {
    e.stopPropagation();
    if (
      !(await confirm("Regenerate invite link? The old link will stop working immediately.", {
        title: "Regenerate invite link",
        confirmLabel: "Regenerate",
        variant: "danger",
      }))
    )
      return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "regenerate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to regenerate");
      toast("New invite link generated", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setRegenerating(false);
    }
  }

  async function toggleEnabled(e: React.MouseEvent) {
    e.stopPropagation();
    if (!data) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invite`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteEnabled: !data.inviteEnabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update");
      setData((d) => (d ? { ...d, inviteEnabled: json.inviteEnabled } : d));
      toast(json.inviteEnabled ? "Invite link enabled" : "Invite link disabled", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading apply link…
      </div>
    );
  }

  if (!data) return null;

  const { analytics } = data;
  const funnelMax = Math.max(analytics.uniqueOpens, analytics.applicants, 1);
  const conversionRate =
    analytics.uniqueOpens > 0
      ? Math.round((analytics.applicants / analytics.uniqueOpens) * 100)
      : 0;
  const hasActivity = analytics.uniqueOpens > 0 || analytics.applicants > 0;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow duration-300",
        open ? "border-cobalt-200/80 shadow-md shadow-cobalt-900/5" : "border-slate-200/80",
      )}
    >
      <div className="flex items-center gap-1 px-1 py-1 sm:gap-1.5 sm:px-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors sm:gap-3 sm:px-2",
            "hover:bg-slate-50 cursor-pointer",
            open && "bg-cobalt-50/50",
          )}
        >
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              data.inviteEnabled ? "bg-cobalt-100 text-cobalt-600" : "bg-slate-100 text-slate-400",
            )}
          >
            <Link2 className="h-3.5 w-3.5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-semibold text-slate-700">Apply link</span>
              {!data.inviteEnabled && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">
                  Off
                </span>
              )}
              <code
                className="min-w-0 truncate rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 ring-1 ring-slate-100"
                title={data.inviteUrl}
              >
                {shortenApplyPath(data.inviteUrl)}
              </code>
            </div>
          </div>

          <span className="hidden shrink-0 items-center gap-1 text-[11px] text-slate-500 sm:flex">
            <Eye className="h-3 w-3 opacity-60" />
            <span className="tabular-nums">{analytics.uniqueOpens}</span>
            <span className="text-slate-300">→</span>
            <span className="tabular-nums font-semibold text-emerald-600">{analytics.applicants}</span>
          </span>

          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
              open && "rotate-180 text-cobalt-500",
            )}
          />
        </button>

        <button
          type="button"
          onClick={() => void copyLink()}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-all",
            copied
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
              : "bg-cobalt-600 text-white hover:bg-cobalt-700 active:scale-[0.98]",
          )}
          title="Copy full link"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 bg-slate-50/50 px-3 pb-3 pt-3 sm:px-4">
              <div className="mb-3 flex items-end gap-2 sm:gap-3">
                <FunnelStep
                  label="Opens"
                  value={analytics.uniqueOpens}
                  max={funnelMax}
                  icon={Eye}
                  accent="bg-cobalt-500"
                />
                <FunnelStep
                  label="Started"
                  value={analytics.uniqueStarted}
                  max={funnelMax}
                  icon={MousePointerClick}
                  accent="bg-sky-500"
                />
                <FunnelStep
                  label="Done"
                  value={analytics.uniqueCompleted}
                  max={funnelMax}
                  icon={CheckCircle2}
                  accent="bg-emerald-500"
                />
                <FunnelStep
                  label="Applied"
                  value={analytics.applicants}
                  max={funnelMax}
                  icon={Users}
                  accent="bg-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                  {hasActivity ? (
                    <>
                      <span className="font-semibold text-slate-700">{conversionRate}%</span> conversion
                      {analytics.totalOpens > analytics.uniqueOpens && (
                        <> · {analytics.totalOpens} total views</>
                      )}
                    </>
                  ) : (
                    "Share the link — stats appear as candidates visit."
                  )}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => void toggleEnabled(e)}
                    disabled={toggling}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-50"
                  >
                    {toggling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Power className="h-3 w-3" />
                    )}
                    {data.inviteEnabled ? "Disable" : "Enable"}
                  </button>
                  <span className="text-slate-200">|</span>
                  <button
                    type="button"
                    onClick={(e) => void regenerate(e)}
                    disabled={regenerating}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-50"
                  >
                    {regenerating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    New link
                  </button>
                </div>
              </div>

              <p
                className="mt-2 truncate font-mono text-[10px] text-slate-400"
                title={data.inviteUrl}
              >
                {data.inviteUrl}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
