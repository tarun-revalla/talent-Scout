# Talent Scout — Product Overview

Talent Scout is an AI-powered hiring assistant that automates resume screening, candidate outreach, interview scheduling, and panel feedback — so recruiters spend time deciding, not coordinating.

**Try it now:** [Open Talent Scout → Jobs](https://talent-scout-yext.vercel.app/jobs)

---

## What it does (in plain language)

| Stage | Without Talent Scout | With Talent Scout |
|---|---|---|
| **Sourcing review** | Read dozens of resumes by hand | Upload PDFs/CSVs; AI ranks candidates with explanations |
| **Outreach** | Write and send emails one by one | Personalised emails at scale; smart follow-ups when candidates reply |
| **Interest scoring** | Guess from inbox threads | Match score + interest score on every candidate |
| **Interviews** | Email ping-pong for calendars | Pick overlapping slots; candidates confirm via link; Slack buttons for panel |
| **Feedback** | Chase interviewers over Slack/email | Scorecard links on Pass; panel consensus surfaced automatically |
| **Final decision** | Spreadsheet compare | Side-by-side Compare view with adjustable weights + export |

---

## Who it's for

Recruiters and hiring managers running **active reqs** who already have candidates in hand (PDFs, spreadsheets, referrals). Talent Scout is not a job board — it handles everything **after** resumes arrive.

---

## Try the live MVP

👉 **[https://talent-scout-yext.vercel.app/jobs](https://talent-scout-yext.vercel.app/jobs)**

Suggested walkthrough:

1. Open **Jobs** and create or open a job (paste a JD → Parse → Save).
2. Go to **Candidates** and upload a few resumes.
3. On the job page, click **Find Matches** and review ranked results.
4. Select candidates → **Engage** to queue outreach (requires worker + Gmail configured).
5. Start an interview loop, schedule a round, and explore Compare / Analytics.

Some features (email send, Slack DMs, scorecards) depend on background services being running — see [Hosting](#how-its-hosted) below.

---

## Productivity & cost (why it's worth it)

### Time saved — example per job (~50–80 candidates)

| Task | Typical manual time | With Talent Scout | Saved |
|---|---|---|---|
| Resume screening | 6–10 hours | ~30 min | **5–9 hrs** |
| Initial outreach (15 candidates) | 2–3 hours | ~15 min | **~2 hrs** |
| Follow-up chasing | 4–6 hours | Automated | **4–6 hrs** |
| Scheduling (multi-round panel) | 3–5 hours | ~45 min | **2–4 hrs** |
| Collecting scorecards | 2–4 hours | ~20 min | **2–3 hrs** |
| Finalist comparison | 1–2 hours | ~15 min | **~1 hr** |

**Rough total: 16–25 recruiter-hours saved per hire pipeline.**

At ~$45/hr loaded recruiter cost, that's **~$720–$1,125 of time back per job** — before faster time-to-hire or fewer dropped candidates.

A team with **4 open reqs** might recover **60–100 hours/month** — about **1.5–2.5 person-weeks** redirected to closing candidates instead of admin work.

### What it costs to run (MVP scale)

| Item | Approx. monthly |
|---|---|
| Vercel (web app) | $0–$20 |
| Railway (background worker) | ~$5–$15 |
| Supabase (database + files) | $0–$25 |
| OpenAI (LLM + embeddings) | ~$15–$60 |
| Gmail + Slack | $0 (existing accounts) |

**LLM cost per job is usually a few dollars** — far less than one hour of recruiter time. Usage is tracked in-app (Analytics → cost view).

---

## How it's hosted

```
You (browser)
    ↓
Vercel  —  website + API  (what you click at the link above)
    ↓
Supabase  —  database, files, live updates
    ↑
Railway  —  background worker  (emails, replies, Slack, queue jobs)
```

### Why this split?

| Platform | Role | Why we chose it |
|---|---|---|
| **Vercel** | Next.js app recruiters use | Built for Next.js; deploys on git push; scales API routes on demand; no server to manage |
| **Railway** | Always-on worker | Email + inbox polling + queue processing need a long-running process — Vercel functions time out |
| **Supabase** | Postgres + storage + realtime | One database both services share; live UI updates when emails arrive or scores change |

Production URL: [talent-scout-git-main-tarun-revallas-projects.vercel.app](https://talent-scout-yext.vercel.app/jobs)

If the **Railway worker** is stopped, the UI still works but emails, Slack messages, and queue jobs won't process until it's back up.

---

## Security & guardrails (read this before a wide rollout)

### No login — by design for this MVP

**There is no user authentication in this preview.** Anyone with the URL can use the recruiter UI. We shipped this way to validate the workflow quickly during the hackathon/MVP phase.

**If the pilot succeeds, the plan is to integrate into Talent Hub**, which would add:

- Corporate SSO / identity
- Role-based access (recruiter vs hiring manager vs admin)
- Org-scoped data and audit trails
- Retiring the open, unauthenticated admin surface

Until then, **treat this deployment as an internal preview**, not a public HR system.

### What is protected today

- **Candidate & interviewer links** use one-time-style opaque tokens (schedule, scorecard, apply) — no account needed for those flows only.
- **Slack button clicks** are cryptographically verified (signing secret).
- **Resume files** use signed URLs, not permanent public links.
- **Database admin keys** never ship to the browser.

### Before going beyond a trusted pilot

- Restrict access (VPN, IP allowlist, or Vercel access control).
- Rotate API keys and Gmail/Slack tokens regularly.
- Integrate with Talent Hub auth when ready for production HR use.

Technical detail: [TECHDETAILS.md — Security & Guardrails](./TECHDETAILS.md#security--guardrails)

---

## Roadmap (if we integrate into Talent Hub)

1. **Auth & tenancy** — SSO, roles, per-org data isolation
2. **Talent Hub embedding** — single sign-on, shared candidate records where appropriate
3. **Compliance** — retention policies, export/delete, audit logs
4. **Hardening** — rate limits, monitoring, staging vs production separation

---

## Questions?

| Audience | Document |
|---|---|
| Recruiters / PMs | This file + [README.md](./README.md) |
| Engineers / DevOps | [TECHDETAILS.md](./TECHDETAILS.md) |

**Live app:** [https://talent-scout-yext.vercel.app/jobs](https://talent-scout-yext.vercel.app/jobs)
