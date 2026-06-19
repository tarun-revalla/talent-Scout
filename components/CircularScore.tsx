"use client";

export function CircularScore({
  value,
  size = "md",
}: {
  value: number | null;
  size?: "sm" | "md";
}) {
  if (value == null) {
    return <span className="text-slate-300 text-sm">—</span>;
  }
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const deg = (v / 100) * 360;
  const outer = size === "sm" ? "w-10 h-10" : "w-12 h-12";
  const inner = size === "sm" ? "w-8 h-8" : "w-10 h-10";

  return (
    <div
      className={`relative ${outer} rounded-full flex items-center justify-center shrink-0`}
      style={{
        background: `conic-gradient(#2563eb ${deg}deg, #e5e7eb ${deg}deg)`,
      }}
      aria-label={`Interest score ${v}`}
    >
      <div className={`absolute ${inner} rounded-full bg-white`} />
      <span className="relative text-[10px] font-semibold text-slate-700 tabular-nums sm:text-xs">
        {v}
      </span>
    </div>
  );
}
