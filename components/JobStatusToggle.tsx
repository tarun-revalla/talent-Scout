"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleDot, CircleSlash, FileEdit, ChevronDown, Loader2 } from "lucide-react";

type Status = "open" | "closed" | "draft";

const OPTIONS: {
  id: Status;
  label: string;
  pillClass: string;
  iconClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "draft",
    label: "Draft",
    pillClass: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    iconClass: "text-amber-600",
    Icon: FileEdit,
  },
  {
    id: "open",
    label: "Open",
    pillClass: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    iconClass: "text-emerald-600",
    Icon: CircleDot,
  },
  {
    id: "closed",
    label: "Closed",
    pillClass: "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
    iconClass: "text-slate-500",
    Icon: CircleSlash,
  },
];

const MENU_WIDTH = 128;
const MENU_HEIGHT = 108;

export function JobStatusToggle({
  jobId,
  status,
  onChange,
}: {
  jobId: string;
  status: Status;
  onChange: (s: Status) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < MENU_HEIGHT + 12;
    const top = openUp ? rect.top - MENU_HEIGHT - 6 : rect.bottom + 6;
    const left = Math.min(
      Math.max(8, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 8,
    );
    setMenuStyle({ position: "fixed", top, left, width: MENU_WIDTH, zIndex: 9999 });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function setStatus(next: Status) {
    setOpen(false);
    if (next === status) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        onChange(next);
      }
    } finally {
      setBusy(false);
    }
  }

  const current = OPTIONS.find((o) => o.id === status) ?? OPTIONS[1]!;
  const Icon = busy ? Loader2 : current.Icon;

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="rounded-lg border border-slate-200 bg-white py-1 shadow-lg fade-in"
            role="menu"
          >
            {OPTIONS.map((o) => {
              const isCurrent = o.id === status;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitem"
                  onClick={() => void setStatus(o.id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs cursor-pointer hover:bg-slate-50 ${
                    isCurrent ? "font-semibold text-slate-900" : "text-slate-700"
                  }`}
                >
                  <o.Icon className={`h-3 w-3 ${o.iconClass}`} />
                  {o.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((s) => !s)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-60 ${current.pillClass}`}
      >
        <Icon className={`h-3 w-3 ${busy ? "animate-spin" : current.iconClass}`} />
        {current.label}
        <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {menu}
    </>
  );
}
