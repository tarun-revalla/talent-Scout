"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Link2,
  Loader2,
  MoreHorizontal,
  MousePointerClick,
  Plus,
  Power,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { formatSlotRange, localDayKey } from "@/lib/dates";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { EngageButton } from "@/components/EngageButton";
import type { InterviewRound } from "@/lib/schemas";
import type { MatchRow } from "@/components/MatchTable";

type Tab = "apply" | "schedule" | "match";

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

interface Interviewer {
  id: string;
  name: string;
  email: string;
  timezone: string;
  round_index: number | null;
}

interface FreeSlot {
  start: string;
  end: string;
}

const DURATIONS = [30, 45, 60] as const;

function isValidEmail(email: string): boolean {
  return email.includes("@") && email.includes(".");
}

function formatDayLabel(day: string): string {
  return new Date(day + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDayShort(day: string): string {
  return new Date(day + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });
}

function slotLocalHour(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

function groupSlotsByPeriod(slots: FreeSlot[], timezone: string) {
  const morning: FreeSlot[] = [];
  const afternoon: FreeSlot[] = [];
  const evening: FreeSlot[] = [];
  for (const s of slots) {
    const hour = slotLocalHour(s.start, timezone);
    if (hour < 12) morning.push(s);
    else if (hour < 17) afternoon.push(s);
    else evening.push(s);
  }
  return [
    { label: "Morning", slots: morning },
    { label: "Afternoon", slots: afternoon },
    { label: "Evening", slots: evening },
  ].filter((g) => g.slots.length > 0);
}

function AnimatedNumber({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="tabular-nums"
    >
      {value}
    </motion.span>
  );
}

function FunnelStep({
  label,
  value,
  max,
  icon: Icon,
  accent,
  iconBg,
  delay = 0,
}: {
  label: string;
  value: number;
  max: number;
  icon: typeof Eye;
  accent: string;
  iconBg: string;
  delay?: number;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-100 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg", iconBg)}>
            <Icon className="h-3.5 w-3.5 opacity-80" />
          </span>
          {label}
        </span>
        <span className="text-xl font-bold text-slate-900">
          <AnimatedNumber value={value} />
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, value > 0 ? 6 : 0)}%` }}
          transition={{ duration: 0.55, delay: delay + 0.1, ease: [0.4, 0, 0.2, 1] }}
          className={cn("h-full rounded-full", accent)}
        />
      </div>
    </motion.div>
  );
}

function TabPanel({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  return (
    <motion.div
      key={tabKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function ApplyLinkTab({
  invite,
  loading,
  copied,
  regenerating,
  toggling,
  onCopy,
  onToggle,
  onRegenerate,
}: {
  invite: InviteData | null;
  loading: boolean;
  copied: boolean;
  regenerating: boolean;
  toggling: boolean;
  onCopy: () => void;
  onToggle: () => void;
  onRegenerate: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading apply link…
      </div>
    );
  }
  if (!invite) {
    return <p className="py-6 text-center text-sm text-slate-500">Apply link unavailable</p>;
  }

  const { analytics } = invite;
  const funnelMax = Math.max(analytics.uniqueOpens, analytics.applicants, 1);
  const conversionRate =
    analytics.uniqueOpens > 0
      ? Math.round((analytics.applicants / analytics.uniqueOpens) * 100)
      : 0;
  const hasActivity = analytics.uniqueOpens > 0 || analytics.applicants > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-gradient-to-r from-cobalt-50 to-sky-50 px-3 py-2.5 ring-1 ring-cobalt-100">
          <Link2 className="h-4 w-4 shrink-0 text-cobalt-600" />
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700" title={invite.inviteUrl}>
            {invite.inviteUrl}
          </code>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onCopy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer",
            copied
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-cobalt-600 text-white hover:bg-cobalt-700 shadow-sm shadow-cobalt-900/10",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy link"}
        </motion.button>
        <button
          type="button"
          disabled={toggling}
          onClick={onToggle}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium cursor-pointer ring-1 transition-colors disabled:opacity-50",
            invite.inviteEnabled
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100",
          )}
        >
          {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
          {invite.inviteEnabled ? "Live" : "Paused"}
        </button>
      </div>

      <div className="rounded-2xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application funnel</p>
          {hasActivity && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700"
            >
              {conversionRate}% conversion
            </motion.span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
          <FunnelStep label="Opens" value={analytics.uniqueOpens} max={funnelMax} icon={Eye} accent="bg-cobalt-500" iconBg="bg-cobalt-100 text-cobalt-600" delay={0} />
          <FunnelStep label="Started" value={analytics.uniqueStarted} max={funnelMax} icon={MousePointerClick} accent="bg-sky-500" iconBg="bg-sky-100 text-sky-600" delay={0.05} />
          <FunnelStep label="Completed" value={analytics.uniqueCompleted} max={funnelMax} icon={CheckCircle2} accent="bg-emerald-500" iconBg="bg-emerald-100 text-emerald-600" delay={0.1} />
          <FunnelStep label="Applied" value={analytics.applicants} max={funnelMax} icon={Users} accent="bg-amber-500" iconBg="bg-amber-100 text-amber-600" delay={0.15} />
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          {hasActivity ? (
            <>
              {analytics.totalOpens > analytics.uniqueOpens && (
                <span>{analytics.totalOpens} total page views · </span>
              )}
              Share the link to keep the funnel growing.
            </>
          ) : (
            "No visits yet — copy the link and share it with candidates."
          )}
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={regenerating}
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer disabled:opacity-50"
        >
          {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Generate new link
        </button>
      </div>
    </div>
  );
}

function ScoreBlendSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const matchPct = Math.round(value * 100);
  const interestPct = 100 - matchPct;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <motion.span
            key={matchPct}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="inline-block text-2xl font-bold tabular-nums text-cobalt-600"
          >
            {matchPct}%
          </motion.span>
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Match
          </span>
        </div>
        <div className="text-right">
          <motion.span
            key={interestPct}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="inline-block text-2xl font-bold tabular-nums text-violet-600"
          >
            {interestPct}%
          </motion.span>
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Interest
          </span>
        </div>
      </div>
      <div className="relative flex h-6 items-center">
        <div
          className="pointer-events-none absolute inset-x-0 h-2 overflow-hidden rounded-full bg-slate-200"
          aria-hidden
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cobalt-500 to-cobalt-400"
            animate={{ width: `${matchPct}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-violet-400 to-violet-500"
            animate={{ width: `${interestPct}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label="Match vs interest weighting"
          className="range-blend relative z-10 w-full cursor-pointer"
        />
      </div>
    </div>
  );
}

function OpenSlotsCalendar({
  slotsByDay,
  loading,
  duration,
  timezone,
  selectedDay,
  onSelectDay,
}: {
  slotsByDay: [string, FreeSlot[]][];
  loading: boolean;
  duration: number;
  timezone: string;
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-cobalt-500" />
        <p className="text-xs text-slate-500">Reading calendar…</p>
      </div>
    );
  }

  if (slotsByDay.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
        <p className="text-sm font-medium text-slate-600">No open slots</p>
        <p className="text-xs text-slate-400">No {duration}-minute windows in the next 14 days</p>
      </div>
    );
  }

  const activeDay = selectedDay ?? slotsByDay[0]?.[0] ?? null;
  const activeSlots = slotsByDay.find(([d]) => d === activeDay)?.[1] ?? [];
  const tzShort = timezone ? timezone.split("/").pop() : "";
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const periods = groupSlotsByPeriod(activeSlots, tz);

  return (
    <div className="space-y-2">
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {slotsByDay.map(([day, daySlots]) => {
          const active = day === activeDay;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-xs font-medium tabular-nums cursor-pointer transition-colors",
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
              )}
            >
              {formatDayShort(day)}
              <span className={cn("ml-1 opacity-70", active ? "text-white/80" : "text-slate-400")}>
                ({daySlots.length})
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-slate-100 pt-2">
        <p className="mb-2 text-[11px] text-slate-500">
          {activeDay ? formatDayLabel(activeDay) : ""}
          {tzShort && ` · ${tzShort}`}
          {activeSlots.length > 0 && (
            <>
              {" · "}
              <span className="font-medium text-slate-700">
                {activeSlots.length} × {duration} min
              </span>
            </>
          )}
        </p>

        {periods.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No slots this day</p>
        ) : (
          <div className="space-y-2.5 max-h-32 overflow-y-auto">
            {periods.map(({ label, slots: periodSlots }) => (
              <div key={label}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {periodSlots.map((s) => (
                    <span
                      key={s.start}
                      title={`${duration}-minute meeting`}
                      className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium tabular-nums text-slate-700"
                    >
                      {formatSlotRange(s.start, s.end, tz)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchingTab({
  jobId,
  jobTitle,
  jobStatus,
  matches,
  weights,
  threshold,
  autoEnabled,
  subThresholdSelectedIds,
  selectedCount,
  onSelectTopN,
  onClearSelection,
  onWeightsChange,
  onThresholdChange,
  onAutoEnabledChange,
  onRefresh,
  onEngageResult,
}: {
  jobId: string;
  jobTitle: string;
  jobStatus: "open" | "closed" | "draft";
  matches: MatchRow[];
  weights: { match: number; interest: number };
  threshold: number;
  autoEnabled: boolean;
  subThresholdSelectedIds: string[];
  selectedCount: number;
  onSelectTopN?: (n: number) => void;
  onClearSelection?: () => void;
  onWeightsChange: (w: { match: number; interest: number }) => void;
  onThresholdChange: (v: number) => void;
  onAutoEnabledChange: (v: boolean) => void;
  onRefresh: () => void;
  onEngageResult?: (r: { autoEnqueued?: number; threshold?: number }) => void;
}) {
  const [matchWeight, setMatchWeight] = useState(weights.match);
  const [thresh, setThresh] = useState(threshold);
  const [autoOn, setAutoOn] = useState(autoEnabled);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMatchWeight(weights.match), [weights.match]);
  useEffect(() => setThresh(threshold), [threshold]);
  useEffect(() => setAutoOn(autoEnabled), [autoEnabled]);

  const stats = useMemo(() => {
    let above = 0;
    let below = 0;
    let autoEligible = 0;
    for (const m of matches) {
      const score = m.match_score ?? 0;
      if (score >= thresh) above++;
      else below++;
      if (
        autoOn &&
        score >= thresh &&
        m.status === "discovered" &&
        m.candidate?.email &&
        !m.candidate.email_invalid
      ) {
        autoEligible++;
      }
    }
    return { above, below, autoEligible, total: matches.length };
  }, [matches, thresh, autoOn]);

  function updateWeights(v: number) {
    const m = v;
    const i = 1 - v;
    setMatchWeight(m);
    onWeightsChange({ match: m, interest: i });
    void fetch(`/api/jobs/${jobId}/weights`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ match: m, interest: i }),
    });
  }

  async function patchThreshold(payload: { threshold?: number; enabled?: boolean }, immediate = false) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const run = async () => {
      const res = await fetch(`/api/jobs/${jobId}/threshold`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { autoEnqueued?: number; threshold?: number };
      if (res.ok) onEngageResult?.(json);
    };
    if (immediate) await run();
    else debounceRef.current = setTimeout(() => void run(), 300);
  }

  function updateThreshold(v: number) {
    setThresh(v);
    onThresholdChange(v);
    void patchThreshold({ threshold: v });
  }

  function toggleAuto() {
    const next = !autoOn;
    setAutoOn(next);
    onAutoEnabledChange(next);
    void patchThreshold({ enabled: next }, true);
  }

  const abovePct = stats.total > 0 ? (stats.above / stats.total) * 100 : 0;
  const belowPct = stats.total > 0 ? (stats.below / stats.total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Score blend */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white p-4 ring-1 ring-slate-200">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cobalt-600" />
            <p className="text-sm font-semibold text-slate-900">Score blend</p>
          </div>
          <ScoreBlendSlider value={matchWeight} onChange={updateWeights} />
          <p className="mt-2 text-[11px] text-slate-500">Drag to balance resume fit vs candidate interest signals.</p>
        </div>

        {/* Auto-engage */}
        <div
          className={cn(
            "rounded-2xl p-4 ring-1 transition-colors",
            autoOn
              ? "bg-gradient-to-br from-amber-50 to-orange-50 ring-amber-200"
              : "bg-gradient-to-br from-slate-50 to-white ring-slate-200",
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className={cn("h-4 w-4", autoOn ? "text-amber-600" : "text-slate-400")} />
              <p className="text-sm font-semibold text-slate-900">Auto-engage</p>
            </div>
            <button
              type="button"
              onClick={toggleAuto}
              className={cn(
                "relative h-7 w-12 rounded-full transition-colors cursor-pointer",
                autoOn ? "bg-amber-500" : "bg-slate-300",
              )}
              aria-pressed={autoOn}
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                className={cn(
                  "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm",
                  autoOn ? "left-[22px]" : "left-0.5",
                )}
              />
            </button>
          </div>

          <div className="flex items-end gap-3 mb-3">
            <motion.p
              key={Math.round(thresh)}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "text-4xl font-bold tabular-nums",
                autoOn ? "text-amber-700" : "text-slate-300",
              )}
            >
              ≥{Math.round(thresh)}%
            </motion.p>
            {autoOn && stats.autoEligible > 0 && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-1 rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-800"
              >
                {stats.autoEligible} ready
              </motion.span>
            )}
          </div>

          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={thresh}
            onChange={(e) => updateThreshold(parseFloat(e.target.value))}
            disabled={!autoOn}
            aria-label="Auto-engage threshold"
            className="range-threshold w-full cursor-pointer disabled:cursor-not-allowed"
          />
          <p className="mt-2 text-[11px] text-slate-500">
            {autoOn
              ? "Candidates at or above this score are auto-engaged when discovered."
              : "Turn on to automatically outreach high-scoring matches."}
          </p>
        </div>
      </div>

      {/* Distribution */}
      {stats.total > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100"
        >
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-600">Candidate distribution</span>
            <span className="text-slate-400 tabular-nums">{stats.total} total</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${abovePct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="bg-cobalt-500"
              title={`${stats.above} above threshold`}
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${belowPct}%` }}
              transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
              className="bg-slate-400"
              title={`${stats.below} below threshold`}
            />
          </div>
          <div className="mt-2 flex gap-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cobalt-500" />
              {stats.above} above ≥{Math.round(thresh)}%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              {stats.below} below
            </span>
          </div>
        </motion.div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
        {onSelectTopN && (
          <button
            type="button"
            onClick={() => onSelectTopN(10)}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 cursor-pointer transition-colors"
          >
            Select top 10
          </button>
        )}
        {onClearSelection && selectedCount > 0 && (
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            Clear ({selectedCount})
          </button>
        )}
        {subThresholdSelectedIds.length > 0 && jobStatus === "open" && (
          <EngageButton jobId={jobId} matchIds={subThresholdSelectedIds} onSent={onRefresh} />
        )}
        <ExportCsvButton rows={matches} jobTitle={jobTitle} weights={weights} />
      </div>
    </div>
  );
}

export function JobSetupPanel({
  jobId,
  jobTitle,
  jobStatus,
  jobRounds = [],
  matches,
  weights,
  threshold,
  autoEnabled,
  subThresholdSelectedIds,
  selectedCount = 0,
  onSelectTopN,
  onClearSelection,
  onWeightsChange,
  onThresholdChange,
  onAutoEnabledChange,
  onRefresh,
  onEngageResult,
}: {
  jobId: string;
  jobTitle: string;
  jobStatus: "open" | "closed" | "draft";
  jobRounds?: InterviewRound[];
  matches: MatchRow[];
  weights: { match: number; interest: number };
  threshold: number;
  autoEnabled: boolean;
  subThresholdSelectedIds: string[];
  selectedCount?: number;
  onSelectTopN?: (n: number) => void;
  onClearSelection?: () => void;
  onWeightsChange: (w: { match: number; interest: number }) => void;
  onThresholdChange: (v: number) => void;
  onAutoEnabledChange: (v: boolean) => void;
  onRefresh: () => void;
  onEngageResult?: (r: { autoEnqueued?: number; threshold?: number }) => void;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>("apply");

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [togglingInvite, setTogglingInvite] = useState(false);

  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [addingIv, setAddingIv] = useState(false);
  const [ivName, setIvName] = useState("");
  const [ivEmail, setIvEmail] = useState("");
  const [ivTz, setIvTz] = useState("");
  const [ivPreview, setIvPreview] = useState<{
    loading: boolean;
    reachable: boolean | null;
    timezone: string | null;
    needsTz: boolean;
  }>({ loading: false, reachable: null, timezone: null, needsTz: false });

  const [selectedIv, setSelectedIv] = useState("");
  const [duration, setDuration] = useState(60);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsTimezone, setSlotsTimezone] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const loadInvite = useCallback(async () => {
    setInviteLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invite`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setInvite(json);
    } catch {
      setInvite(null);
    } finally {
      setInviteLoading(false);
    }
  }, [jobId]);

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/interviewers`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        const list = (json.interviewers ?? []) as Interviewer[];
        setInterviewers(list);
        if (list.length) setSelectedIv((cur) => cur || list[0].id);
      }
    } finally {
      setTeamLoading(false);
    }
  }, [jobId]);

  const loadSlots = useCallback(async () => {
    if (!selectedIv) return;
    setSlotsLoading(true);
    try {
      const res = await fetch(
        `/api/interviewers/${selectedIv}/availability?duration=${duration}&days=14`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (res.ok) {
        setSlots(json.slots ?? []);
        setSlotsTimezone(json.timezone ?? "");
        setSelectedDay(null);
      } else {
        setSlots([]);
      }
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedIv, duration]);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite]);

  useEffect(() => {
    if (expanded) void loadTeam();
  }, [expanded, loadTeam]);

  useEffect(() => {
    if (expanded && tab === "schedule" && selectedIv) void loadSlots();
  }, [expanded, tab, selectedIv, duration, loadSlots]);

  useEffect(() => {
    if (!isValidEmail(ivEmail.trim())) {
      setIvPreview({ loading: false, reachable: null, timezone: null, needsTz: false });
      return;
    }
    let alive = true;
    setIvPreview((p) => ({ ...p, loading: true }));
    const t = setTimeout(() => {
      void fetch(
        `/api/jobs/${jobId}/interviewers/preview?email=${encodeURIComponent(ivEmail.trim().toLowerCase())}`,
      )
        .then(async (res) => {
          const json = await res.json();
          if (!alive) return;
          if (!res.ok) {
            setIvPreview({ loading: false, reachable: false, timezone: null, needsTz: false });
            return;
          }
          const tz = json.timezone as string | null;
          setIvPreview({
            loading: false,
            reachable: json.reachable ?? false,
            timezone: tz,
            needsTz: Boolean(json.needsTimezone),
          });
          if (tz) setIvTz(tz);
        })
        .catch(
          () =>
            alive &&
            setIvPreview({ loading: false, reachable: null, timezone: null, needsTz: false }),
        );
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [ivEmail, jobId]);

  async function copyLink() {
    if (!invite?.inviteUrl) return;
    await navigator.clipboard.writeText(invite.inviteUrl);
    setCopied(true);
    toast("Link copied", "success");
    setTimeout(() => setCopied(false), 2000);
  }

  async function toggleInvite() {
    if (!invite) return;
    setTogglingInvite(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invite`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteEnabled: !invite.inviteEnabled }),
      });
      if (res.ok) {
        const json = await res.json();
        setInvite((i) => (i ? { ...i, inviteEnabled: json.inviteEnabled } : i));
        toast(json.inviteEnabled ? "Apply link is live" : "Apply link paused", "success");
      }
    } finally {
      setTogglingInvite(false);
    }
  }

  async function regenerateInvite() {
    if (!confirm("Generate a new link? The old one stops working immediately.")) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "regenerate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast("New apply link generated", "success");
      await loadInvite();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setRegenerating(false);
    }
  }

  async function addInterviewer() {
    if (!ivName.trim() || !isValidEmail(ivEmail)) return;
    if (ivPreview.needsTz && !ivTz.trim()) {
      toast("Enter timezone", "error");
      return;
    }
    setAddingIv(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/interviewers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: ivName.trim(),
          email: ivEmail.trim(),
          timezone: ivTz.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast(`${ivName} added`, "success");
      setIvName("");
      setIvEmail("");
      setIvTz("");
      await loadTeam();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setAddingIv(false);
    }
  }

  async function removeInterviewer(id: string, name: string) {
    if (!confirm(`Remove ${name}?`)) return;
    await fetch(`/api/jobs/${jobId}/interviewers/${id}`, { method: "DELETE" });
    await loadTeam();
  }

  async function assignRound(id: string, roundIndex: number | null) {
    // Optimistic update so the dropdown feels instant.
    setInterviewers((prev) =>
      prev.map((iv) => (iv.id === id ? { ...iv, round_index: roundIndex } : iv)),
    );
    try {
      const res = await fetch(`/api/jobs/${jobId}/interviewers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundIndex }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update round");
      }
      toast("Round assignment updated", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update round", "error");
      await loadTeam();
    }
  }

  const summary = [
    invite ? `${invite.analytics.applicants} applied` : null,
    `${interviewers.length} interviewer${interviewers.length === 1 ? "" : "s"}`,
    autoEnabled ? `auto ≥${threshold}%` : `threshold ${threshold}%`,
  ]
    .filter(Boolean)
    .join(" · ");

  const selectedInterviewer = interviewers.find((iv) => iv.id === selectedIv);
  const slotsTz =
    slotsTimezone || selectedInterviewer?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const slotsByDay = useMemo(() => {
    const map = new Map<string, FreeSlot[]>();
    for (const s of slots) {
      const day = localDayKey(s.start, slotsTz);
      map.set(day, [...(map.get(day) ?? []), s]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([day, daySlots]) =>
          [day, [...daySlots].sort((a, b) => a.start.localeCompare(b.start))] as [string, FreeSlot[]],
      );
  }, [slots, slotsTz]);

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    {
      id: "apply",
      label: "Apply link",
      badge: invite ? String(invite.analytics.applicants) : undefined,
    },
    {
      id: "schedule",
      label: "Scheduling",
      badge: interviewers.length ? String(interviewers.length) : undefined,
    },
    { id: "match", label: "Matching" },
  ];

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <div className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cobalt-50 text-cobalt-600">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Job setup</p>
            {!expanded && <p className="text-xs text-slate-500 truncate mt-0.5">{summary}</p>}
          </div>
        </button>
        {!expanded && invite && (
          <button
            type="button"
            onClick={() => void copyLink()}
            className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-lg bg-cobalt-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cobalt-700 cursor-pointer"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            Copy link
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-slate-400 shrink-0 hover:text-slate-600 cursor-pointer px-1"
        >
          {expanded ? "Hide" : "Setup"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="flex gap-1 px-3 pt-3 pb-2 overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors",
                    tab === t.id
                      ? "bg-cobalt-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {t.label}
                  {t.badge && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[10px] tabular-nums",
                        tab === t.id ? "bg-white/20" : "bg-slate-200 text-slate-600",
                      )}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="px-4 pb-4 pt-1 min-h-[140px]">
              <AnimatePresence mode="wait">
                {tab === "apply" && (
                  <TabPanel tabKey="apply">
                    <ApplyLinkTab
                      invite={invite}
                      loading={inviteLoading}
                      copied={copied}
                      regenerating={regenerating}
                      toggling={togglingInvite}
                      onCopy={() => void copyLink()}
                      onToggle={() => void toggleInvite()}
                      onRegenerate={() => void regenerateInvite()}
                    />
                  </TabPanel>
                )}

                {tab === "schedule" && (
                  <TabPanel tabKey="schedule">
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2 items-end">
                        <input
                          value={ivName}
                          onChange={(e) => setIvName(e.target.value)}
                          placeholder="Name"
                          className="flex-1 min-w-[100px] rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt-500/30"
                        />
                        <input
                          type="email"
                          value={ivEmail}
                          onChange={(e) => setIvEmail(e.target.value)}
                          placeholder="Google email"
                          className="flex-1 min-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt-500/30"
                        />
                        {(ivPreview.needsTz ||
                          (ivPreview.reachable && !ivPreview.timezone && !ivPreview.loading)) && (
                          <input
                            value={ivTz}
                            onChange={(e) => setIvTz(e.target.value)}
                            placeholder="Timezone"
                            className="w-36 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt-500/30"
                          />
                        )}
                        <button
                          type="button"
                          disabled={
                            addingIv ||
                            !ivName.trim() ||
                            !isValidEmail(ivEmail) ||
                            ivPreview.loading ||
                            ivPreview.reachable === false
                          }
                          onClick={() => void addInterviewer()}
                          className="inline-flex items-center gap-1 rounded-xl bg-cobalt-600 px-4 py-2 text-sm font-medium text-white hover:bg-cobalt-700 disabled:opacity-40 cursor-pointer shadow-sm"
                        >
                          {addingIv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Add
                        </button>
                      </div>
                      {isValidEmail(ivEmail) && (
                        <p className="text-[11px] text-slate-500">
                          {ivPreview.loading ? (
                            "Checking calendar…"
                          ) : ivPreview.reachable === false ? (
                            <span className="text-red-600">Calendar must be public in Google settings</span>
                          ) : ivPreview.timezone ? (
                            <span className="text-emerald-700 inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> {ivPreview.timezone}
                            </span>
                          ) : ivPreview.reachable ? (
                            "Enter timezone above"
                          ) : null}
                        </p>
                      )}

                      {teamLoading ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </div>
                      ) : interviewers.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4 text-center">Add an interviewer to see open slots</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {interviewers.map((iv) => (
                              <button
                                key={iv.id}
                                type="button"
                                onClick={() => setSelectedIv(iv.id)}
                                className={cn(
                                  "group inline-flex items-center gap-2 rounded-xl border pl-3 pr-2 py-2 text-xs cursor-pointer transition-all",
                                  selectedIv === iv.id
                                    ? "border-cobalt-300 bg-cobalt-50 text-cobalt-900 shadow-sm ring-1 ring-cobalt-200"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                                )}
                              >
                                <span className="font-semibold">{iv.name}</span>
                                <span className="text-slate-400">{iv.timezone.split("/").pop()}</span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void removeInterviewer(iv.id, iv.name);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.stopPropagation();
                                      void removeInterviewer(iv.id, iv.name);
                                    }
                                  }}
                                  className="p-0.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </span>
                              </button>
                            ))}
                          </div>

                          {selectedIv && jobRounds.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                              <span className="text-xs text-slate-600">
                                <span className="font-medium text-slate-800">
                                  {selectedInterviewer?.name}
                                </span>
                                {" · interviews for"}
                              </span>
                              <select
                                value={
                                  selectedInterviewer?.round_index == null
                                    ? ""
                                    : String(selectedInterviewer.round_index)
                                }
                                onChange={(e) =>
                                  void assignRound(
                                    selectedIv,
                                    e.target.value === "" ? null : Number(e.target.value),
                                  )
                                }
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-cobalt-500/30"
                              >
                                <option value="">All rounds</option>
                                {[...jobRounds]
                                  .sort((a, b) => a.order - b.order)
                                  .map((r, i) => (
                                    <option key={r.order} value={String(i)}>
                                      {r.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}

                          {selectedIv && (
                            <div className="space-y-2 border-t border-slate-100 pt-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs text-slate-600">
                                  <span className="font-medium text-slate-800">{selectedInterviewer?.name}</span>
                                  {" · "}open slots
                                </p>
                                <div className="ml-auto flex items-center gap-1">
                                  {DURATIONS.map((d) => (
                                    <button
                                      key={d}
                                      type="button"
                                      onClick={() => setDuration(d)}
                                      className={cn(
                                        "rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer",
                                        duration === d
                                          ? "bg-slate-800 text-white"
                                          : "text-slate-500 hover:bg-slate-100",
                                      )}
                                    >
                                      {d}m
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => void loadSlots()}
                                    disabled={slotsLoading}
                                    className="ml-1 inline-flex items-center p-1 text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-50"
                                    aria-label="Refresh slots"
                                  >
                                    <RefreshCw className={cn("h-3.5 w-3.5", slotsLoading && "animate-spin")} />
                                  </button>
                                </div>
                              </div>
                              <OpenSlotsCalendar
                                slotsByDay={slotsByDay}
                                loading={slotsLoading}
                                duration={duration}
                                timezone={slotsTimezone || selectedInterviewer?.timezone || ""}
                                selectedDay={selectedDay}
                                onSelectDay={setSelectedDay}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabPanel>
                )}

                {tab === "match" && (
                  <TabPanel tabKey="match">
                    <MatchingTab
                      jobId={jobId}
                      jobTitle={jobTitle}
                      jobStatus={jobStatus}
                      matches={matches}
                      weights={weights}
                      threshold={threshold}
                      autoEnabled={autoEnabled}
                      subThresholdSelectedIds={subThresholdSelectedIds}
                      selectedCount={selectedCount}
                      onSelectTopN={onSelectTopN}
                      onClearSelection={onClearSelection}
                      onWeightsChange={onWeightsChange}
                      onThresholdChange={onThresholdChange}
                      onAutoEnabledChange={onAutoEnabledChange}
                      onRefresh={onRefresh}
                      onEngageResult={onEngageResult}
                    />
                  </TabPanel>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function JobConfigureMenu({
  disabled,
  onEditJd,
  onEditEmail,
  onEditRounds,
  onArchive,
}: {
  disabled?: boolean;
  onEditJd: () => void;
  onEditEmail: () => void;
  onEditRounds: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
        aria-label="Configure job"
      >
        <MoreHorizontal className="h-4 w-4 text-slate-600" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {[
              { label: "Edit job description", action: onEditJd },
              { label: "Email templates", action: onEditEmail },
              { label: "Interview rounds", action: onEditRounds },
              { label: "Archive job", action: onArchive, danger: true },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.action();
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer",
                  item.danger ? "text-red-600" : "text-slate-700",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
