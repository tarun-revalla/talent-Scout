/**
 * Format an ISO/UTC timestamp string into the viewer's local timezone.
 * DB stores timestamptz (UTC) — display always converts on the client.
 */
export function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact "Apr 26, 8:43 AM" — no year. */
export function formatLocalShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "10:00 AM" in optional timezone. */
export function formatTimeOnly(iso: string, timezone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "10:00 AM – 10:30 AM" for a bookable window. */
export function formatSlotRange(start: string, end: string, timezone?: string): string {
  return `${formatTimeOnly(start, timezone)} – ${formatTimeOnly(end, timezone)}`;
}

/** YYYY-MM-DD in the given timezone (defaults to viewer local). */
export function localDayKey(iso: string, timezone?: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: timezone });
}
