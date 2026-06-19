import Papa from "papaparse";
import type { ParsedProfile } from "../schemas";

const FIELD_ALIASES: Record<keyof ParsedProfile | "first_name" | "last_name", string[]> = {
  name: ["name", "fullname", "full_name", "candidate_name"],
  email: ["email", "email_address", "e-mail", "mail"],
  phone: ["phone", "phone_number", "mobile", "tel"],
  location: ["location", "city", "country", "based_in"],
  years: ["years", "yoe", "years_of_experience", "experience_years", "exp"],
  skills: ["skills", "tech_stack", "technologies", "tools"],
  summary: ["summary", "bio", "about", "profile", "headline"],
  experience: ["experience"],
  education: ["education", "degree"],
  first_name: ["first_name", "firstname", "fname", "given_name"],
  last_name: ["last_name", "lastname", "lname", "surname", "family_name"],
};

function pick(row: Record<string, unknown>, keys: string[]): string | null {
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]),
  );
  for (const k of keys) {
    const v = lower[k];
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return null;
}

function parseSkills(s: string | null): string[] {
  if (!s) return [];
  return s
    .split(/[,;|\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseYears(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function csvToProfiles(csvText: string): ParsedProfile[] {
  const result = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data
    .map((row): ParsedProfile | null => {
      const first = pick(row, FIELD_ALIASES.first_name);
      const last = pick(row, FIELD_ALIASES.last_name);
      const composedName =
        first || last ? [first, last].filter(Boolean).join(" ") : null;
      const name = pick(row, FIELD_ALIASES.name) ?? composedName;
      const email = pick(row, FIELD_ALIASES.email);
      if (!email && !name) return null; // empty row
      return {
        name,
        email,
        phone: pick(row, FIELD_ALIASES.phone),
        location: pick(row, FIELD_ALIASES.location),
        years: parseYears(pick(row, FIELD_ALIASES.years)),
        skills: parseSkills(pick(row, FIELD_ALIASES.skills)),
        experience: [],
        education: pick(row, FIELD_ALIASES.education)
          ? [pick(row, FIELD_ALIASES.education)!]
          : [],
        summary: pick(row, FIELD_ALIASES.summary) ?? "",
      };
    })
    .filter((p): p is ParsedProfile => p !== null);
}
