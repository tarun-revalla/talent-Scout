# Talent Scout

An autonomous talent-scouting and engagement agent for recruiters. Paste a job description, upload a candidate pool, and the system parses, embeds, scores, ranks, **emails real candidates**, **reads their replies**, **decides whether to follow up**, runs a configurable **interview loop**, and lands a recruiter-ready shortlist scored on **Match** and **Interest**.

> End-to-end demo loop: parse JD → score candidates → auto-shortlist → send personalised outreach → read & analyse replies via IMAP → score interest → advance interview rounds — with a live UI that updates over Supabase Realtime.

---

## Table of contents

1. [What it does](#what-it-does)
2. [How recruiters use it](#how-recruiters-use-it)
3. [Architecture at a glance](#architecture-at-a-glance)
4. [Tech stack](#tech-stack)
5. [Getting started locally](#getting-started-locally)
6. [Required external setup](#required-external-setup)
7. [Database migrations](#database-migrations)
8. [Project layout](#project-layout)
9. [UI pages & components](#ui-pages--components)
10. [Environment variables](#environment-variables)
11. [Scripts, tests & typecheck](#scripts-tests--typecheck)
12. [Deployment](#deployment)
13. [Full architecture & agent design](DOCUMENTATION.md)

---

## What it does

| Capability | How it works |
|---|---|
| **JD parsing** | OpenAI structured outputs extract title, level, skills, years, location, salary, summary, responsibilities. Preview parsing on the create-job flow before save. |
| **Candidate ingestion** | Drop PDFs, CSV, JSON, or ZIPs. PDFs → `pdf-parse` → GPT-4o-mini structuring. Each profile gets a 1536-dim embedding (`text-embedding-3-small`) for vector search. |
| **Auto-match** | New uploads are scored against every **open** job. Manual **Find matches** / **Re-run match** on a job uses cached scores unless you force rescore. |
| **Match scoring** | Vector shortlist (cosine similarity) → GPT-4o rerank with a numeric rubric → per-match score 0–100 plus `matched_skills`, `gaps`, `experience_fit`, and summary. Cached per (job, candidate) for stable re-runs. |
| **Combined score** | UI blends Match + Interest with per-job weights (default 50/50). Computed live in the browser — not the legacy DB generated column. |
| **Auto-shortlist** | High-confidence matches promote `new → shortlisted` (threshold = auto-engage setting when ON, else ≥ 85%). |
| **Auto-engage** | When enabled on an open job, qualifying discovered matches are queued for initial outreach. Recruiter sees an ⚡ eligibility icon per row. |
| **Outreach & follow-ups** | Worker sends personalised email via Gmail SMTP, polls IMAP every ~15–30s, analyses replies with GPT-4o-mini, decides `score_now` / `follow_up` / `decline`, and finalises **Interest Score**. |
| **Interview loop** | Per-job rounds (phone screen, technical, etc.), pass/reject/hire actions, cooling period after rejection, round-pass emails, hire target auto-close. |
| **Pipeline stages** | Per-(job, match): `new → shortlisted → contacted → archived`. Same candidate can differ across jobs. |
| **Email templates** | Per-job customisable initial / follow-up templates and interest questions. |
| **Real-time UI** | Supabase Realtime on `matches`, `conversations`, `candidates`. Transcript panel and tables update without refresh. |
| **Bounce detection** | IMAP poller marks `email_invalid`; UI badges invalid addresses and skips them in outreach. |
| **Analytics** | Funnel metrics, queue health, interview stats, optional LLM token/cost unlock (password-gated). |
| **Candidate pool** | Global `/candidates` list with grid/table views, bulk delete, duplicate merge, pool drawer with insights. |
| **Resume preview** | Signed Supabase Storage URL in a portal modal from job rows or candidate pool. |

---

## How recruiters use it

### 1. Jobs (`/jobs`)

- Create a job (`/jobs/new`) — paste JD, parse preview, set hire target and interview rounds.
- Jobs index supports list/grid, filters, search, and delete.
- Open a job → **persistent left sidebar** lists all jobs; main pane shows JD brief, matching controls, and **Top Candidates** table.

### 2. Matching (`/jobs/[id]`)

- **Find matches** / **Re-run match** — vector + LLM rerank (cached).
- **Matching settings** — adjust Match vs Interest weights, auto-engage threshold + on/off, bulk engage sub-threshold selections.
- **Stage tabs** — filter matches by pipeline stage counts.
- Click a row → **candidate drawer** slides in from the right (overview + activity transcript).
- Row actions: ⚡ auto-engage status, **Resume** (PDF), status badge.

### 3. Candidate pool (`/candidates`)

- Upload via dropzone; realtime bounce toasts.
- Table or grid view, pagination, bulk delete.
- Row click → **pool drawer** with match rank / sentiment insights.

### 4. Analytics (`/analytics`)

- Outreach funnel, status breakdown, queue counts, interview summary.
- Filter by job. Token usage & cost behind `ANALYTICS_UNLOCK_PASSWORD` (5× click chart icon).

### 5. Worker (background)

Must run locally or on Railway for email send/receive. Without it: matching and UI work; outreach queue stays pending.

---

## Architecture at a glance

```
┌──────────────────────┐         ┌─────────────────────────────────┐
│  Recruiter (browser) │ ───────▶│  Next.js 15 (Vercel)            │
│                      │         │  ├─ App Router pages            │
│                      │         │  ├─ API routes (REST)           │
│                      │         │  └─ Client UI + Realtime subs   │
└──────────────────────┘         └────────────┬────────────────────┘
                                              │ Supabase JS
                                              ▼
                            ┌─────────────────────────────────────┐
                            │  Supabase                           │
                            │  ├─ Postgres + pgvector             │
                            │  ├─ Realtime                        │
                            │  ├─ Storage (resume PDFs)           │
                            │  └─ outreach_queue                    │
                            └────────────┬────────────────────────┘
                                         ▲
┌────────────────────────────────────────┴─────────────────────────┐
│  Worker (Railway / `npm run worker:dev`)                         │
│  ├─ Queue: send_initial, send_followup, finalize_score,          │
│  │          send_round_pass                                       │
│  ├─ IMAP poller → bounce detect → reply analyse → enqueue        │
│  └─ Stale lock recovery + retry with backoff                     │
└────────────────────┬─────────────────────────┬───────────────────┘
                     ▼                         ▼
              ┌────────────┐            ┌────────────┐
              │  Gmail     │            │  OpenAI    │
              │  IMAP+SMTP │            │  API       │
              └────────────┘            └────────────┘
```

**Two processes:**

| Process | Role |
|---|---|
| **Web** (`npm run dev`) | UI, uploads, match triggers, drawer, modals, analytics |
| **Worker** (`npm run worker:dev`) | Queue drain + IMAP; required for email loop |

Shared business logic lives in `lib/` and is imported by both via `@/lib/*`.

Deep dive: [DOCUMENTATION.md](DOCUMENTATION.md).

---

## Tech stack

| Concern | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 3, Cobalt design tokens (`lib/ui-tokens.ts`, `components/ui/*`) |
| Motion | [`motion`](https://motion.dev) — drawer width animation, toasts, modals |
| Icons / fonts | Lucide React, Inter via `next/font/google` |
| Database | Supabase Postgres + pgvector |
| Storage | Supabase Storage (private `resumes` bucket, signed URLs) |
| LLM | OpenAI — `gpt-4o`, `gpt-4o-mini`, `text-embedding-3-small` |
| Schemas | Zod + OpenAI structured outputs |
| Email | Nodemailer (SMTP) + imapflow + mailparser (IMAP) |
| Ingest | pdf-parse, papaparse, adm-zip |
| Realtime | Supabase Realtime |
| Worker | Node 20+ via `tsx` |
| Logging | pino (worker) |

---

## Getting started locally

```bash
# 1. Install
npm install

# 2. Env
cp .env.example .env.local
# Fill in Supabase, OpenAI, Gmail values

# 3. Run all SQL migrations in order (Supabase SQL editor)
#    See supabase/migrations/

# 4. Create Storage bucket `resumes` (private)

# 5. Web app
npm run dev                 # http://localhost:3000 → redirects to /jobs

# 6. Worker (second terminal — required for email)
npm run worker:dev          # polls IMAP + drains outreach_queue
```

**External services:** Supabase (free tier OK), OpenAI API key, Gmail with App Password.

---

## Required external setup

### Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run migrations `0001` → `0017` in order ([list below](#database-migrations))
3. Storage → private bucket **`resumes`**
4. Copy URL + `anon` + `service_role` keys

### OpenAI

- Key from [platform.openai.com](https://platform.openai.com)
- Rough cost: **$0.05–0.20** per 100 candidates × 1 job (varies by resume length and follow-ups)

### Gmail

- Use a **dedicated** account
- Enable 2-Step Verification → [App Password](https://myaccount.google.com/apppasswords)
- Enable IMAP (Settings → Forwarding and POP/IMAP)

---

## Database migrations

Run **in order** in the Supabase SQL editor (`supabase/migrations/`):

| File | Purpose |
|---|---|
| `0001_init.sql` | Core schema: jobs, candidates, matches, conversations, queue, pgvector |
| `0002_match_function.sql` | Legacy RPC (optional on fresh installs) |
| `0003_auto_engage.sql` | `auto_engage_threshold` |
| `0004_enable_realtime.sql` | Realtime on matches + conversations |
| `0005_job_status.sql` | Job status open/closed |
| `0006_auto_engage_toggle.sql` | `auto_engage_enabled` |
| `0007_email_invalid.sql` | Bounce flag on candidates |
| `0008_pipeline_stage.sql` | Legacy candidate-level stage |
| `0009_draft_status.sql` | Draft job status |
| `0010_realtime_candidates.sql` | Realtime on candidates |
| `0011_match_pipeline_stage.sql` | Per-match pipeline stage (canonical) |
| `0012_email_settings.sql` | Per-job email templates JSON |
| `0013_vector_search.sql` | Vector search helpers |
| `0014_llm_usage.sql` | LLM usage tracking for analytics |
| `0015_interview_rounds.sql` | Interview rounds, match interview state, round events |
| `0016_round_pass_email.sql` | Round-pass queue action support |
| `0017_hires_target.sql` | Hire target + auto-close job |

Migrations use `if not exists` where possible and are safe to re-run.

---

## Project layout

```
talent-scout/
├── app/
│   ├── layout.tsx              # Root layout, ToastProvider, AppLayoutClient (nav shell)
│   ├── template.tsx            # Lightweight CSS page fade on route change
│   ├── page.tsx                # Redirect → /jobs
│   ├── jobs/
│   │   ├── page.tsx            # Jobs index
│   │   ├── new/page.tsx        # Create job (stepper + JD editor)
│   │   └── [id]/
│   │       ├── layout.tsx      # Persistent JobsSidebar
│   │       └── page.tsx        # Job detail, Top Candidates, drawer
│   ├── candidates/page.tsx     # Candidate pool
│   ├── analytics/page.tsx      # Funnel + optional cost unlock
│   └── api/                    # REST endpoints (jobs, candidates, matches, analytics, search)
├── components/
│   ├── ui/                     # Design system (Button, Card, PageShell, …)
│   ├── AppLayoutClient.tsx     # Sticky nav + ambient background
│   ├── CandidateDrawer.tsx     # Job match profile drawer (slides from right)
│   ├── CandidatePoolDrawer.tsx # Pool insights drawer
│   ├── TopCandidatesTable.tsx  # Job detail match table (primary UI)
│   ├── MatchTable.tsx          # Legacy/alternate match table + shared types
│   ├── JobsSidebar.tsx         # Job list sidebar (route-cached)
│   ├── TranscriptPanel.tsx     # Email thread + AI analysis
│   ├── InterviewProgress.tsx   # Round pass/reject/hire controls
│   ├── AutoEngageStatusIcon.tsx
│   └── …                       # Modals, sliders, upload, etc.
├── lib/
│   ├── matching.ts             # Match run, auto-shortlist, auto-engage
│   ├── vector-search.ts        # pgvector queries
│   ├── llm.ts                  # All OpenAI calls
│   ├── interview.ts            # Interview state machine
│   ├── queue.ts                # outreach_queue claim/done/retry
│   ├── route-cache.ts          # Client-side 60s cache (no flash on back-nav)
│   ├── ingest/                 # PDF, CSV, JSON, ZIP pipelines
│   └── …
├── worker/src/
│   ├── index.ts                # Main loop + IMAP schedule
│   └── handlers/
│       ├── sendInitial.ts
│       ├── sendFollowup.ts
│       ├── finalizeScore.ts
│       ├── sendRoundPass.ts
│       └── inboundPoll.ts
├── supabase/migrations/        # 17 SQL files
├── tests/                        # Node test runner unit tests
├── scripts/                      # Dev utilities (IMAP test, set email, …)
├── samples/                      # Sample CSV for smoke tests
├── DOCUMENTATION.md              # Deep architecture doc
├── railway.json                  # Worker deploy config
└── .env.example
```

---

## UI pages & components

| Route | What you see |
|---|---|
| `/jobs` | Job cards, filters, create link |
| `/jobs/new` | JD paste, parse preview, rounds, hire target |
| `/jobs/[id]` | Sidebar + job brief + matching settings + **Top Candidates** + drawer |
| `/candidates` | Upload + pool table/grid + pool drawer |
| `/analytics` | Funnel, queue, interview metrics |

**Key UX patterns**

- **Candidate drawer** — flex sibling of main content; animates width from the right when a match row is clicked.
- **Route cache** — jobs list, candidates list, job detail reuse in-memory data for 60s to avoid skeleton flash on navigation.
- **Realtime** — match status, transcripts, bounce flags update live.
- **Design system** — `components/ui/*` + `lib/cn.ts` for consistent buttons, cards, alerts, page shells.

---

## Environment variables

See [`.env.example`](.env.example). Required for full operation:

| Variable | Used by | Notes |
|---|---|---|
| `OPENAI_API_KEY` | web + worker | |
| `SUPABASE_URL` | server | |
| `SUPABASE_SERVICE_ROLE_KEY` | server + worker | Never expose to browser |
| `NEXT_PUBLIC_SUPABASE_URL` | browser | Realtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | Realtime |
| `GMAIL_USER` | worker | |
| `GMAIL_APP_PASSWORD` | worker | 16-char app password |
| `GMAIL_IMAP_HOST` | worker | Default `imap.gmail.com` |
| `GMAIL_SMTP_HOST` | worker | Default `smtp.gmail.com` |
| `WORKER_POLL_INTERVAL_MS` | worker | Default 30000 in `.env.example` |
| `MAX_OUTREACH_ROUNDS` | worker | Default 3 |
| `ANALYTICS_UNLOCK_PASSWORD` | web | Unlocks token/cost on `/analytics` |
| `WORKER_SHARED_SECRET` | reserved | Future web→worker triggers |

Optional (Cursor MCP): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `STITCH_API_KEY`.

---

## Scripts, tests & typecheck

```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run start        # Production server
npm run worker:dev   # Worker with .env.local
npm run typecheck    # tsc --noEmit
npm test             # Unit tests (tests/*.test.ts)
npm run lint         # next lint
```

Tests cover matching utils, interview cooling period, vector parsing, queue utils, email templates, IMAP helpers, etc.

---

## Deployment

### Web → Vercel

```bash
vercel --prod
```

Set all env vars in the Vercel dashboard. The web tier is serverless.

### Worker → Railway

`railway.json` runs `npm run worker`. Connect the repo, set the same env vars, deploy continuously (~$5/mo Hobby).

**Realtime checklist:** `matches`, `conversations`, and `candidates` must be in the `supabase_realtime` publication (migrations `0004`, `0010`).

---

## See also

For agent flow diagrams, scoring rubric, embedding choices, IMAP threading, retry semantics, and security notes → [**DOCUMENTATION.md**](DOCUMENTATION.md).
