"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "./Button";

export type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

type PendingConfirm = ConfirmOptions & {
  message: string;
  resolve: (value: boolean) => void;
};

const ConfirmCtx = createContext<
  ((message: string, options?: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setPending({ message, ...options, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  const isDanger = pending?.variant === "danger";

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {pending && (
          <>
            <motion.button
              type="button"
              aria-label="Cancel"
              className="fixed inset-0 z-[70] bg-slate-900/30 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => close(false)}
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-desc"
              className="fixed left-1/2 top-1/2 z-[71] w-[min(100%-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2
                id="confirm-dialog-title"
                className="text-base font-semibold text-slate-900"
              >
                {pending.title ?? "Confirm"}
              </h2>
              <p id="confirm-dialog-desc" className="mt-2 text-sm leading-relaxed text-slate-600">
                {pending.message}
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => close(false)}>
                  {pending.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  variant={isDanger ? "danger" : "primary"}
                  size="sm"
                  onClick={() => close(true)}
                >
                  {pending.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
}
