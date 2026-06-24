"use client";

const STEPS = [
  { id: 1, label: "Job Description" },
  { id: 2, label: "Interview Rounds" },
  { id: 3, label: "Candidate Match" },
] as const;

export function JobCreationStepper({
  currentStep,
  onStepClick,
}: {
  currentStep: 1 | 2 | 3;
  onStepClick?: (step: 1 | 2 | 3) => void;
}) {
  return (
    <nav aria-label="Job creation progress" className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => {
        const done = step.id < currentStep;
        const active = step.id === currentStep;
        const clickable = Boolean(onStepClick && done);
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5 min-w-[88px] sm:min-w-[120px]">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick!(step.id as 1 | 2 | 3)}
                  className={`inline-flex w-8 h-8 items-center justify-center rounded-full text-sm font-semibold transition-colors bg-cobalt-100 text-cobalt-700 hover:bg-cobalt-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-500/40`}
                  aria-label={`Go back to ${step.label}`}
                >
                  {step.id}
                </button>
              ) : (
                <span
                  className={`inline-flex w-8 h-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    active
                      ? "bg-cobalt-600 text-white shadow-sm"
                      : done
                        ? "bg-cobalt-100 text-cobalt-700"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {step.id}
                </span>
              )}
              <span
                className={`text-[11px] sm:text-xs font-medium text-center leading-tight ${
                  active ? "text-cobalt-700" : done ? "text-slate-600" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-10 sm:w-16 h-px mx-1 sm:mx-2 mb-5 ${
                  step.id < currentStep ? "bg-cobalt-300" : "bg-slate-200"
                }`}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
