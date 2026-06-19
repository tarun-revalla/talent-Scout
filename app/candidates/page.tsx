"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { LayoutGrid, List, RefreshCw } from "lucide-react";
import { UploadDropzone } from "@/components/UploadDropzone";
import { CandidateTable, type CandidateRow } from "@/components/CandidateTable";
import { CandidatePoolDrawer } from "@/components/CandidatePoolDrawer";
import { DuplicatesModal, type DuplicatePair } from "@/components/DuplicatesModal";
import { Pagination } from "@/components/Pagination";
import { BulkActionBar } from "@/components/BulkActionBar";
import { useToast } from "@/components/Toast";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { IconButton } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";
import { supabaseBrowser } from "@/lib/db";
import { readRouteCache, writeRouteCache, isRouteCacheFresh } from "@/lib/route-cache";

const CACHE_KEY = "candidates-list";
const CACHE_TTL_MS = 45_000;

export default function CandidatesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<CandidateRow[]>(() => readRouteCache(CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(() => readRouteCache(CACHE_KEY) == null);
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [view, setView] = useState<"table" | "grid">("table");
  const [activeCandidate, setActiveCandidate] = useState<CandidateRow | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (!force && isRouteCacheFresh(CACHE_KEY, CACHE_TTL_MS)) return;
    const hasCached = readRouteCache(CACHE_KEY) != null;
    if (!hasCached) setLoading(true);
    try {
      const res = await fetch("/api/candidates", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        const list = json.candidates ?? [];
        writeRouteCache(CACHE_KEY, list);
        setRows(list);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sb = supabaseBrowser();
    const channelName = `cand-bounce-${Math.random().toString(36).slice(2, 10)}`;
    const channel = sb
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candidates" },
        (payload) => {
          const newRow = payload.new as {
            id?: string;
            name?: string | null;
            email?: string | null;
            email_invalid?: boolean | null;
          };
          const oldRow = payload.old as { email_invalid?: boolean | null };
          if (newRow?.email_invalid && !oldRow?.email_invalid) {
            const who = newRow.name ?? newRow.email ?? "A candidate";
            toast(`${who}'s email bounced — marked invalid.`, "error");
            void refresh(true);
          }
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [toast, refresh]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [perPage]);

  async function handleDelete(id: string, name: string | null) {
    setRows((rs) => rs.filter((r) => r.id !== id));
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    if (activeCandidate?.id === id) setActiveCandidate(null);
    const res = await fetch(`/api/candidates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast(`Failed to delete ${name ?? "candidate"}`, "error");
      void refresh(true);
    } else {
      toast(`Deleted ${name ?? "candidate"}`, "success");
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} candidate(s) permanently?`)) return;
    setBulkBusy(true);
    setRows((rs) => rs.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    if (activeCandidate && selected.has(activeCandidate.id)) setActiveCandidate(null);
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/candidates/${id}`, { method: "DELETE" })),
    );
    setBulkBusy(false);
    const failed = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok),
    ).length;
    if (failed === 0) toast(`Deleted ${ids.length} candidate(s)`, "success");
    else {
      toast(`Deleted ${ids.length - failed}, ${failed} failed`, "error");
      void refresh(true);
    }
  }

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [rows],
  );

  const total = sorted.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, lastPage);
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * perPage, safePage * perPage),
    [sorted, safePage, perPage],
  );

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(visibleIds: string[], select: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (select) visibleIds.forEach((id) => next.add(id));
      else visibleIds.forEach((id) => next.delete(id));
      return next;
    });
  }

  const poolLabel = loading
    ? "Loading…"
    : `${total} candidate${total === 1 ? "" : "s"} in pool`;

  return (
    <PageShell>
      <BulkActionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onBulkDelete={bulkDelete}
        busy={bulkBusy}
      />

      <PageHeader
        eyebrow="Talent pool"
        title="Candidates"
        description="Upload resumes (PDF, CSV, JSON or ZIP). New candidates are auto-matched against all open jobs. Pipeline stages live on each job's match list."
      />

      <section className="mb-8">
        <UploadDropzone
          variant="dashboard"
          onComplete={(r) => {
            void refresh(true);
            const dups = (r as { duplicates?: DuplicatePair[] }).duplicates;
            if (dups && dups.length) setDuplicates(dups);
            else if (r.created > 0) {
              toast(`Added ${r.created} candidate(s)`, "success");
            }
          }}
        />
      </section>

      <AnimatePresence>
        {duplicates.length > 0 && (
          <DuplicatesModal
            duplicates={duplicates}
            onClose={() => setDuplicates([])}
            onResolved={() => {
              void refresh(true);
              toast("Duplicates resolved", "success");
            }}
          />
        )}
      </AnimatePresence>

      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            {poolLabel}
          </span>
          <div className="flex items-center gap-3">
            <IconButton
              variant="default"
              size="sm"
              onClick={() => void refresh(true)}
              aria-label="Refresh candidate list"
              title="Refresh"
              className="h-9 w-9"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </IconButton>
            <ViewToggle
              value={view}
              onChange={setView}
              options={[
                { value: "table", label: "Table", icon: List },
                { value: "grid", label: "Grid", icon: LayoutGrid },
              ]}
            />
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <CandidateTable
            rows={pageRows}
            loading={loading}
            onDelete={handleDelete}
            selected={selected}
            onToggleSelected={toggleSelected}
            onSelectAll={selectAll}
            variant="dashboard"
            view={view}
            onRowClick={setActiveCandidate}
            showUploadHint={!loading && total > 0}
          />
        </div>

        {total > perPage && (
          <div className="border-t border-slate-100 px-4 pb-4 sm:px-5">
            <Pagination
              page={safePage}
              perPage={perPage}
              total={total}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          </div>
        )}
      </Card>

      <CandidatePoolDrawer
        candidate={activeCandidate}
        onClose={() => setActiveCandidate(null)}
      />
    </PageShell>
  );
}
