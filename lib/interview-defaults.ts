import type { InterviewRound, ParsedJD } from "./schemas";

/** Fallback round loop when LLM suggestion is unavailable or job has no rounds yet. */
export function defaultRoundsForLevel(level: ParsedJD["level"]): InterviewRound[] {
  const base: InterviewRound[] = [
    {
      order: 1,
      name: "Recruiter screen",
      type: "phone_screen",
      duration_minutes: 30,
      description: "Role fit, motivation, and logistics.",
      interviewer_role: "Recruiter",
    },
    {
      order: 2,
      name: "Technical interview",
      type: "technical",
      duration_minutes: 60,
      description: "Core skills assessment.",
      interviewer_role: "Engineer",
    },
    {
      order: 3,
      name: "Hiring manager",
      type: "hiring_manager",
      duration_minutes: 45,
      description: "Team fit and career alignment.",
      interviewer_role: "Hiring manager",
    },
  ];
  if (level === "senior" || level === "lead" || level === "principal") {
    base.splice(2, 0, {
      order: 2,
      name: "System design",
      type: "system_design",
      duration_minutes: 60,
      description: "Architecture and trade-off discussion.",
      interviewer_role: "Staff engineer",
    });
    return base.map((r, i) => ({ ...r, order: i + 1 }));
  }
  return base;
}
