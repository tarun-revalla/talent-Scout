# Talent Scout — Technical Details

This document is for developers setting up, deploying, or extending Talent Scout.

---

## Architecture

Talent Scout runs as two independent processes:

```
Browser
  └── Next.js (Vercel)          ← REST API + React UI + Supabase Realtime
        └── Supabase Postgres   ← shared database
              ↑
      Node.js Worker (Railway)  ← long-running email + scoring loop
```

**Why two processes?** The web process is serverless (Vercel) and can't hold open IMAP connections or run long polling loops. The worker is a persistent Node.js process that:

- Polls the `outreach_queue` table every N seconds
- Sends outbound emails via Gmail SMTP
- Polls Gmail IMAP for inbound replies
- Calls OpenAI to analyze replies, score candidates, and generate follow-up questions
- Writes results back to Postgres (which triggers Supabase Realtime → browser updates)

The two processes share only Postgres. The worker never calls the Next.js API.

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
| Email outbound | Nodemailer (Gmail SMTP) |
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

# Gmail — use a dedicated account + App Password
GMAIL_USER=your.account@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
GMAIL_IMAP_HOST=imap.gmail.com
GMAIL_SMTP_HOST=smtp.gmail.com

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

Deploy the root directory to Vercel. Set all environment variables in the Vercel project settings. The `runtime = "nodejs"` is set explicitly on API routes that use Node.js APIs (IMAP, file parsing).

### Worker — Railway

The `railway.json` at the repo root configures the worker service. The start command is:

```
npx tsx worker/src/index.ts
```

Set the same environment variables as the web process in the Railway service environment panel. The worker only needs `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_*`, `WORKER_*`, `MAX_OUTREACH_ROUNDS`, `NEXT_PUBLIC_APP_URL`, and `SLACK_*`.

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
     a. send_initial   → write personalised email, send via SMTP
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

5. **Scorecard request** — After the interview, each interviewer receives a link to submit feedback (`/api/scorecards/[token]`).

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

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` is only used server-side. It is never passed to the browser.
- Browser clients use `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which is restricted by Row Level Security policies (migration 0024).
- Resume files in Supabase Storage are served via short-lived signed URLs, not public URLs.
- Candidate scheduling and scorecard links use opaque tokens (UUIDs). No authentication is required to follow these links, but they expire.
- Invite links for job applications use a separate token and can be disabled per job.
- The analytics cost view is protected by a client-side password (`ANALYTICS_UNLOCK_PASSWORD`) — this is obscurity, not true security; it's intended to hide cost data from casual viewers, not adversaries.
