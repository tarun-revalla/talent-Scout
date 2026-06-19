import { BarChart3, BrainCircuit, Users } from "lucide-react";

const FEATURES = [
  {
    title: "AI Extraction",
    description:
      "We'll automatically identify core skills, years of experience, and cultural requirements from your text.",
    icon: BrainCircuit,
    iconClass: "text-cobalt-600 bg-cobalt-50",
  },
  {
    title: "Instant Matching",
    description:
      "See a preliminary list of candidates from your internal database who fit this role's profile instantly.",
    icon: Users,
    iconClass: "text-amber-600 bg-amber-50",
  },
  {
    title: "Market Insights",
    description:
      "Get data on salary benchmarks and talent availability for the roles defined in your job description.",
    icon: BarChart3,
    iconClass: "text-sky-600 bg-sky-50",
  },
] as const;

export function JobFeatureCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {FEATURES.map((f) => (
        <div
          key={f.title}
          className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 space-y-3"
        >
          <span
            className={`inline-flex w-10 h-10 rounded-lg items-center justify-center ${f.iconClass}`}
          >
            <f.icon className="w-5 h-5" strokeWidth={1.75} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{f.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed mt-1.5">{f.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
