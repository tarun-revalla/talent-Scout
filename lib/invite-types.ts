export type InviteEventType = "open" | "started" | "completed";

export interface InviteAnalytics {
  uniqueOpens: number;
  uniqueStarted: number;
  uniqueCompleted: number;
  applicants: number;
  totalOpens: number;
}

export interface PublicJobPayload {
  title: string;
  status: string;
  inviteEnabled: boolean;
  acceptingApplications: boolean;
  parsedJd: {
    title: string;
    level: string;
    must_have_skills: string[];
    nice_to_have_skills: string[];
    years_min: number | null;
    location: string | null;
    remote: string;
    salary_range: {
      min: number | null;
      max: number | null;
      currency: string | null;
    };
    responsibilities: string[];
    summary: string;
  };
  rawJd: string;
}
