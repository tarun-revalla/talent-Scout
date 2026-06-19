"use client";

import { avatarColors, avatarInitial } from "@/lib/avatars";

const SIZES = {
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-xl",
};

export function Avatar({
  name,
  size = "md",
  className = "",
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initial = avatarInitial(name);
  const colors = avatarColors(name);
  return (
    <div
      aria-hidden
      className={`${SIZES[size]} ${colors.bg} ${colors.text} rounded-full flex items-center justify-center font-semibold shrink-0 ${className}`}
    >
      {initial}
    </div>
  );
}
