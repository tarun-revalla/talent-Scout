"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { NavSearch } from "./NavSearch";
import { NavLink } from "./NavLink";
import { BrandLogo } from "./BrandLogo";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { APP_NAME } from "@/lib/brand";

const NAV_LINKS = [
  { href: "/jobs", label: "Jobs" },
  { href: "/candidates", label: "Candidates" },
  { href: "/analytics", label: "Analytics" },
] as const;

function NavInner() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isActive = useCallback(
    (href: string) => pathname === href || pathname?.startsWith(href + "/"),
    [pathname],
  );

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <>
      <nav
        role="navigation"
        aria-label="Primary"
        className="sticky top-0 z-40 border-b border-slate-200/80 glass-nav"
      >
        <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4 lg:gap-10">
            <Link
              href="/jobs"
              className="group flex shrink-0 items-center gap-3 rounded-xl focus-visible:ring-offset-4"
            >
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-cobalt-600 to-cobalt-700 shadow-sm shadow-cobalt-600/25 transition-transform group-hover:scale-[1.03]">
                <BrandLogo size={18} className="brightness-0 invert" />
              </div>
              <span className="hidden text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-cobalt-700 sm:inline">
                {APP_NAME}
              </span>
            </Link>

            <div className="hidden items-center gap-8 md:flex">
              {NAV_LINKS.map((l) => (
                <NavLink
                  key={l.href}
                  href={l.href}
                  label={l.label}
                  active={isActive(l.href)}
                />
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden w-44 md:block lg:w-72">
              <NavSearch />
            </div>

            <Button
              href="/jobs/new"
              size="sm"
              className="shrink-0 uppercase tracking-wide"
              aria-label="Create new job"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">New Job</span>
            </Button>

            <IconButton
              variant="ghost"
              className="md:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </IconButton>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu overlay"
              className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px] md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={closeMobile}
            />
            <motion.div
              id="mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              className="fixed inset-x-0 top-16 z-50 border-b border-slate-200 bg-white shadow-card md:hidden"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mx-auto max-w-content space-y-1 px-4 py-4 sm:px-6">
                {NAV_LINKS.map((l) => (
                  <NavLink
                    key={l.href}
                    href={l.href}
                    label={l.label}
                    active={isActive(l.href)}
                    mobile
                    onNavigate={closeMobile}
                  />
                ))}
                <Link
                  href="/jobs/new"
                  onClick={closeMobile}
                  className="mt-2 flex items-center gap-2 rounded-xl bg-cobalt-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-cobalt-700"
                >
                  <Plus className="h-4 w-4" />
                  New Job
                </Link>
                <div className="pt-3 lg:hidden">
                  <NavSearch />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export const Nav = memo(NavInner);
