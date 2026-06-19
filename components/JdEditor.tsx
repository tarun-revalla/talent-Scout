"use client";

import { useRef } from "react";
import { Bold, Italic, Link2, List } from "lucide-react";

export function JdEditor({
  value,
  onChange,
  disabled,
  placeholder = "Paste your JD here…",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function applyFormat(
    before: string,
    after: string,
    placeholderText = "text",
  ) {
    const el = textareaRef.current;
    if (!el || disabled) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const next =
      value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length + selected.length + after.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function applyList() {
    const el = textareaRef.current;
    if (!el || disabled) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const block = selected || "List item";
    const lines = block.split("\n").map((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith("- ") ? trimmed : `- ${trimmed}`;
    });
    const formatted = lines.join("\n");
    const next = value.slice(0, start) + formatted + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => el.focus());
  }

  function applyLink() {
    applyFormat("[", "](url)", "link text");
  }

  const tools = [
    { icon: Bold, label: "Bold", action: () => applyFormat("**", "**", "bold") },
    { icon: Italic, label: "Italic", action: () => applyFormat("*", "*", "italic") },
    { icon: List, label: "Bullet list", action: applyList },
    { icon: Link2, label: "Link", action: applyLink },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-center gap-0.5">
          {tools.map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              disabled={disabled}
              title={label}
              aria-label={label}
              className="p-2 rounded-md text-slate-500 hover:text-cobalt-700 hover:bg-white disabled:opacity-40 cursor-pointer transition-colors"
            >
              <Icon className="w-4 h-4" strokeWidth={2.25} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            JD Analyzer active
          </span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
          </span>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={16}
        placeholder={placeholder}
        aria-label="Job description"
        className="w-full resize-y min-h-[320px] px-4 py-4 text-sm text-slate-800 leading-relaxed placeholder:text-slate-400 focus:outline-none disabled:opacity-60 disabled:bg-slate-50"
      />
    </div>
  );
}
