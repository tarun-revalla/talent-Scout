"use client";

import { memo } from "react";
import { usePathname } from "next/navigation";
import { Nav } from "@/components/Nav";

const AmbientBackground = memo(function AmbientBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-[0.035]"
      aria-hidden
    >
      <div className="absolute -top-24 left-[5%] h-[28rem] w-[28rem] rounded-full bg-cobalt-600 blur-[120px]" />
      <div className="absolute bottom-[10%] right-[8%] h-[32rem] w-[32rem] rounded-full bg-amber-400 blur-[140px]" />
      <div className="absolute top-[40%] right-[30%] h-64 w-64 rounded-full bg-sky-400 blur-[100px]" />
    </div>
  );
});

/** Stable app chrome — Nav stays mounted; page transitions handled by template.tsx */
export const AppLayoutClient = memo(function AppLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublicApply = pathname?.startsWith("/apply/");
  const isPublicSchedule = pathname?.startsWith("/schedule/respond/");

  if (isPublicApply || isPublicSchedule) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-surface-subtle text-slate-900">
      <Nav />
      {children}
      <AmbientBackground />
    </div>
  );
});
