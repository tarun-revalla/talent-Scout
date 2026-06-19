"use client";

import { motion, AnimatePresence } from "motion/react";
import { Trash2, X } from "lucide-react";
import { Button } from "./ui/Button";

export function BulkActionBar({
  count,
  onClear,
  onBulkDelete,
  busy,
}: {
  count: number;
  onClear: () => void;
  onBulkDelete: () => void;
  busy?: boolean;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="sticky top-16 z-30 border-b border-cobalt-700/20 bg-gradient-to-r from-cobalt-600 to-cobalt-700 text-white shadow-glow"
          role="region"
          aria-label="Bulk actions"
        >
          <div className="mx-auto flex max-w-content flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
            <button
              onClick={onClear}
              aria-label="Clear selection"
              className="rounded-lg p-1.5 transition-colors hover:bg-white/15"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="font-semibold tabular-nums">
              {count} selected
            </span>
            <div className="ml-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={onBulkDelete}
                disabled={busy}
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
