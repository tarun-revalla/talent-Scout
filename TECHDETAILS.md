# Talent Scout — Technical Details

This document is for developers setting up, deploying, or extending Talent Scout.

**Stakeholder-friendly overview (try link, ROI, security):** [PRODUCT.md](./PRODUCT.md)

**Live MVP:** [Jobs](https://talent-scout-yext.vercel.app/jobs)

---

## Architecture & Hosting

Talent Scout is a **split-stack MVP**: a serverless web app on **Vercel** and a long-running **worker on Railway**, both talking to the same **Supabase Postgres** database.

**Production example:** `https://talent-scout-yext.vercel.app` (Vercel) + a separate Railway service for the worker.

```
┌─────────────────────────────────────────────────────────────────┐
│  Recruiter browser (React UI)                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Vercel — Next.js 15 (App Router)                               │
│  • React UI pages                                               │
│  • API routes (serverless Node.js functions)                    │
│  • Slack interactive webhook (/api/slack/actions)               │
│  • Public token routes (apply, schedule, scorecard)           │
└────────────────────────────┬────────────────────────────────────┘
                             │ Supabase client (service role)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase                                                       │
│  • Postgres + pgvector                                          │
│  • Realtime (live match/conversation updates)                   │
│  • Storage (resume PDFs)                                        │
│  • outreach_queue table (job queue)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ poll + write
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Railway — Node.js worker (persistent process)                  │
│  • Claims rows from outreach_queue every N seconds              │
│  • Sends email via Gmail API                                    │
│  • Polls Gmail IMAP for inbound replies                         │
│  • OpenAI scoring, parsing, follow-up generation                │
│  • Slack approval + scorecard DMs                               │
└─────────────────────────────────────────────────────────────────┘
```

The two processes share **only Postgres**. The worker does not call the Next.js API.

### Why Vercel for the web app

| Reason | Detail |
|---|---|
| **Next.js-native** | Zero-config deploy for App Router, API routes, and env vars. Fits the hackathon/MVP velocity. |
| **Serverless scaling** | API routes spin up on demand; no idle cost when recruiters aren't clicking. |
| **Edge-friendly static UI** | Pages and assets are CDN-cached globally. |
| **Simple CI** | Push to `main` → automatic preview + production deploy. |

Vercel is **not** used for the worker because serverless functions cannot hold an open IMAP connection, run a 30-second poll loop, or retry queue jobs with backoff for minutes/hours.

### Why Railway for the worker

| Reason | Detail |
|---|---|
| **Always-on process** | The worker must poll `outreach_queue`, maintain IMAP, and throttle Gmail sends — a persistent Node process, not a cron tick. |
| **Long-running tasks OK** | Email send + LLM calls + Slack posts can exceed Vercel's function timeout. |
| **Simple ops** | `railway.json` defines build/start; env vars mirror `.env.local`; restart-on-failure is built in. |
| **Cost predictable at MVP scale** | One small always-on container is cheaper and simpler than wiring separate cron + queue infra on day one. |

### Why Supabase as the shared backend

Postgres is the **single source of truth** and the **message bus** between Vercel and Railway. Realtime subscriptions push queue/match updates to the browser without the worker needing HTTP callbacks. pgvector keeps matching in-database instead of shipping embeddings to a third vector store.

### What runs where (quick reference)

| Component | Host | Notes |
|---|---|---|
| UI + REST API | Vercel | `npm run build` / `next start` |
| Background jobs | Railway | `npm run worker` via `railway.json` |
| Database + Realtime + Storage | Supabase | Migrations in `supabase/migrations/` |
| Outbound email | Gmail API (from worker) | OAuth refresh token |
| Inbound email | Gmail IMAP (from worker) | App password |
| LLM | OpenAI API (web + worker) | Usage logged in `llm_usage` |
| Slack | Slack Web API + interactivity URL on Vercel | Signing secret verified on POST |

The web process is serverless and cannot hold open IMAP connections or run long polling loops. The worker polls `outreach_queue`, sends email, reads replies, calls OpenAI, and writes back to Postgres (Supabase Realtime updates the browser).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Database | Supabase Postgres with pgvector (1536-dim) |
| Realtime | Supabase Realtime subscriptions |
| File storage | Supabase Storage (resume PDFs) |
| LLM (reasoning) | `gpt-4o-2024-11-20` via OpenAI API |
| LLM (fast) | `gpt-4o-mini` via OpenAI API |
| Embeddings | `text-embedding-3-small` via OpenAI API |
| Structured outputs | OpenAI + Zod schemas via `zodResponseFormat` |
| Email outbound | Gmail API over HTTPS |
| Email inbound | imapflow + mailparser (Gmail IMAP) |
| CSV parsing | Papa.parse |
| Worker runtime | Node.js via `tsx` (TypeScript execution) |
| Web deployment | Vercel |
| Worker deployment | Railway |
| Notifications | Slack Bot API |

---

## Environment Variables

Copy `.env.example` to `.env.local` for local development.

```
# OpenAI
OPENAI_API_KEY=sk-...

# Supabase (server-side, never exposed to browser)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Supabase (browser-safe)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Gmail — use a dedicated account
GMAIL_USER=your.account@gmail.com
# Used for inbound IMAP reply polling.
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
GMAIL_IMAP_HOST=imap.gmail.com
# Used for outbound Gmail API sending.
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...

# Worker
WORKER_POLL_INTERVAL_MS=30000          # how often the worker polls (ms)
WORKER_SHARED_SECRET=change-me         # used to authenticate internal calls

# Scoring
MAX_OUTREACH_ROUNDS=3                  # max follow-up emails before giving up

# Analytics — secret to unlock LLM cost view (5× click the chart icon)
ANALYTICS_UNLOCK_PASSWORD=password

# App URL — used to construct links in emails and Slack messages
NEXT_PUBLIC_APP_URL=https://yourapp.com

# Slack (optional)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=                  # required for interactive Slack buttons
SLACK_CHANNEL_ID=                      # fallback channel if no DM target found
```

---

## Database Migrations

All migrations live in `supabase/migrations/`. Run them in order against your Supabase project.

| Migration | What it adds |
|---|---|
| 0001_init | Core tables: `jobs`, `candidates`, `matches`, `conversations`, `outreach_queue` |
| 0002_match_function | Postgres function for cosine similarity vector search |
| 0003_auto_engage | `auto_engage` flag on jobs |
| 0004_enable_realtime | Supabase Realtime publication for live UI updates |
| 0005_job_status | `status` column on jobs (open/closed/draft) |
| 0006_auto_engage_toggle | Toggle auto-engage without re-parsing the JD |
| 0007_email_invalid | `email_invalid` flag on candidates (bounce detection) |
| 0008_pipeline_stage | `pipeline_stage` on matches (new/shortlisted/contacted/archived) |
| 0009_draft_status | Draft job support |
| 0010_realtime_candidates | Realtime on candidates table |
| 0011_match_pipeline_stage | Index on match pipeline_stage |
| 0012_email_settings | Per-job email customisation table |
| 0013_vector_search | pgvector extension + candidate embedding column |
| 0014_llm_usage | Token/cost tracking table |
| 0015_interview_rounds | Interview rounds config on jobs |
| 0016_round_pass_email | Round-pass email queue action |
| 0017_hires_target | Hires target field on jobs |
| 0018_job_invite | Invite link tokens for job applications |
| 0019_application_ack_queue | Queue action for application acknowledgement |
| 0020_no_show_queue | Queue action for no-show handling |
| 0021_interviewers | `interviewers` table with calendar URL + timezone |
| 0022_scheduling | `scheduling_sessions` + `scheduled_interviews` tables |
| 0023_scheduling_queue | Queue actions for scheduling flow |
| 0024_enable_rls | Row Level Security policies |
| 0025_buffer_minutes | Per-interviewer buffer time between sessions |
| 0026_prep_packet | Prep packet email queue action |
| 0027_candidate_reschedule | Candidate-initiated reschedule flow + token |
| 0028_fallback_interviewers | Fallback interviewers when primary is unavailable |
| 0029_slack_interviewer | `slack_user_id` on interviewers for DM delivery |
| 0030_llm_parse_cache | Cache parsed JD results to avoid re-parsing |
| 0031_multi_slot_proposals | Support proposing multiple time slots at once |
| 0032_scorecards | `interviewer_scorecards` table for post-interview feedback |
| 0033_slack_approval_queue | `send_slack_approval`, `send_scorecard_request` queue actions |
| 0034_scheduling_slot_reservations | Slot reservation helpers for scheduling conflicts |

---

## Project Directory Layout

```
talent-scout-prod/
├── app/                        # Next.js App Router pages + API routes
│   ├── api/                    # REST endpoints (serverless)
│   │   ├── jobs/[id]/          # Job CRUD, matching, scoring, weights
│   │   ├── candidates/[id]/    # Candidate CRUD, stage, resume, insights
│   │   ├── matches/[id]/       # Match detail, conversations, scorecards, consensus
│   │   ├── interviewers/       # Interviewer management + bulk import
│   │   ├── scheduling/         # Scheduling sessions + candidate responses
│   │   ├── analytics/          # Analytics aggregation
│   │   ├── apply/[token]/      # Public application intake (no auth)
│   │   ├── schedule/respond/   # Candidate schedule-response (no auth)
│   │   └── slack/actions/      # Slack interactive button handler
│   ├── jobs/[id]/              # Job detail pages (matches, settings, compare)
│   ├── candidates/             # Candidate list
│   ├── interviewers/           # Interviewer management + bulk import page
│   ├── analytics/              # Analytics dashboard
│   └── ...
├── components/                 # React UI components
│   ├── AnalyticsEnhancements.tsx   # Time-to-hire + source + cohort charts
│   ├── BulkInterviewerImport.tsx   # CSV import UI
│   ├── CandidateComparison.tsx     # Side-by-side finalist comparison
│   ├── InterviewConsensus.tsx      # Panel consensus per round
│   └── ...
├── lib/                        # Shared business logic (used by both web + worker)
│   ├── db.ts                   # Supabase client factory
│   ├── llm.ts                  # OpenAI wrappers (scoring, parsing, follow-ups)
│   ├── scorecard.ts            # Consensus scoring logic
│   ├── analytics-enhancements.ts   # Cohort, source attribution, time-to-hire
│   ├── scheduling.ts           # Interviewer overlap + slot generation
│   ├── invite.ts               # Invite token generation + analytics
│   ├── llm-pricing.ts          # Token cost estimation per model
│   └── ...
├── worker/
│   └── src/
│       ├── index.ts            # Poll loop entry point
│       └── handlers/           # One handler per queue action type
│           ├── inboundPoll.ts      # IMAP poll → analyzeReply → enqueue follow-up
│           ├── sendInitial.ts      # First outreach email
│           ├── sendFollowup.ts     # Follow-up email
│           ├── finalizeScore.ts    # Score candidate after reply chain completes
│           ├── sendSchedulingProposal.ts
│           ├── sendScorecardRequest.ts
│           └── ...
└── supabase/
    └── migrations/             # 32 SQL migrations (run in order)
```

---

## Running Locally

### Prerequisites

- Node.js 20+
- A Supabase project with pgvector enabled
- A Gmail account with an App Password
- An OpenAI API key

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Set up env
cp .env.example .env.local
# fill in all variables

# 3. Apply migrations (in order) via Supabase dashboard SQL editor or CLI

# 4. Start the web server
npm run dev

# 5. Start the worker (separate terminal)
npm run worker:dev
```

Other commands:

```bash
npm run typecheck    # TypeScript type check (zero-error target)
npm test             # run test suite
npm run worker:dev   # worker with hot reload via tsx watch
```

---

## Deployment

### Web — Vercel

1. Connect the GitHub repo to a Vercel project (root directory = repo root).
2. Set all environment variables from `.env.example` in **Project → Settings → Environment Variables**.
3. Deploy. Vercel runs `npm run build` and serves the App Router app.

**Important env vars on Vercel:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_*`, `OPENAI_API_KEY`, `NEXT_PUBLIC_APP_URL`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` (for Slack action routes if invoked via Vercel), `ANALYTICS_UNLOCK_PASSWORD`.

API routes that use Node-only APIs (PDF parsing, Slack signature verification) set `export const runtime = "nodejs"`.

**Slack interactivity URL** must point at Vercel, e.g.
`https://<your-vercel-domain>/api/slack/actions`

### Worker — Railway

The `railway.json` at the repo root configures a **separate Railway service** (not the Vercel deploy):

```json
{
  "deploy": {
    "startCommand": "npm run worker"
  }
}
```

Which runs `tsx worker/src/index.ts`.

1. Create a new Railway service from the same repo.
2. Copy the **same** Supabase, Gmail, OpenAI, and Slack env vars as Vercel.
3. Ensure `NEXT_PUBLIC_APP_URL` matches the Vercel production URL (used in email/Slack links).
4. Deploy. Railway keeps one always-on container; `restartPolicyType: ON_FAILURE` retries crashes.

**Worker-only responsibilities:** everything in `worker/src/handlers/` — outreach, IMAP poll, scheduling emails, Slack approval DMs, scorecard requests, prep packets, calendar conflict checks.

If the worker is down, the UI still loads but **emails, replies, Slack messages, and queue jobs will not process**.

### Supabase

Run migrations in order via the Supabase SQL editor or CLI. Enable pgvector on the project. Configure Storage bucket policies for resumes if not using defaults.

---

## How the Matching Pipeline Works

1. **Resume upload** — PDFs/CSVs uploaded to Supabase Storage; parsed to text; embedded with `text-embedding-3-small` (1536 dimensions); stored in `candidates.embedding`.

2. **Match trigger** — User clicks "Find Matches" → `POST /api/jobs/[id]/match`. The API calls a Postgres function (`match_candidates`) that does cosine similarity pre-ranking via pgvector.

3. **LLM reranking** — Top-N candidates from the vector search are passed to `gpt-4o-2024-11-20` with a numeric rubric (0–100). The model returns a `match_score` and a plain-English explanation for each.

4. **Auto-shortlist** — Candidates above the job's shortlist threshold are automatically moved to `pipeline_stage = shortlisted`.

5. **Auto-engage** — If `auto_engage` is on, shortlisted candidates are immediately enqueued for outreach in `outreach_queue`.

---

## How the Email Outreach Loop Works

The worker's `inboundPoll.ts` is the core loop:

```
Every WORKER_POLL_INTERVAL_MS:
  1. Pick pending actions from outreach_queue
  2. For each action:
     a. send_initial   → write personalised email, send via Gmail API
     b. send_followup  → send follow-up with targeted questions
     c. poll_inbound   → check Gmail IMAP for replies
         → analyzeReply() (GPT-4o) extracts:
             - enthusiasm_score (0–10)
             - commitment answers (start date, salary, availability, willingness)
             - ambiguities list
         → generateAdaptiveFollowUpQuestions() (GPT-4o-mini):
             - reads full transcript + already-extracted commitments
             - only generates questions for unanswered items
             - does NOT re-ask things the candidate already answered
             - returns up to 3 targeted follow-ups
         → if rounds_sent < MAX_OUTREACH_ROUNDS and ambiguities remain:
             enqueue send_followup
         → else:
             enqueue finalize_score
     d. finalize_score → compute interest_score, update match record
```

**Interest score formula:**

```
interest_score = (0.5 × enthusiasm_score) + (0.5 × commitments_score)

commitments_score = average of answered items:
  - availability (answered = 1, unanswered = 0)
  - notice_period_weeks (answered = 1)
  - salary_expectation (answered = 1)
  - willing_to_interview (answered = 1)
```

---

## How Interview Scheduling Works

1. **Interviewer setup** — Each interviewer has a public Google Calendar URL, timezone, and optional buffer minutes. A `roundIndex` links them to a specific interview round.

2. **Slot generation** — When a candidate is ready for a round, `scheduling.ts` fetches all interviewers' calendars, computes the intersection of free windows (respecting buffer time), and generates candidate slot proposals.

3. **Candidate response** — A time-limited link is emailed to the candidate (no login required). They pick a slot. The response hits `POST /api/schedule/respond/[token]`.

4. **Confirmation** — The system creates a `scheduled_interview` record, sends calendar invites to interviewers, and triggers a Slack DM to each interviewer for approval.

5. **Scorecard request** — When a recruiter **passes** a round (or rejects in-interview), the worker enqueues `send_scorecard_request`. Interviewers receive email + Slack with a token link to `/scorecard/[token]`. Scorecards are **not** sent automatically when a calendar event ends — passing the round is the trigger.

---

## How Consensus Scoring Works

After all interviewers submit scorecards for a round, `getConsensusForRound(matchId, roundIndex)` in `lib/scorecard.ts`:

1. Fetches all scorecards for the match + round via `listScorecardsForMatch`.
2. Computes averages for `overall_rating`, `technical_rating`, and `communication_rating`.
3. Builds a `recommendationBreakdown`: count of `strong_yes`, `yes`, `no`, `strong_no`.
4. Determines consensus: the most common recommendation, or `"split"` if tied.
5. Detects outliers: any interviewer whose `overall_rating` is more than 1.0 point from the panel average is flagged.
6. Sets `autoRecommendation`:
   - `"advance"` if consensus is `strong_yes` or `yes`
   - `"reject"` if consensus is `strong_no` or `no`
   - `"hold"` if split or inconclusive
   - `null` if fewer than 2 scorecards submitted

The `GET /api/matches/[id]/consensus` route runs this for every round and returns all results.

---

## Analytics Enhancements

Three functions in `lib/analytics-enhancements.ts` power the enhanced analytics panel:

### `getCohortAnalysis(jobId)`

Groups candidates by upload month × source type. For each cohort, computes engagement rate, interview rate, hire rate, and average days to hire. Useful for comparing how candidates sourced in January vs. March ended up performing.

### `getSourceAttribution(jobId)`

Groups match outcomes by `candidate.source` (e.g., `pdf`, `csv`, `manual`). Returns counts and rates for engaged, interviewed, and hired. Lets you see which upload method produces better-quality candidates.

### `getTimeToHireTrend(jobId)`

For each match, computes days from `created_at` to the timestamp when `interview_state` was set to `hired`. Returns per-candidate days, plus summary stats (median, average, total hired count) computed in the analytics API route.

All three are called in parallel in `GET /api/analytics` and safely `.catch(() => [])` so they never break the main analytics response.

---

All three are called in parallel in `GET /api/analytics` and safely `.catch(() => [])` so they never break the main analytics response.

---

## Cost & Productivity

This section explains **why the product is worth running** (time saved) and **what it costs to operate** (infra + LLM), with realistic MVP-scale numbers.

### Productivity gains (example scenarios)

Assumptions: mid-level recruiter loaded cost **~$45/hour** (~$90k/year). Times are per **active job with ~50–100 candidates**.

| Task | Manual (typical) | With Talent Scout | Time saved |
|---|---|---|---|
| **Resume screening** — read 80 resumes, shortlist top 15 | 6–10 hours | ~30 min (upload + review ranked list + explanations) | **5–9 hours** |
| **Initial outreach** — personalised emails to 15 candidates | 2–3 hours | ~15 min (select + engage; emails auto-sent) | **~2 hours** |
| **Follow-up chasing** — 2 rounds × 10 candidates, read replies, draft follow-ups | 4–6 hours | Automated (worker reads IMAP, LLM drafts targeted follow-ups) | **4–6 hours** |
| **Interview scheduling** — 5 rounds, panel calendars, reschedule once | 3–5 hours over 2 weeks | ~45 min total (pick slots once; candidate + Slack buttons) | **2–4 hours** |
| **Scorecard collection** — chase 3 interviewers × 5 rounds | 2–4 hours | ~20 min (Pass round → auto email/Slack; panel fills token link) | **2–3 hours** |
| **Finalist comparison** — spreadsheet + committee prep | 1–2 hours | ~15 min (Compare page + export) | **~1 hour** |

**Example job total:** **~16–25 recruiter-hours saved** per hire pipeline — roughly **$720–$1,125** of recruiter time per job at $45/hr, before counting faster time-to-hire or fewer dropped candidates.

**Throughput scenario:** A team running **4 open reqs** in parallel might save **60–100 hours/month** of coordination work — equivalent to **1.5–2.5 FTE-weeks** redirected to sourcing, closing, and candidate experience.

**Quality gains (harder to quantify but real):**

- Consistent rubric-based match scores instead of gut feel on resume #47.
- Follow-ups that only ask what the candidate hasn't answered (fewer annoying emails).
- Panel consensus + outlier flags before advancing/rejecting.
- Audit trail in `match_round_events`, conversations, and scorecards.

### Operating cost (MVP ballpark)

| Line item | Typical MVP usage | Approx. monthly cost |
|---|---|---|
| **Vercel** (Hobby/Pro) | 1 production deploy, moderate API traffic | $0–$20 |
| **Railway** | 1 small always-on worker | ~$5–$15 |
| **Supabase** (Free/Pro) | Postgres + Storage + Realtime | $0–$25 |
| **OpenAI** | 100 candidates/job × 4 jobs: embeddings + match rerank + reply analysis | **~$15–$60/mo** (see `llm_usage` table) |
| **Gmail** | Dedicated recruiting inbox | $0 (Workspace existing) |
| **Slack** | Bot in workspace | $0 |

**LLM cost example (one job, 80 candidates):**

- Embeddings (`text-embedding-3-small`): 80 × ~2k tokens ≈ **$0.003**
- Match rerank (`gpt-4o`, top 20): ~**$0.05–$0.20**
- Outreach analysis (15 engaged × 3 rounds): ~**$0.50–$2.00**

So **LLM spend per hire pipeline is usually single-digit dollars** — far below one hour of recruiter time.

Token usage and estimated USD are tracked per call in `llm_usage`; unlock detailed cost charts in Analytics with `ANALYTICS_UNLOCK_PASSWORD`.

### ROI sketch

| | Manual-heavy | Talent Scout MVP |
|---|---|---|
| Recruiter time per job | ~25–40 hrs | ~8–15 hrs |
| LLM + infra cost per job | — | ~$5–$15 |
| **Net benefit (time only)** | — | **~$450–$1,000+/job** at $45/hr |

These are illustrative, not guarantees — actual savings depend on team size, candidate volume, and how much of the loop you use (auto-engage, Slack scheduling, scorecards).

---

## Security & Guardrails

### Authentication — honest MVP stance

**There is no user login or role-based access control in this MVP.**

The recruiter UI, job APIs, and candidate management endpoints are **not behind auth**. Anyone who can reach the deployed URL can use the app as if they were an admin. This was a deliberate hackathon/MVP tradeoff to ship fast and prove the workflow end-to-end.

**If the pilot succeeds, the intended path is integration into Talent Hub** (or equivalent internal platform), which would provide:

- SSO / corporate identity
- Org- and role-scoped data access
- Audit logging aligned with HR policy
- Removal of public-unauthenticated admin surfaces

Until that integration, **treat the Vercel URL as an internal preview**, not a public production HR system.

### What is protected today

| Surface | Guardrail |
|---|---|
| **Supabase service role** | Used only in server-side API routes and the worker. Never exposed to the browser. |
| **Browser Supabase client** | Uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` with RLS enabled (migration 0024). Policies are minimal for MVP — do not rely on RLS alone for admin security. |
| **Resume files** | Stored in Supabase Storage; served via signed URLs, not permanent public links. |
| **Candidate scheduling links** | Opaque tokens in `/schedule/respond/[token]` and reschedule URLs. No login; knowledge of token grants access to that session only. |
| **Scorecard links** | Opaque tokens in `/scorecard/[token]`. Scoped to one interviewer + one round. |
| **Job application links** | Invite tokens in `/apply/[token]`; can be rotated/disabled per job. |
| **Slack interactive actions** | `POST /api/slack/actions` verifies `X-Slack-Signature` with `SLACK_SIGNING_SECRET`. GET link prefetch is avoided (interactive buttons, not URL buttons). |
| **Analytics LLM costs** | Gated by `ANALYTICS_UNLOCK_PASSWORD` in the UI — obscurity only, not enterprise-grade ACL. |
| **Email invalidation** | Bounced addresses flagged `email_invalid`; outreach stops automatically. |

### What is not protected (do not expose publicly)

- Unauthenticated access to all jobs, candidates, matches, and PII.
- No rate limiting on public token routes (theoretical token brute-force — use long tokens; rotate if leaked).
- No encryption-at-rest beyond what Supabase/Gmail provide.
- No SOC2/HR compliance workflow — MVP only.

### Recommended guardrails before wider rollout

1. **Network:** Restrict Vercel deployment to VPN, IP allowlist, or Vercel Authentication / SSO wrapper.
2. **Secrets:** Rotate Gmail, OpenAI, Supabase service role, and Slack tokens on a schedule; never commit `.env.local`.
3. **Talent Hub integration:** Replace open admin UI with authenticated sessions and tenant isolation.
4. **RLS hardening:** Add policies keyed to `auth.uid()` once auth exists.
5. **Logging:** Export worker + API errors to your central log stack; alert on queue failures (`outreach_queue.status = failed`).
6. **Data retention:** Define how long resumes, conversations, and scorecards are kept post-hire/reject.

### Environment secrets checklist

- `SUPABASE_SERVICE_ROLE_KEY` — full DB access; server-only.
- `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_APP_PASSWORD` — send/receive as recruiting mailbox.
- `OPENAI_API_KEY` — billed usage; restrict by key scope in OpenAI dashboard.
- `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` — bot impersonation + request verification.
- `WORKER_SHARED_SECRET` — reserved for future internal auth between services (set in env; not a substitute for user auth today).
