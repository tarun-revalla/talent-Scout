/**
 * Deterministic avatar styling from a name. Same input → same color, every time.
 * Returns Tailwind class fragments for bg + text so callers can size the wrapper.
 */
const PALETTE: { bg: string; text: string }[] = [
  { bg: "bg-cobalt-100", text: "text-cobalt-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-sky-100", text: "text-sky-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-cobalt-100", text: "text-cobalt-700" },
  { bg: "bg-teal-100", text: "text-teal-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarInitial(name: string | null | undefined): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed[0]!.toUpperCase();
}

export function avatarColors(name: string | null | undefined): { bg: string; text: string } {
  const key = (name ?? "").trim().toLowerCase() || "?";
  return PALETTE[hash(key) % PALETTE.length]!;
}
