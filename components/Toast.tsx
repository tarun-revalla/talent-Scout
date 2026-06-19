"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastApi {
  push: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastApi | null>(null);

let counter = 0;
const DURATION_MS = 4500;

const styles: Record<ToastType, string> = {
  success: "bg-emerald-50/95 border-emerald-200 text-emerald-900",
  error: "bg-red-50/95 border-red-200 text-red-900",
  info: "bg-white/95 border-slate-200 text-slate-800",
};

const iconStyles: Record<ToastType, string> = {
  success: "text-emerald-600",
  error: "text-red-600",
  info: "text-cobalt-600",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = ++counter;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon =
    toast.type === "success" ? CheckCircle2 : toast.type === "error" ? XCircle : Info;
  return (
    <motion.div
      role="status"
      layout
      initial={{ y: 16, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 8, opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-card backdrop-blur-md",
        styles[toast.type],
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconStyles[toast.type])} aria-hidden />
      <span className="flex-1 text-sm leading-snug">{toast.message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-lg p-1 transition-colors hover:bg-black/5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

export function useToast(): (message: string, type?: ToastType) => void {
  const ctx = useContext(Ctx);
  return ctx?.push ?? (() => {});
}
