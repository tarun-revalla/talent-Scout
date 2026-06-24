"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, FileText, Loader2 } from "lucide-react";
import { InterviewRoundsModal } from "@/components/InterviewRoundsModal";
import { JobCreationStepper } from "@/components/JobCreationStepper";
import { JdEditor } from "@/components/JdEditor";
import { JobFeatureCards } from "@/components/JobFeatureCards";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { InterviewRound, ParsedJD } from "@/lib/schemas";

const SAMPLE_JD = `Senior Backend Engineer

We're looking for a Senior Backend Engineer (5+ years) to join our platform team and own services that power our multi-tenant SaaS product.

Required skills: TypeScript or Go, PostgreSQL, AWS, distributed systems experience.
Nice to have: GraphQL, Kafka or other event streaming, Terraform/IaC.

You will: design service APIs, mentor mid-level engineers, drive reliability/observability work, and partner with product on roadmap.

Compensation: $160k-$210k base + equity. Remote-first within US/EU time zones.`;

type Step = "jd" | "rounds" | "match";

function stepNumber(step: Step): 1 | 2 | 3 {
  if (step === "jd") return 1;
  if (step === "rounds") return 2;
  return 3;
}

export default function NewJobPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>("jd");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedJD | null>(null);
  const [suggestedRounds, setSuggestedRounds] = useState<InterviewRound[]>([]);
  const [rationale, setRationale] = useState<string>("");
  const [coolingMonths, setCoolingMonths] = useState(6);

  async function parseAndContinue() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/parse-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw_jd: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Parse failed");
      setParsed(json.parsed);
      setSuggestedRounds(json.suggested_rounds ?? []);
      setRationale(json.rationale ?? "");
      setCoolingMonths(json.default_cooling_months ?? 6);
      setStep("rounds");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function createJob(
    rounds: InterviewRound[],
    cooling: number,
    hiresTarget: number,
  ) {
    setStep("match");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          raw_jd: text,
          parsed_jd: parsed,
          interview_rounds: rounds,
          cooling_period_months: cooling,
          hires_target: hiresTarget,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      router.push(`/jobs/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("rounds");
      setBusy(false);
    }
  }

  const editorDisabled = step !== "jd" || busy;

  return (
    <>
    <PageShell mainClassName="mx-auto max-w-3xl space-y-8">
        <JobCreationStepper
          currentStep={stepNumber(step)}
          onStepClick={(s) => {
            if (s === 1 && step !== "jd" && !busy) setStep("jd");
            if (s === 2 && step === "match") {
              setStep("rounds");
              setBusy(false);
            }
          }}
        />

        <PageHeader
          eyebrow="Create"
          title="New job"
          description="Paste a job description, configure interview rounds, then match against your candidate pool."
        />

        <section className="space-y-4">
          <JdEditor
            value={text}
            onChange={setText}
            disabled={editorDisabled}
            placeholder="Paste your JD here…"
          />

          {step === "jd" && (
            <div className="flex flex-wrap items-center gap-4">
              <Button
                onClick={() => void parseAndContinue()}
                disabled={busy || text.trim().length < 50}
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Parsing JD…
                  </>
                ) : (
                  <>
                    Next: interview rounds
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setText(SAMPLE_JD)}
                disabled={busy}
              >
                <FileText className="w-4 h-4" />
                Use sample JD
              </Button>
            </div>
          )}

          {step === "match" && (
            <Alert variant="info">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Creating job and matching candidates…
              </span>
            </Alert>
          )}

          {error && <Alert variant="error">{error}</Alert>}
        </section>

        {step === "jd" && <JobFeatureCards />}
    </PageShell>

      {step === "rounds" && parsed && (
        <InterviewRoundsModal
          jobTitle={parsed.title}
          rationale={rationale}
          initialRounds={suggestedRounds}
          initialCoolingMonths={coolingMonths}
          busy={busy}
          onClose={() => setStep("jd")}
          onConfirm={(rounds, cooling, hires) => void createJob(rounds, cooling, hires)}
        />
      )}
    </>
  );
}
