type JobDisplayFields = {
  location: string | null;
  remote: string;
  salary_range: {
    min: number | null;
    max: number | null;
    currency: string | null;
  };
};

export function formatJobLocation(
  parsed: JobDisplayFields | null | undefined,
): string | null {
  if (!parsed) return null;
  if (parsed.location?.trim()) return parsed.location.trim();
  if (parsed.remote === "remote") return "Remote";
  if (parsed.remote === "hybrid") return "Hybrid";
  if (parsed.remote === "onsite") return "On-site";
  return null;
}

export function formatJobSalary(
  parsed: JobDisplayFields | null | undefined,
): string | null {
  const range = parsed?.salary_range;
  if (!range || range.min == null) return null;
  const sym =
    !range.currency || range.currency === "USD" || range.currency === "$"
      ? "$"
      : range.currency;
  const max = range.max ?? range.min;
  const fmt = (n: number) =>
    n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n.toLocaleString()}`;
  return `${fmt(range.min)} - ${fmt(max)}`;
}
