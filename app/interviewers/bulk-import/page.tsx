"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BulkInterviewerImport } from "@/components/BulkInterviewerImport";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function BulkImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId") ?? "";
  const [importComplete, setImportComplete] = useState(false);

  const handleImportSuccess = useCallback(() => {
    setImportComplete(true);
    // Auto-redirect after a short delay
    setTimeout(() => {
      if (jobId) {
        router.push(`/jobs/${jobId}`);
      } else {
        router.push("/interviewers");
      }
    }, 2000);
  }, [jobId, router]);

  return (
    <PageShell>
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded p-2 hover:bg-slate-100"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <PageHeader
            title="Bulk Import Interviewers"
            description="Upload a CSV file to quickly add multiple interviewers"
            className="mb-0"
          />
        </div>

        {importComplete && (
          <Alert variant="success">
            Import complete! Redirecting...
          </Alert>
        )}

        {!importComplete && jobId && (
          <BulkInterviewerImport
            jobId={jobId}
            onImportSuccess={handleImportSuccess}
          />
        )}

        {!jobId && (
          <Alert variant="warning">
            No job selected. Please provide a jobId query parameter.
          </Alert>
        )}
      </div>
    </PageShell>
  );
}
