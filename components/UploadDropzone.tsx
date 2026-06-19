"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { Alert } from "./ui/Alert";
import { cn } from "@/lib/cn";

interface IngestResult {
  created: number;
  skipped: number;
  errors: { name: string; error: string }[];
  duplicates?: import("./DuplicatesModal").DuplicatePair[];
}

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB cap per file

export function UploadDropzone({
  onComplete,
  variant = "default",
}: {
  onComplete?: (r: IngestResult) => void;
  variant?: "default" | "dashboard";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const fd = new FormData();
        const skippedTooLarge: string[] = [];
        for (const f of Array.from(files)) {
          if (f.size > MAX_FILE_BYTES) {
            skippedTooLarge.push(`${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
            continue;
          }
          fd.append("files", f);
        }
        if (!fd.has("files")) {
          throw new Error(
            skippedTooLarge.length
              ? `All files exceed the 20MB cap: ${skippedTooLarge.join(", ")}`
              : "No files selected",
          );
        }
        const res = await fetch("/api/candidates/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        if (skippedTooLarge.length) {
          json.errors = [
            ...(json.errors ?? []),
            ...skippedTooLarge.map((n) => ({ name: n, error: "Skipped — exceeds 20MB cap" })),
          ];
        }
        setResult(json);
        onComplete?.(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setBusy(false);
      }
    },
    [onComplete],
  );

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className={cn(
          "group block w-full cursor-pointer rounded-2xl border-2 border-dashed text-center transition-all duration-200",
          variant === "dashboard"
            ? "flex min-h-[220px] flex-col items-center justify-center bg-white px-6 py-10 shadow-card sm:min-h-[260px]"
            : "p-10",
          drag
            ? "border-cobalt-500 bg-cobalt-50/40 shadow-glow"
            : variant === "dashboard"
              ? "border-cobalt-200 hover:border-cobalt-400 hover:bg-slate-50/80"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50",
          busy && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.csv,.json,.ndjson,.zip"
          className="hidden"
          disabled={busy}
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        {busy ? (
          <div className="flex items-center justify-center gap-2 text-slate-700">
            <Loader2 className="w-4 h-4 animate-spin" /> Parsing &amp; embedding…
          </div>
        ) : variant === "dashboard" ? (
          <>
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cobalt-50 to-cobalt-100 transition-transform duration-200 group-hover:scale-105">
              <UploadCloud className="h-11 w-11 text-cobalt-600" strokeWidth={1.5} />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              Drop PDFs, CSV, JSON or a ZIP
            </h3>
            <p className="text-sm text-slate-500">
              We&apos;ll parse, embed and auto-match against open jobs • 20 MB max per file
            </p>
            <span className="mt-6 text-sm font-semibold text-cobalt-600">
              Or browse files on your computer
            </span>
          </>
        ) : (
          <>
            <UploadCloud className="w-9 h-9 mx-auto mb-3 text-slate-400" />
            <div className="text-slate-900 font-medium">
              Drop PDFs, CSV, JSON or a ZIP
            </div>
            <div className="text-xs text-slate-500 mt-1">
              We&apos;ll parse, embed and auto-match against open jobs · 20 MB max per file
            </div>
          </>
        )}
      </label>

      {result && (
        <Alert variant="success" className="mt-4">
          Created {result.created} · skipped {result.skipped} · errors {result.errors.length}
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {result.errors.map((e, i) => (
                <li key={i} className="break-words">
                  <strong>{e.name}:</strong> {e.error}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}
    </div>
  );
}
