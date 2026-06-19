import type { ParsedProfile } from "../schemas";

type AnyObj = Record<string, unknown>;

function s(v: unknown): string | null {
  if (v == null) return null;
  const str = String(v).trim();
  return str.length ? str : null;
}

function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    return v
      .split(/[,;|\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

/** Normalize a LinkedIn-style profile object into our ParsedProfile shape. */
export function profileFromJson(o: AnyObj): ParsedProfile | null {
  const composed =
    [s(o.first_name) ?? s(o.firstName), s(o.last_name) ?? s(o.lastName)]
      .filter(Boolean)
      .join(" ") || null;
  const name =
    s(o.name) ?? s(o.full_name) ?? s(o.fullName) ?? composed;
  const email = s(o.email) ?? s(o.email_address) ?? s(o.emailAddress);

  const positions = (o.positions ?? o.experience ?? []) as AnyObj[];
  const experience = Array.isArray(positions)
    ? positions.map((p) => ({
        company: s(p.company) ?? s(p.companyName) ?? s(p.company_name) ?? "",
        title: s(p.title) ?? s(p.role) ?? s(p.position) ?? "",
        start: s(p.start) ?? s(p.startDate) ?? s(p.start_date),
        end: s(p.end) ?? s(p.endDate) ?? s(p.end_date),
        description: s(p.description) ?? s(p.summary),
      }))
    : [];

  const education = (() => {
    const eds = (o.education ?? []) as unknown;
    if (Array.isArray(eds)) {
      return eds
        .map((e) => {
          if (typeof e === "string") return e;
          const obj = e as AnyObj;
          return [s(obj.degree), s(obj.school) ?? s(obj.institution)]
            .filter(Boolean)
            .join(" — ");
        })
        .filter(Boolean) as string[];
    }
    if (typeof eds === "string") return [eds];
    return [];
  })();

  const summary = s(o.summary) ?? s(o.headline) ?? s(o.bio) ?? s(o.about) ?? "";

  if (!email && !name) return null;

  return {
    name,
    email,
    phone: s(o.phone) ?? s(o.phone_number),
    location: s(o.location) ?? s(o.city) ?? s(o.country),
    years: n(o.years) ?? n(o.yoe) ?? n(o.years_of_experience),
    skills: arr(o.skills),
    experience,
    education,
    summary,
  };
}

export function jsonToProfiles(text: string): ParsedProfile[] {
  // Accept JSON array or NDJSON.
  const trimmed = text.trim();
  let items: unknown[];
  if (trimmed.startsWith("[")) {
    items = JSON.parse(trimmed);
  } else if (trimmed.startsWith("{") && !trimmed.includes("\n{")) {
    items = [JSON.parse(trimmed)];
  } else {
    items = trimmed
      .split(/\r?\n+/)
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l));
  }
  return items
    .filter((x): x is AnyObj => x != null && typeof x === "object")
    .map(profileFromJson)
    .filter((p): p is ParsedProfile => p !== null);
}
