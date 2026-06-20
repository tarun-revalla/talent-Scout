"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Download, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
  created: Array<{ name: string; email: string }>;
}

interface BulkImportProps {
  jobId: string;
  onImportSuccess?: (result: ImportResult) => void;
}

export function BulkInterviewerImport({ jobId, onImportSuccess }: BulkImportProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvContent, setCsvContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handlePasteCSV = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const content = e.clipboardData.getData("text");
    setCsvContent(content);
    setResult(null);
  };

  const handleImport = useCallback(async () => {
    if (!csvContent.trim()) {
      toast("Please paste or upload CSV content", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/interviewers/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, csvContent }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast(`Import failed: ${json.error}`, "error");
        return;
      }

      setResult(json);
      onImportSuccess?.(json);

      if (json.success > 0) {
        toast(`Successfully imported ${json.success} interviewer${json.success !== 1 ? "s" : ""}!`, "success");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast(`Error: ${msg}`, "error");
    } finally {
      setLoading(false);
    }
  }, [csvContent, jobId, toast, onImportSuccess]);

  const downloadTemplate = () => {
    const template =
      "name,email,timezone,roundIndex,bufferMinutes\n" +
      "Alice Johnson,alice@example.com,America/New_York,0,15\n" +
      "Bob Smith,bob@example.com,America/Los_Angeles,1,15\n" +
      "Carol White,carol@example.com,America/Chicago,,15";

    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interviewers-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Template Section */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="font-semibold">CSV Format</h3>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Download size={14} />
            Download Template
          </button>
        </div>
        <div className="space-y-2 text-sm font-mono text-slate-700">
          <div>name,email,timezone,roundIndex,bufferMinutes</div>
          <div className="text-slate-600">
            Alice Johnson,alice@example.com,America/New_York,0,15
          </div>
          <div className="text-slate-600">
            Bob Smith,bob@example.com,America/Los_Angeles,1,15
          </div>
        </div>
        <div className="mt-3 space-y-1 text-xs text-slate-600">
          <p>
            <span className="font-semibold">name</span> — Interviewer name (required)
          </p>
          <p>
            <span className="font-semibold">email</span> — Email address (required, calendar auto-detected)
          </p>
          <p>
            <span className="font-semibold">timezone</span> — Timezone (optional, e.g., America/New_York; auto-detected from calendar if omitted)
          </p>
          <p>
            <span className="font-semibold">roundIndex</span> — Interview round (0-indexed; optional)
          </p>
          <p>
            <span className="font-semibold">bufferMinutes</span> — Minutes buffer between interviews (optional, default 15)
          </p>
        </div>
      </div>

      {/* Input Section */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-semibold">Paste CSV or Upload File</label>
          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            onPaste={handlePasteCSV}
            placeholder="Paste CSV content here..."
            rows={6}
            className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1"
          >
            <Upload size={14} />
            Choose File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            onClick={handleImport}
            disabled={!csvContent.trim() || loading}
            className="gap-1"
          >
            {loading ? "Importing..." : "Import"}
          </Button>
        </div>
      </div>

      {/* Results Section */}
      {result && (
        <div className="space-y-3">
          {result.success > 0 && (
            <Alert variant="success" className="flex items-start gap-2">
              <Check size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <strong>Imported {result.success} interviewer{result.success !== 1 ? "s" : ""}:</strong>
                <ul className="mt-2 space-y-1 text-sm">
                  {result.created.map((c, i) => (
                    <li key={i}>
                      {c.name} ({c.email})
                    </li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}

          {result.failed > 0 && (
            <Alert variant="warning" className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <strong>{result.failed} row{result.failed !== 1 ? "s" : ""} failed:</strong>
                <ul className="mt-2 space-y-1 text-sm">
                  {result.errors.map((err, i) => (
                    <li key={i}>
                      Row {err.row}: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
