"use client";

import Link from "next/link";
import { memo } from "react";
import { cn } from "@/lib/cn";

export const NavLink = memo(function NavLink({
  href,
  label,
  active,
  mobile = false,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        mobile
          ? "flex items-center rounded-xl px-4 py-3 text-base font-medium transition-colors"
          : "flex h-16 items-center border-b-2 -mb-px text-xs font-semibold uppercase tracking-wider transition-colors",
        active
          ? mobile
            ? "bg-cobalt-50 text-cobalt-700"
            : "border-cobalt-600 text-cobalt-700"
          : mobile
            ? "text-slate-700 hover:bg-slate-100"
            : "border-transparent text-slate-500 hover:text-cobalt-700",
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
});
