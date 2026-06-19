"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";

export function ViewJDModal({
  title,
  rawJD,
  onClose,
}: {
  title: string;
  rawJD: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <span className="font-medium text-slate-900 truncate">{title}</span>
          <span className="hidden sm:inline text-xs text-slate-500 shrink-0">
            Full job description
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto p-1.5 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">
            {rawJD}
          </pre>
        </div>
      </motion.div>
    </motion.div>
  );
}
