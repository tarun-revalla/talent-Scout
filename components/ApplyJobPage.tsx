"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  Loader2,
  MapPin,
  Sparkles,
  Upload,
  Wallet,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { APP_NAME, BRAND } from "@/lib/brand";
import { formatJobLocation, formatJobSalary } from "@/lib/job-display";
import { getOrCreateVisitorId } from "@/lib/invite-visitor";
import type { PublicJobPayload } from "@/lib/invite-types";

interface ApplyJobPageProps {
  token: string;
}

function trackEvent(token: string, event: "open" | "started" | "completed") {
  const visitorId = getOrCreateVisitorId();
  void fetch(`/api/apply/${token}/track`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visitorId, event }),
  });
}

function LevelPill({ level }: { level: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-cobalt-50 px-3 py-1 text-xs font-semibold capitalize text-cobalt-700 ring-1 ring-cobalt-100">
      {level.replace("_", " ")}
    </span>
  );
}

export function ApplyJobPage({ token }: ApplyJobPageProps) {
  const [job, setJob] = useState<PublicJobPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const startedTracked = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/apply/${token}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load job");
        if (!cancelled) {
          setJob(json.job);
          trackEvent(token, "open");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const markStarted = useCallback(() => {
    if (startedTracked.current) return;
    startedTracked.current = true;
    trackEvent(token, "started");
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!job?.acceptingApplications || !resumeFile) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("email", email);
      fd.set("phone", phone);
      fd.set("linkedin", linkedin);
      fd.set("coverNote", coverNote);
      fd.set("resume", resumeFile);
      fd.set("visitorId", getOrCreateVisitorId());
      const res = await fetch(`/api/apply/${token}/submit`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-cobalt-50/40">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-cobalt-600" />
          <p className="text-sm font-medium">Loading role…</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <BrandLogo size={40} className="mb-6 opacity-60" />
        <h1 className="text-2xl font-bold text-slate-900">Link not found</h1>
        <p className="mt-2 max-w-md text-slate-500">
          This application link is invalid or has expired. Check with the recruiter for an updated
          link.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50/80 via-white to-cobalt-50/30 px-6 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-lg shadow-emerald-100/80">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Application received</h1>
        <p className="mt-3 max-w-md text-slate-600 leading-relaxed">
          Thanks for applying to <span className="font-semibold text-slate-800">{job.title}</span>.
          Our team will review your profile and reach out if there&apos;s a fit.
        </p>
        <p className="mt-8 text-xs text-slate-400">Powered by {APP_NAME}</p>
      </div>
    );
  }

  const location = formatJobLocation(job.parsedJd);
  const salary = formatJobSalary(job.parsedJd);
  const skills = [
    ...job.parsedJd.must_have_skills,
    ...job.parsedJd.nice_to_have_skills,
  ];

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-40" aria-hidden>
        <div className="absolute -left-20 top-0 h-96 w-96 rounded-full bg-cobalt-200 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-200 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 h-48 w-48 rounded-full bg-amber-100 blur-3xl" />
      </div>

      <header className="relative border-b border-white/60 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo size={28} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cobalt-600">
                Apply now
              </p>
              <p className="text-sm font-semibold text-slate-800">{APP_NAME}</p>
            </div>
          </div>
          {!job.acceptingApplications && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Applications closed
            </span>
          )}
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-5 lg:gap-12">
          {/* JD panel */}
          <section className="lg:col-span-2 lg:sticky lg:top-8 lg:self-start space-y-6">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <LevelPill level={job.parsedJd.level} />
                {job.parsedJd.remote !== "unspecified" && (
                  <span className="text-xs font-medium capitalize text-slate-500">
                    {job.parsedJd.remote}
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {job.title}
              </h1>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              {location && (
                <div className="flex items-center gap-2 text-slate-600">
                  <MapPin className="h-4 w-4 shrink-0 text-cobalt-500" />
                  {location}
                </div>
              )}
              {job.parsedJd.years_min != null && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Briefcase className="h-4 w-4 shrink-0 text-cobalt-500" />
                  {job.parsedJd.years_min}+ years
                </div>
              )}
              {salary && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Wallet className="h-4 w-4 shrink-0 text-cobalt-500" />
                  {salary}
                </div>
              )}
            </div>

            {job.parsedJd.summary && (
              <p className="text-slate-600 leading-relaxed">{job.parsedJd.summary}</p>
            )}

            {skills.length > 0 && (
              <div>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Key skills
                </h2>
                <div className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200/80"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {job.parsedJd.responsibilities.length > 0 && (
              <div>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Responsibilities
                </h2>
                <ul className="space-y-2 text-sm text-slate-600">
                  {job.parsedJd.responsibilities.map((r) => (
                    <li key={r} className="flex gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <details className="group rounded-xl bg-white/80 ring-1 ring-slate-200/80">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-cobalt-700">
                View full job description
              </summary>
              <div className="border-t border-slate-100 px-4 py-4 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {job.rawJd}
              </div>
            </details>
          </section>

          {/* Form panel */}
          <section className="lg:col-span-3">
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl shadow-cobalt-900/5 ring-1 ring-slate-200/80">
              <div className="border-b border-slate-100 bg-gradient-to-r from-cobalt-600 to-cobalt-700 px-6 py-5 text-white">
                <h2 className="text-xl font-bold">Submit your application</h2>
                <p className="mt-1 text-sm text-cobalt-100">
                  Fill in your details and upload your resume — we&apos;ll handle the rest.
                </p>
              </div>

              {!job.acceptingApplications ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-lg font-semibold text-slate-800">
                    This role is no longer accepting applications
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {job.status === "closed"
                      ? "The position has been filled or closed."
                      : "Applications via this link are currently disabled."}
                  </p>
                </div>
              ) : (
                <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 p-6 sm:p-8">
                  {formError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {formError}
                    </div>
                  )}

                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Full name <span className="text-red-500">*</span>
                      </span>
                      <input
                        required
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onFocus={markStarted}
                        placeholder="Jane Doe"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cobalt-400 focus:ring-2 focus:ring-cobalt-500/20"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Email <span className="text-red-500">*</span>
                      </span>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={markStarted}
                        placeholder="jane@example.com"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cobalt-400 focus:ring-2 focus:ring-cobalt-500/20"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Phone
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onFocus={markStarted}
                        placeholder="+1 (555) 000-0000"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cobalt-400 focus:ring-2 focus:ring-cobalt-500/20"
                      />
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                        LinkedIn URL <span className="text-red-500">*</span>
                      </span>
                      <input
                        required
                        type="url"
                        value={linkedin}
                        onChange={(e) => setLinkedin(e.target.value)}
                        onFocus={markStarted}
                        placeholder="https://linkedin.com/in/yourname"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cobalt-400 focus:ring-2 focus:ring-cobalt-500/20"
                      />
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Why are you interested? <span className="font-normal text-slate-400">(optional)</span>
                      </span>
                      <textarea
                        rows={3}
                        value={coverNote}
                        onChange={(e) => setCoverNote(e.target.value)}
                        onFocus={markStarted}
                        placeholder="A few sentences about what draws you to this role…"
                        className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cobalt-400 focus:ring-2 focus:ring-cobalt-500/20"
                      />
                    </label>
                  </div>

                  <div>
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      Resume (PDF) <span className="text-red-500">*</span>
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        markStarted();
                        const f = e.target.files?.[0] ?? null;
                        setResumeFile(f);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition ${
                        resumeFile
                          ? "border-emerald-300 bg-emerald-50/50"
                          : "border-slate-200 bg-slate-50/50 hover:border-cobalt-300 hover:bg-cobalt-50/30"
                      }`}
                    >
                      {resumeFile ? (
                        <>
                          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                          <span className="text-sm font-semibold text-slate-800">{resumeFile.name}</span>
                          <span className="text-xs text-slate-500">Click to replace</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-cobalt-400" />
                          <span className="text-sm font-semibold text-slate-700">
                            Drop your resume or click to browse
                          </span>
                          <span className="text-xs text-slate-400">PDF only · max 20 MB</span>
                        </>
                      )}
                    </button>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={submitting || !resumeFile || !linkedin.trim()}
                    className="w-full"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      "Submit application"
                    )}
                  </Button>

                  <p className="text-center text-xs text-slate-400">
                    By applying, you agree to your information being processed for recruitment
                    purposes.
                  </p>
                </form>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="relative border-t border-slate-200/60 py-6 text-center text-xs text-slate-400">
        Powered by{" "}
        <span className="font-semibold" style={{ color: BRAND.colors.primary }}>
          {APP_NAME}
        </span>
      </footer>
    </div>
  );
}
