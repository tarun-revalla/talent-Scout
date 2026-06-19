# Talent Scout — End-to-end Documentation

> A deep dive into how the agent works, why each design choice was made, and how the pieces fit together. Pair with [README.md](README.md) for setup instructions.

## Table of contents

1. [Problem statement](#1-problem-statement)
2. [Solution approach](#2-solution-approach)
3. [System architecture](#3-system-architecture)
4. [Data model](#4-data-model)
5. [Lifecycle of a job](#5-lifecycle-of-a-job)
6. [Lifecycle of a candidate](#6-lifecycle-of-a-candidate)
7. [LLM components in detail](#7-llm-components-in-detail)
8. [Embeddings & vector search](#8-embeddings--vector-search)
9. [Match scoring & explainability](#9-match-scoring--explainability)
10. [Auto-shortlist logic](#10-auto-shortlist-logic)
11. [Auto-engage logic](#11-auto-engage-logic)
12. [Email outbound (SMTP)](#12-email-outbound-smtp)
13. [Email inbound (IMAP) + threading](#13-email-inbound-imap--threading)
14. [Reply analysis (cumulative)](#14-reply-analysis-cumulative)
15. [Adaptive follow-ups](#15-adaptive-follow-ups)
16. [Bounce handling](#16-bounce-handling)
17. [Interest Score calculation](#17-interest-score-calculation)
18. [Combined Score & weighting](#18-combined-score--weighting)
19. [Pipeline stages (per-match)](#19-pipeline-stages-per-match)
20. [Worker queue mechanics](#20-worker-queue-mechanics)
21. [Realtime UI updates](#21-realtime-ui-updates)
22. [Failure modes & recovery](#22-failure-modes--recovery)
23. [Security model](#23-security-model)

---

## 1. Problem statement

Recruiters spend hours doing low-leverage work that is, in principle, automatable:

1. **Sourcing** — sifting through hundreds of resumes to find the few that match a JD.
2. **Outreach** — drafting a personalised email to each shortlisted candidate.
3. **Triage** — chasing replies, deciding who's interested, and feeding the warm leads to the hiring manager.

Each candidate gets ~30 seconds of human attention even though deciding "is this person worth talking to?" is a question with rich, structured signals: skill overlap, years of experience, location, salary expectation, response sentiment, and concrete commitments (notice period, willingness to interview).

**The brief:** build an AI agent that takes a JD as input, discovers matching candidates, **engages them conversationally to assess genuine interest**, and outputs a ranked shortlist scored on two dimensions:

- **Match Score** — does the candidate's profile fit the role?
- **Interest Score** — does the candidate actually want this role?

The output must be **explainable** (so the recruiter trusts it), **adaptive** (so partial answers trigger smart follow-ups), and **actionable** (a recruiter-ready shortlist, not just a number).

---

## 2. Solution approach

The system is structured as **a stateful agent loop** with five mostly-independent stages:

```
   Pool ─┐
         ▼                           ┌──── auto-shortlist (high match)
   ┌──────────┐    ┌──────────┐      │
   │ Ingest   │ ─▶ │  Match   │ ─────┴──── auto-engage (if enabled)
   │ + embed  │    │  + rank  │           │
   └──────────┘    └──────────┘           ▼
                                  ┌──────────────┐
                                  │ Outreach     │ ──▶ Gmail SMTP
                                  │ (compose →   │
                                  │  send)       │ ◀── Gmail IMAP
                                  └──────┬───────┘     (replies, bounces)
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │ Cumulative   │
                                  │ analysis     │
                                  └──────┬───────┘
                                         │
                              ┌──────────┴──────────┐
                              ▼                     ▼
                       follow_up           score_now / decline
                              │                     │
                              └─loop back─┐        ▼
                                          │  Interest Score
                                          │        │
                                          │        ▼
                                          │  Combined Score
                                          │        │
                                          ▼        ▼
                                          Ranked shortlist
```

Each arrow is either a **deterministic data transform** (e.g. cosine similarity, score formula) or a **single LLM call with a structured-output schema** (e.g. parse JD, rerank match, compose email, analyse reply). State is kept in Postgres; nothing lives in memory.

The agent is "agentic" in the practical sense:
- It decides **which** candidates to email (auto-shortlist + auto-engage thresholds).
- It decides **what** to ask each candidate (LLM personalised composition).
- It decides **whether** a reply is enough or a follow-up is needed (cumulative analyser → `score_now` / `follow_up` / `decline`).
- It decides **how** to defer questions outside its knowledge ("I'd love to cover that on a call" instead of fabricating).
- It decides **when** to give up (`MAX_OUTREACH_ROUNDS`).

Two non-LLM components are also "deciding" things: the **bounce detector** (extracts the failed recipient from an `RFC 3464` notice) and the **race-guard** in `sendFollowup` (skips a queued follow-up if a fresher reply has already moved the candidate to `score_now`).

---

## 3. System architecture

Two processes:

### Web (Next.js 15 App Router)
- All UI (recruiter dashboard, drawer, modals)
- All `POST/GET/PATCH/DELETE` API routes
- Sends short tasks (e.g. parse + embed a JD; trigger a match run)
- **Cannot** run long-lived background jobs — Next.js serverless functions time out

### Worker (Node `tsx`, long-running)
- Drains the `outreach_queue` Postgres table
- Polls Gmail INBOX every `WORKER_POLL_INTERVAL_MS` (default 15s)
- Sends outbound emails via Nodemailer SMTP
- Reads inbound replies via `imapflow` + `mailparser`
- Calls OpenAI for reply analysis and follow-up composition
- Updates DB rows; UI sees them via Supabase Realtime

### Why split?
A single Vercel function can't keep an IMAP socket open for 15 minutes between polls. A long-running worker can. Splitting also lets us scale the two surfaces independently — many recruiters can hit the web UI concurrently, while one worker quietly processes their outreach.

### Communication
- Web writes to `outreach_queue` — never invokes the worker directly
- Worker reads `outreach_queue` and external services (Gmail, OpenAI)
- Both read/write the same Postgres tables
- Browser subscribes to Supabase Realtime channels filtered by `job_id` / `match_id` and re-renders on UPDATE / INSERT events

---

## 4. Data model

Eleven tables and counting; the core is five:

### `jobs`
| column | purpose |
|---|---|
| `id`, `title`, `created_at` | identity |
| `raw_jd` | the pasted text |
| `parsed_jd` (jsonb) | LLM-extracted: must-haves, nice-to-haves, years_min, salary range, level, remote/hybrid, responsibilities, summary |
| `embedding` (vector(1536)) | derived from `parsed_jd` via `text-embedding-3-small` |
| `weights` (jsonb) | `{match: 0.5, interest: 0.5}` for combined score weighting |
| `auto_engage_threshold` (numeric) | match-score cutoff (default 55) |
| `auto_engage_enabled` (boolean) | recruiter must opt in |
| `status` (text) | `'draft' | 'open' | 'closed'` — gates auto-engage and mutations |

### `candidates`
| column | purpose |
|---|---|
| `id`, `name`, `email`, `created_at` | identity |
| `email_invalid` (boolean) | flipped true when a bounce is observed |
| `source` | `'pdf' | 'csv' | 'json'` |
| `raw_text` | normalised text used for embedding |
| `parsed_profile` (jsonb) | LLM-extracted: skills, years, experience[], education[], summary |
| `resume_url` | Supabase Storage object key (PDF only) |
| `embedding` (vector(1536)) | derived from `parsed_profile` |

### `matches`
The pivot. One row per (job, candidate) pair.
| column | purpose |
|---|---|
| `id`, `job_id`, `candidate_id` (unique together) | identity |
| `match_score` (numeric) | LLM rerank result — **null means "needs scoring"** (cache invalidation primitive) |
| `match_explanation` (jsonb) | matched_skills, gaps, experience_fit, summary |
| `status` (text) | outreach lifecycle: `discovered → outreach_sent → replied → follow_up_sent → scored / declined / bounced` |
| `pipeline_stage` (text) | recruiter-facing pipeline: `new → shortlisted → contacted → archived` |
| `rounds_sent` (int) | follow-up cap |
| `interest_score` (numeric) | computed from cumulative analysis |
| `interest_breakdown` (jsonb) | sentiment + commitments record (auditable) |
| `combined_score` (generated column) | `0.5 * match + 0.5 * interest` (legacy default; UI computes with live weights) |
| `thread_id` | first outbound `Message-ID` for IMAP threading |

### `conversations`
The transcript. One row per email (in or out).
| column | purpose |
|---|---|
| `match_id` | foreign key |
| `direction` | `'out' | 'in'` |
| `subject`, `body` | plain text |
| `message_id`, `in_reply_to` | RFC 5322 threading headers |
| `sent_at`, `received_at` | timestamps |
| `llm_analysis` (jsonb) | sentiment, enthusiasm, commitments, ambiguities, decision (only on inbound) |

### `outreach_queue`
The work queue. Web inserts; worker drains.
| column | purpose |
|---|---|
| `match_id`, `action`, `payload` | what to do |
| `status` | `'pending' | 'running' | 'done' | 'failed'` |
| `scheduled_for`, `locked_at` | retry-with-backoff state |
| `attempts`, `last_error` | observability |

`action` ∈ `{send_initial, send_followup, finalize_score}`.

---

## 5. Lifecycle of a job

```
recruiter pastes JD
        │
        ▼
POST /api/jobs                    ─▶ parseJobDescription (gpt-4o)
        │                               + embed (text-embedding-3-small)
        ▼
job row created, status='open' by default
        │
        ▼
POST /api/jobs/[id]/match         ─▶ runMatching():
        │                              1. fetch all candidates with embeddings
        │                              2. cosine-rank top 30 in JS
        │                              3. for uncached: rerankMatch (gpt-4o)
        │                              4. cache match_score in DB
        │                              5. applyAutoShortlist
        │                              6. applyAutoEngage (if enabled)
        │
        ▼
ranked shortlist visible in UI
        │
        ▼
recruiter clicks Engage / agent auto-engages
        │
        ▼
queue row inserted → worker sends email
        │
        ▼
candidate replies → IMAP poller picks up → analyser decides → loop or finalise
        │
        ▼
match.interest_score populated, combined_score sortable, recruiter acts
```

The recruiter can:
- Toggle `status` (Draft → Open → Closed) — closed blocks all mutations
- Edit the JD (re-runs match with new rubric)
- Adjust weights (live re-sort, no LLM cost)
- Adjust auto-engage threshold + enable/disable toggle
- Force rescore (nullifies cached scores → next match call hits LLM)
- Move individual matches across stages

---

## 6. Lifecycle of a candidate

```
recruiter drops PDF/CSV/JSON/ZIP
        │
        ▼
POST /api/candidates/upload
        │
        ▼
detectKind → pdf-parse / papaparse / JSON / unzip
        │
        ▼
parseResume (gpt-4o-mini, structured output)
        │
        ▼
embed (profileEmbeddingText → text-embedding-3-small)
        │
        ▼
upload PDF to Supabase Storage (if PDF)
        │
        ▼
INSERT into candidates
        │
        ▼
duplicate check (same email already exists?)
   ├── yes → return DuplicatePair → recruiter resolves (merge or keep)
   └── no  → scoreCandidateAgainstAllOpenJobs:
                  for each open job:
                    rerankMatch
                    upsert match
                    applyAutoShortlist (per-job)
                    if auto-engage on + above threshold + valid email:
                        enqueue send_initial
```

A candidate with `email_invalid = true` is **excluded from all auto-outreach** and **manual engage** paths. The recruiter sees a red `invalid` chip in the UI.

---

## 7. LLM components in detail

All OpenAI calls live in [`lib/llm.ts`](lib/llm.ts) and use **OpenAI Structured Outputs** — Zod schemas defined in [`lib/schemas.ts`](lib/schemas.ts) drive `response_format: zodResponseFormat(...)`. This eliminates JSON-parsing failures and gives us strongly-typed return values.

| Function | Model | Temperature | Purpose |
|---|---|---|---|
| `parseJobDescription` | `gpt-4o-2024-11-20` | default | JD text → `ParsedJD` (must-haves, nice-to-haves, years_min, salary, level, summary…) |
| `parseResume` | `gpt-4o-mini` | default | Resume text → `ParsedProfile` (name, email, skills, years, experience[], education[], summary) — email extraction is critical |
| `embed` | `text-embedding-3-small` | n/a | 1536-dim vector |
| `rerankMatch` | `gpt-4o-2024-11-20` | **0** + `seed: 42` | (jd, profile) → `MatchExplanation` (score, matched_skills, gaps, experience_fit, summary) — see [§9](#9-match-scoring--explainability) |
| `composeInitialEmail` | `gpt-4o-2024-11-20` | default | Personalised opener + 4 standard interest questions |
| `composeFollowUp` | `gpt-4o-mini` | 0.2 | Acknowledge reply + answer JD-grounded questions or **defer** + ask only unanswered items — see [§15](#15-adaptive-follow-ups) |
| `analyzeReply` | `gpt-4o-mini` | 0 | Full transcript → sentiment, enthusiasm, commitments, ambiguities, decision — see [§14](#14-reply-analysis-cumulative) |

**SDK retries:** OpenAI client created with `maxRetries: 5` so transient 429 / 5xx / network errors retry with exponential backoff.

**Worker retries:** on top of SDK retries, the worker queue has its own backoff loop (5s → 10s → 20s → 40s → 80s, max 5 attempts per job; see [§20](#20-worker-queue-mechanics)).

---

## 8. Embeddings & vector search

**Why embeddings?** GPT-4 calls cost $0.005-0.01 each. Running rerank on every (job, candidate) pair would mean $5–10 per recruiter session. Embeddings let us do a cheap **first-pass shortlist** — rank everyone by semantic similarity, then run the expensive LLM only on the top 30.

### Embedding text construction

The text fed into `text-embedding-3-small` is intentionally normalised so semantically-equivalent profiles produce similar vectors regardless of resume formatting.

For a **candidate** ([`lib/llm.ts:profileEmbeddingText`](lib/llm.ts)):
```
{summary}
Skills: {comma-separated}
Experience: {title at company}; {title at company}; …
Education: {strings}
Total years: {n}
```

For a **JD** ([`lib/llm.ts:jdEmbeddingText`](lib/llm.ts)):
```
Title: {title}
Level: {level}
Must-haves: {comma-separated}
Nice-to-haves: {comma-separated}
Min years: {n}
Summary: {summary}
Responsibilities: {semi-colon-separated}
```

Each text is capped at 8000 chars before embedding (`text-embedding-3-small` accepts up to 8192 tokens; 8000 chars is a safe budget).

### Vector storage
- Postgres column `vector(1536)` (provided by the `vector` extension, a.k.a. pgvector)
- Insert encoding: pass a JS array; supabase-js serialises it as `[0.1, 0.2, ...]` which pgvector parses
- Read encoding: pgvector returns the vector as a JSON-array string; we `JSON.parse` before computing distance

### Why JS-side cosine, not pgvector?

We tried a Postgres function (`match_candidates(query_embedding vector, match_count int)` in migration 0002). PostgREST's RPC layer was finicky with the `vector` parameter type and returned 0 rows under conditions we couldn't reliably reproduce. At demo scale (50–500 candidates) the difference between in-DB and in-JS cosine is meaningless — both run in <50ms — so we ship the explicit JS implementation in [`lib/matching.ts:cosineDistance`](lib/matching.ts) for predictability. The pgvector function still exists in migration 0002 (unused, harmless). At larger scale the right move is to fix the RPC and use an `ivfflat` index for sub-linear search.

### Shortlist size
`SHORTLIST_SIZE = 30` (constant in [`lib/matching.ts`](lib/matching.ts)). Sorted by ascending cosine distance. Anything past 30 is virtually certain to lose the rerank step anyway, and rerank cost scales linearly with this number.

---

## 9. Match scoring & explainability

The vector shortlist tells us "these 30 are roughly close". We then ask GPT-4o to score each shortlisted candidate strictly against the JD. The scoring prompt is **deterministic by construction**: `temperature: 0`, `seed: 42`, and the system message gives an explicit numeric rubric:

```
Apply this RUBRIC strictly to compute the score (0-100):
  - Start at 50.
  - For each must-have skill the candidate clearly has: +10 (cap +50)
  - For each must-have skill the candidate is missing: -15
  - For each nice-to-have they have: +3 (cap +12)
  - Years vs years_min:
      candidate years >= years_min + 2 → +10
      years_min      <= years < years_min + 2 → +5
      candidate years < years_min → -15
  - Clamp final score to [0, 100] and round.
```

Plus strict rules for the explainability fields:
- `matched_skills` MUST come from `jd.must_have_skills ∪ jd.nice_to_have_skills` and only include items the candidate **clearly** has (case-insensitive).
- `gaps` lists ONLY must-haves the candidate is missing.
- `experience_fit ∈ {strong, partial, weak}` derived from the years rule.
- `summary` is 1-2 sentences citing matched count, gaps, and fit.

### Score caching

`runMatching` reads `match_score` from existing match rows before calling the LLM. If cached, the row is **skipped entirely** — no LLM call, no DB write, no change. This is what gives re-runs ±0 stability.

To force a re-score, either:
- Click **Force rescore** (calls `POST /api/jobs/[id]/rescore` → `invalidateJobMatchScores` → nullifies `match_score` for that job → next `runMatching` re-LLMs everyone)
- Edit the JD (`PUT /api/jobs/[id]` → re-parse → re-embed → invalidate → re-run automatically)

This caching is what keeps the recruiter's mental model honest: a score doesn't change until the inputs change.

---

## 10. Auto-shortlist logic

Recruiters want the **Shortlisted** tab to populate automatically for high-confidence matches, even if they haven't enabled outreach.

**Trigger** — runs after every match scoring, in [`applyAutoShortlist`](lib/matching.ts):

```
SQL effect:
  UPDATE matches
     SET pipeline_stage = 'shortlisted'
   WHERE job_id = ?
     AND pipeline_stage = 'new'
     AND match_score >= cutoff
```

**Cutoff:**
- If `auto_engage_enabled = true` → use the recruiter-set `auto_engage_threshold` (so engage and shortlist trigger together)
- If `auto_engage_enabled = false` → use `DEFAULT_SHORTLIST_THRESHOLD = 85`

**Why filter to `pipeline_stage = 'new'`?** Manual moves win. If the recruiter has already moved someone to `archived` (or to `contacted` after manual engage), auto-shortlist won't drag them back.

When **auto-engage is on**, the same matches:
1. Get auto-shortlisted (`new → shortlisted`) — visible in the Shortlisted tab.
2. Get queued for outreach.
3. When the worker sends the email, the worker bumps `shortlisted → contacted`.

So a match traverses `new → shortlisted → contacted` in seconds, with each transition observable in the UI via Realtime.

---

## 11. Auto-engage logic

The recruiter explicitly opts in via the **Auto-engage ON/OFF** pill on the job page (a guardrail — no email goes out until they flip it on).

**Trigger** — runs at the end of `runMatching` and per-candidate in `scoreCandidateAgainstAllOpenJobs`:

```
if auto_engage_enabled
   and job.status === 'open'  (drafts never auto-engage even if toggled on)
   for every match where:
       status = 'discovered'  (not yet engaged)
       AND match_score >= auto_engage_threshold
       AND candidate.email is set
       AND NOT candidate.email_invalid
   ↳ enqueue('send_initial', match_id)
```

The status filter (`'discovered'`) is critical — matches that are already `outreach_sent`, `replied`, etc. are not re-engaged on a re-run. This is what makes the agent idempotent: spamming "Find matches" 10 times doesn't send 10 copies of the email.

---

## 12. Email outbound (SMTP)

[`lib/email.ts`](lib/email.ts) wraps Nodemailer with a single `sendEmail({ to, subject, body, inReplyTo, references })` call.

```ts
nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user, pass: appPassword },
})
```

For threaded replies we set `In-Reply-To` and `References` headers on the outbound message so Gmail (and any client receiving the candidate's reply) keeps the thread together. The first outbound's `Message-ID` (auto-generated by Nodemailer / SMTP server) is captured and stored as `matches.thread_id`.

### `sendInitial` handler
- Loads the match, candidate, job, match_explanation
- Calls `composeInitialEmail` (gpt-4o) with the matched_skills + a fixed 4-question structure
- Sends via SMTP
- Inserts an outbound `conversations` row with the captured `Message-ID`
- Updates `matches.status = 'outreach_sent'`, increments `rounds_sent`, sets `thread_id`
- Bumps `pipeline_stage` from `'new'` or `'shortlisted'` → `'contacted'`

### The 4 standard interest questions
Hard-coded into the system prompt (so it's stable across runs):

1. Are you open to exploring a new opportunity right now?
2. What is your earliest start date / notice period?
3. What are your compensation expectations? (with the JD's range as anchor)
4. Would you be open to a 30-minute intro call this week or next?

These four map directly onto the four `Commitments` fields the analyser looks for — see [§14](#14-reply-analysis-cumulative).

---

## 13. Email inbound (IMAP) + threading

[`lib/imap.ts:fetchUnseenInbound`](lib/imap.ts) opens an IMAPS connection, fetches up to **10 unseen messages per poll** (`IMAP_BATCH_SIZE`, with a 15-second per-op timeout), parses each via `mailparser`, marks it `\Seen`, and returns an array of `InboundMessage`.

Each fetched message includes:
- `messageId`, `inReplyTo`, `references[]` — RFC 5322 threading headers, all wrapped in `<...>` form
- `text` — the plain-text body, with `mailparser` already stripping the HTML alt
- `from`, `subject`, `date`

### Threading by Message-ID

The worker's [`inboundPoll`](worker/src/handlers/inboundPoll.ts) handler then:

1. Looks up the candidate's `inReplyTo` in `conversations.message_id`. If there's a matching outbound, the inbound is a reply to that thread → we know which `match_id` it belongs to.
2. Strips quoted reply blocks (`On X, Y wrote:` patterns) so the analyser doesn't read your own previous outbound back.
3. Caps at 12000 characters (defensive).
4. Inserts an inbound `conversations` row.
5. Calls `analyzeReply` with the **full transcript**, not just the latest reply (see [§14](#14-reply-analysis-cumulative)).

### Stripping quoted history

```
On 26 Apr 2026, at 09:42, Talent Team <hr@example.com> wrote:
> Hi Alice, ...
```

Both the `On … wrote:` line and any line beginning with `>` are dropped. This matters because GPT will faithfully treat anything in the input as the candidate's words, and we don't want to count our own outbound text as their commitment.

---

## 14. Reply analysis (cumulative)

This is the part that took the most iteration.

The original implementation passed **only the latest reply** to `analyzeReply`. That broke the moment a candidate replied across two emails:

- T1: agent asks Q1–Q4
- T2: candidate answers Q1, Q2, Q3 → analyser sees 1 ambiguity (Q4) → enqueues follow-up
- T3: agent's follow-up asks just Q4
- T4: candidate answers Q4 → analyser sees `priorOutbound = "Q4 only"` and `reply = "Q4 answer"` → flags Q1, Q2, Q3 as **new ambiguities** (because they weren't in the latest exchange) → loop forever

The fix: pass the **full chronological transcript** to the analyser and instruct it to extract commitments **cumulatively**.

System prompt rules ([`lib/llm.ts:analyzeReply`](lib/llm.ts)):

- Extract commitments cumulatively across the entire transcript.
- Once an item is answered in any inbound message, treat it as answered for the rest of the analysis.
- If a later message updates an answer (e.g. revises salary), use the latest value.
- `ambiguities` lists ONLY items the recruiter has asked about that remain unanswered after the entire transcript.
- `sentiment` and `enthusiasm_score` reflect the **latest** inbound only (those track shifts).
- Decision: `decline` if clear "no" anywhere; `score_now` if all four key items have a cumulative answer OR `rounds_sent >= max_rounds`; `follow_up` otherwise.

Output schema ([`lib/schemas.ts:ReplyAnalysisSchema`](lib/schemas.ts)):

```ts
{
  sentiment: 'enthusiastic' | 'positive' | 'neutral' | 'hesitant' | 'declining',
  enthusiasm_score: 0..100,
  commitments: {
    availability: string | null,
    notice_period_weeks: number | null,
    salary_expectation: string | null,
    willing_to_interview: 'yes' | 'no' | 'maybe' | null,
  },
  ambiguities: string[],
  decision: 'score_now' | 'follow_up' | 'decline',
}
```

The analysis is stored on the inbound `conversations.llm_analysis` row, so the recruiter can see exactly what the agent inferred from each message.

---

## 15. Adaptive follow-ups

`composeFollowUp` is the agent's response-writer. It receives:
- The full JD (so it can answer JD-grounded questions)
- The full transcript
- The list of unanswered items (`ambiguities` from the latest analysis)
- The candidate's name

System prompt rules:

1. ONE warm opening line acknowledging the candidate's last reply.
2. If the candidate asked questions:
   - For JD-grounded ones (level, location/remote, salary, skills, summary, responsibilities): answer briefly using **only** JD facts.
   - For everything else (team culture, manager, day-to-day, benefits, growth path, perks): **defer** with something like *"Great question — those details are best covered live. Happy to set up a quick 30-minute call with our hiring HR / hiring manager so you can get the full picture."* Phrasing varies; the intent is fixed.
3. Ask only the unanswered items (numbered, no repeats of items already answered).
4. One-line warm close.

Hard rules in the prompt:
- NEVER fabricate facts not present in the JD.
- NEVER ask the candidate questions they already answered.
- NEVER answer a candidate's question by asking them another question.
- Subject prefixed with `Re:`, < 70 chars.

The handler ([`worker/src/handlers/sendFollowup.ts`](worker/src/handlers/sendFollowup.ts)) also has a **race guard**: right before sending, it re-reads the latest analysis. If a fresher inbound has already pushed the decision to `score_now` or `decline`, the follow-up is dropped (otherwise we'd send a redundant email after the conversation has already concluded).

`MAX_OUTREACH_ROUNDS = 3` is the cap — after 3 outbound messages, the agent finalises whatever it has.

---

## 16. Bounce handling

When Gmail rejects a recipient, the SMTP server returns "OK" (because Gmail accepted it for queuing) but later a postmaster delivers a bounce notice into your INBOX:

```
From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
Subject: Delivery Status Notification (Failure)
...
Final-Recipient: rfc822; xxx@nonexistent.example.com
```

[`lib/bounce.ts:isBounce`](lib/bounce.ts) recognises these by sender (`mailer-daemon@`, `postmaster@`, etc.) and subject (`Delivery Status Notification`, `Undeliverable`, etc.). [`extractBouncedAddress`](lib/bounce.ts) parses the failed recipient using:

1. RFC 3464 `Final-Recipient: rfc822; user@host`
2. Angle-bracketed `<user@host>`
3. Bare email regex (last resort)

When detected:
- `candidates.email_invalid` flips `false → true` for that address (lowercased)
- Supabase Realtime fires the change to the browser → a red toast pops up: *"Alice Tan's email bounced — marked invalid."*
- All future auto-engage / manual-engage paths skip the candidate

The bounce notification is then **`continue`d past** in the inbound poll — we don't try to thread it as a reply.

---

## 17. Interest Score calculation

When the analyser returns `decision: 'score_now'` (or rounds_sent reaches max), the worker enqueues `finalize_score`. [`worker/src/handlers/finalizeScore.ts`](worker/src/handlers/finalizeScore.ts) reads the latest analysis and computes:

```
interest_score = round(
  0.5 * enthusiasm_score
+ 0.5 * commitments_completeness_score
)
```

`commitments_completeness_score` is the weighted sum of the four commitments:

| Commitment | Weight | Logic |
|---|---|---|
| `availability` | 20 | Full marks if a date / week is stated |
| `notice_period_weeks` | 20 | Full marks if a number is stated |
| `salary_expectation` | 30 | Full marks if within JD range; 60% if up to 15% above ceiling; 20% otherwise. Falls back to 60% if no JD range to compare |
| `willing_to_interview` | 30 | `yes` → 30, `maybe` → 15, `no`/null → 0 |

Capped at 100. Stored on `matches.interest_score`, with a JSON breakdown on `matches.interest_breakdown` for the drawer to render.

If `decision = 'decline'` or analysis isn't usable (rare edge), the match goes to `status = 'declined'`, `interest_score = 0`.

---

## 18. Combined Score & weighting

`combined_score = weights.match * match_score + weights.interest * interest_score`

Two important details:

1. **`weights` is per-job** — stored on `jobs.weights` as `{match: 0.5, interest: 0.5}` by default. The recruiter can drag a slider on the job page to change the split (60/40, 80/20, etc.).
2. **The legacy `matches.combined_score` generated column** was created in migration 0001 with hardcoded 0.5/0.5 weights. It's still there (Postgres can't drop a generated column without rewriting the table) but **the UI ignores it** — it computes the combined score live with the current weights via [`combinedScore(row, weights)`](components/MatchTable.tsx).

This means dragging the weight slider re-sorts the table instantly, no LLM cost, no DB writes (except the slider's debounced save of the new weights).

---

## 19. Pipeline stages (per-match)

Every match has its own `pipeline_stage`:

```
new → shortlisted → contacted → archived
       (manual or auto)         (manual)
```

| Transition | Trigger |
|---|---|
| (insert) `null → new` | Default Postgres column value |
| `new → shortlisted` | Auto-shortlist (match_score crosses cutoff) OR manual move from drawer/dropdown |
| `new → contacted` | Manual engage + email sends (worker) |
| `shortlisted → contacted` | Auto-engage + email sends (worker) |
| `* → archived` | Manual move only |
| `* → shortlisted` (again) | Manual only — auto won't move from `contacted` or `archived` back |

Stages are **per (job, candidate)**, not per-candidate. Alice can be `shortlisted` for the Senior Backend role and `archived` for the ML Ops role at the same time. This is critical when one candidate fits multiple postings differently.

The job detail page has stage tabs (All / New / Shortlisted / Contacted / Archived) above the matches table that filter the table by `pipeline_stage`.

---

## 20. Worker queue mechanics

`outreach_queue` is a plain Postgres table that the worker treats as a job queue.

### Claiming a job
[`lib/queue.ts:claimNext`](lib/queue.ts):

```sql
-- Step 1: find the oldest pending row whose scheduled_for has elapsed
SELECT id, match_id, action, payload, attempts FROM outreach_queue
 WHERE status = 'pending' AND scheduled_for <= now()
 ORDER BY scheduled_for ASC LIMIT 1;

-- Step 2: atomically flip it to running (only the first writer wins)
UPDATE outreach_queue
   SET status = 'running', locked_at = now(), attempts = attempts + 1
 WHERE id = $1 AND status = 'pending'
 RETURNING ...;
```

If two workers race, only one of the UPDATEs returns a row. The other gets `null` and tries again. We don't run multiple workers, but the design is correct if we do.

### Stale-lock recovery
Worker boot calls [`resetStaleRunningJobs`](worker/src/index.ts) — flips any `status='running'` row whose `locked_at` is more than 5 minutes old back to `'pending'`. Covers the case where a worker crashes mid-job.

### Retry-with-backoff
[`lib/queue.ts:failOrRetry`](lib/queue.ts):

```
attempts = 1 → retry in 5s
attempts = 2 → retry in 10s
attempts = 3 → retry in 20s
attempts = 4 → retry in 40s
attempts = 5 → retry in 80s
attempts = 5+ → mark 'failed' permanently
```

Capped at 5 attempts and 5 minutes between attempts. The job's `last_error` field carries the most recent failure for observability.

### Tick loop
`MAX_PER_TICK = 5` — each worker tick claims and processes up to 5 jobs, with a `SEND_THROTTLE_MS = 4000` pause between sends to avoid Gmail rate-limiting.

The tick is paired with `inboundPoll` via `Promise.allSettled` — outbound queue and inbound poll run independently per cycle. A failure in one never stops the other.

---

## 21. Realtime UI updates

Postgres changes propagate to the browser via Supabase Realtime.

Migrations 0004 and 0010 add `matches`, `conversations`, and `candidates` to the `supabase_realtime` publication. The browser opens WebSocket subscriptions filtered by `job_id` / `match_id`:

```ts
sb.channel(`job-${id}-${rand}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'matches', filter: `job_id=eq.${id}` },
      () => refresh())
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversations' },
      () => refresh())
  .subscribe();
```

The unique random suffix on the channel name prevents Supabase's "cannot add postgres_changes callbacks after subscribe()" error during React StrictMode double-mount.

A polling fallback (every 8s while any match has `status` in `{outreach_sent, replied, follow_up_sent}`) catches the rare case where the WebSocket drops.

The `TranscriptPanel` similarly subscribes filtered by `match_id` so the email thread updates live as the worker writes inbound rows.

The bounce toast subscribes to UPDATE events on `candidates` and fires when `email_invalid` flips false → true.

---

## 22. Failure modes & recovery

| Failure | What happens | Recovery |
|---|---|---|
| OpenAI 429 / 5xx / network | SDK retries up to 5 with backoff; if still failing, queue marks `failed` after 5 tries with last error | Restart worker or fix root cause; pending jobs auto-retry |
| Gmail SMTP rejects | Nodemailer raises; queue retries with backoff | Often transient; check Gmail app password & rate limits |
| Gmail bounce (postmaster reply) | Bounce parser sets `email_invalid=true` on the candidate | Recruiter sees red `invalid` chip; future engages skip them |
| Worker crashes mid-job | Row stuck in `running`; on next worker boot `resetStaleRunningJobs` returns it to `pending` | Automatic on boot |
| Two workers competing | Atomic UPDATE in `claimNext` ensures only one wins | Built-in |
| Recruiter closes job after enqueueing outreach | Per-handler guard re-checks `jobs.status` before sending; aborts silently | Built-in |
| Race: candidate replies twice quickly | `send_followup` re-checks the latest analysis right before sending; skips if already `score_now`/`decline` | Built-in |
| Duplicate candidate uploaded | Detected by lowercased-email match against existing pool; auto-match is **skipped**; recruiter resolves via DuplicatesModal (merge old↔new or keep both) | Manual resolution |
| LLM returns invalid JSON | Zod validation fails; structured-outputs API normally prevents this; if it happens, we throw and the queue retries | Auto |
| Page navigation mid-animation | Motion / AnimatePresence handles cleanly; Supabase channels are torn down in cleanup | Built-in |

---

## 23. Security model

**This is a hackathon project; treat the security model accordingly.**

- **No auth.** Anyone with the URL can read/write everything.
- The worker uses the `service_role` key (full DB access, bypasses RLS).
- The browser uses the `anon` key (read-only against tables not in the realtime publication; full read of `matches`, `conversations`, `candidates` via realtime; writes still go through API routes).
- Resume PDFs are in a private Supabase Storage bucket. Browsers fetch via short-lived **signed URLs** (5-minute TTL) generated by `GET /api/candidates/[id]/resume`.
- Secrets (OpenAI key, Gmail app password, Supabase service-role key) live only in `.env.local` server-side. They are **never** sent to the browser.
- Gmail App Password → if leaked, immediately revoke it via Google Account → Security → 2-Step Verification → App passwords. The API key stops working instantly.
- `WORKER_SHARED_SECRET` is reserved for future web→worker HTTP triggers; currently unused, but generated to keep the door closed.
- Hydration warning suppressed only on `<body>` to silence Grammarly-style browser-extension attribute injection.
- No PII redaction in transcripts. Don't run this against production candidate data without adding auth + RLS + audit logging first.

For productionisation: add Supabase Auth (single recruiter user → row-level security), rotate keys, redact PII in logs, add bounce/spam handling beyond the basic parser, and split the worker per recruiter to scale email sending without crossing accounts.

---

## Where to read code next

If you want to map this doc back to the source:

- The **agent's brain** is [`lib/llm.ts`](lib/llm.ts) — every LLM call lives there with its prompt.
- The **agent's planner** is [`lib/matching.ts`](lib/matching.ts) — `runMatching`, `applyAutoShortlist`, and the auto-engage block.
- The **agent's hands** are [`worker/src/handlers/*.ts`](worker/src/handlers) — sendInitial, sendFollowup, finalizeScore, inboundPoll.
- The **agent's eyes** are [`lib/imap.ts`](lib/imap.ts) and [`lib/bounce.ts`](lib/bounce.ts) — IMAP fetch + bounce detection.
- The **recruiter's window** is [`app/jobs/[id]/page.tsx`](app/jobs/[id]/page.tsx) and [`components/CandidateDrawer.tsx`](components/CandidateDrawer.tsx) — everything the user does flows through these two files.
