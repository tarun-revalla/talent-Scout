"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "./ui/Button";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick?: () => void; href?: string };
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "rounded-2xl border border-dashed border-slate-300/80 bg-white/70 px-6 py-14 text-center shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      {Icon && (
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400 ring-1 ring-slate-200/60">
          <Icon className="h-6 w-6" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      )}
      {action &&
        (action.href ? (
          <Button href={action.href} size="md" className="mt-5">
            {action.label}
          </Button>
        ) : (
          <Button size="md" className="mt-5" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </motion.div>
  );
}

/** Dashed CTA card for "add more" patterns on list pages. */
export function AddMoreCard({
  href,
  title,
  description,
  cta,
  className,
}: {
  href: string;
  title: string;
  description: string;
  cta: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-10 text-center",
        "opacity-80 transition-all duration-200 hover:border-cobalt-300 hover:bg-white hover:opacity-100 hover:shadow-card",
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 transition-transform duration-200 group-hover:scale-105 group-hover:bg-cobalt-50">
        <span className="text-2xl text-slate-400 group-hover:text-cobalt-600">+</span>
      </div>
      <h4 className="mb-1 text-base font-semibold text-slate-900">{title}</h4>
      <p className="max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>
      <span className="mt-4 text-sm font-semibold text-cobalt-600 group-hover:underline">
        {cta}
      </span>
    </Link>
  );
}
