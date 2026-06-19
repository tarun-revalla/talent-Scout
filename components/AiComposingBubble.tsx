"use client";

import { motion } from "motion/react";
import { BrandLogo } from "./BrandLogo";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 h-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-cobalt-500"
          animate={{ y: [0, -3, 0], opacity: [0.45, 1, 0.45] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

export function AiComposingBubble({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex justify-start"
      aria-live="polite"
      aria-label={label}
    >
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-gradient-to-br from-cobalt-50 to-sky-50 border border-cobalt-200/80 px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-cobalt-900">
          <motion.span
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="inline-flex"
          >
            <BrandLogo size={14} />
          </motion.span>
          <span className="font-medium">{label}</span>
          <TypingDots />
        </div>
      </div>
    </motion.div>
  );
}
