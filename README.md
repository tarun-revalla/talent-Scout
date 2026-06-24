# Talent Scout

Talent Scout is an AI-powered hiring platform that automates the most time-consuming parts of recruiting — finding the right candidates, reaching out to them, running interviews, and deciding who to hire.

Instead of spending hours reading resumes, writing emails, and chasing replies, you paste a job description and let the system do the work.

**Try the live MVP:** [Open Jobs →](https://talent-scout-yext.vercel.app/jobs)

For stakeholders (productivity, hosting, security): see [PRODUCT.md](PRODUCT.md).

---

## What it does

### 1. Finds the best candidates automatically

You upload resumes (PDFs, spreadsheets, or zip files) and paste your job description. The AI reads every resume, understands what each candidate brings, and ranks them against your job — not just by keyword matching, but by genuinely understanding fit. You get a ranked list with a clear explanation of why each candidate ranked where they did.

### 2. Reaches out and follows up on your behalf

Once you approve candidates to contact, the system sends personalised emails written specifically for each person — referencing their actual experience. When candidates reply, the system reads the response, decides if it has enough information or needs to ask more questions, and sends a smart follow-up if needed. Every follow-up question is tailored to what that specific candidate has and hasn't said yet (e.g. if they haven't mentioned their start date, the follow-up asks about it — if they already mentioned salary, it doesn't ask again).

### 3. Scores each candidate on two dimensions

Every candidate ends up with two scores:

- **Match score** — How well does their background fit your requirements?
- **Interest score** — How genuinely interested and available are they?

You can adjust how much weight you give each score depending on what matters more for your specific role.

### 4. Manages the entire interview process

You set up interview rounds (phone screen, technical, behavioural, final) once per job. As candidates advance, the system coordinates scheduling — finding times that work for both the candidate and your interviewers, sending calendar invites, and handling rescheduling if needed. Candidates receive a simple link; no app download required.

### 5. Collects feedback and surfaces consensus

After each interview round, interviewers fill in a structured feedback form. The system then aggregates all the feedback and tells you: did the panel agree, or was there disagreement? If one interviewer rated a candidate significantly differently from everyone else, it flags that so you can investigate before making a decision.

### 6. Helps you compare final candidates

When you're down to your last few candidates, you can pull up a side-by-side comparison — seeing their match scores, interest scores, and interview ratings next to each other. You can adjust how much each dimension matters (e.g. prioritise technical fit vs. enthusiasm) and the system re-ranks them in real time. You can export this comparison as a spreadsheet to share with your hiring committee.

### 7. Shows you where your hires are coming from

The analytics dashboard shows how long it takes to go from sourcing a candidate to making a hire, which source of candidates (PDF uploads, CSV imports, etc.) produces the best outcomes, and how your pipeline looks month over month.

---

## Who it's for

Talent Scout is built for **recruiters and hiring managers** at companies running active hiring pipelines. It works best when you have a pool of candidates to evaluate — it's not a job board or sourcing tool, but it handles everything after you have resumes in hand.

---

## How to get started (for recruiters)

### Step 1 — Create a job

Go to **Jobs → New Job**. Paste your job description into the text box and click Parse. The system will read it and extract the key details (title, required skills, experience level, salary range, location). Review what it extracted and adjust if anything looks off, then save.

### Step 2 — Upload candidates

Go to **Candidates**. Drag and drop resume files — PDFs, CSVs, or a ZIP of PDFs. The system processes them automatically. Each candidate gets embedded into the system and matched against all your open jobs.

### Step 3 — Review matches

Open your job. Click **Find Matches**. The system scores every candidate against this job and shows you a ranked list. Each row shows the match score, a brief explanation (matched skills, gaps, experience fit), and their pipeline status.

Click any row to open the candidate drawer — you'll see their full profile, any email conversation history, and their interest score if you've already reached out.

### Step 4 — Start outreach

Check the box next to candidates you want to reach out to and click **Engage**. The system queues personalised emails. They go out automatically and replies come back into the dashboard.

You'll see interest scores update in real time as candidates reply. Candidates who need a follow-up get one automatically.

### Step 5 — Move to interviews

Once a candidate has a good combined score and has expressed genuine interest, click **Start Interview** to move them into your interview loop. The system proposes available times, the candidate picks one via a link in their email, and the interview is scheduled — no back and forth.

### Step 6 — Collect feedback and decide

After each round, interviewers get a link to submit their feedback (rating, recommendation, notes). Once all feedback is in for a round, you see the panel consensus and can advance or reject the candidate with one click.

### Step 7 — Compare finalists and hire

When you have 2–5 finalists, use **Compare Candidates** to see them side by side. Adjust the weight sliders to match your priorities and export the comparison to share with your team. When you're ready, mark the hire.

---

## Setting up interviewers

Go to **Interviewers** (within a job's settings). You can add people one at a time or bulk-import a spreadsheet with columns: `name`, `email`, `timezone`, `roundIndex`, `bufferMinutes`.

The system reads each interviewer's public Google Calendar to find when they're free. When a candidate needs to schedule, it automatically finds a time that works for everyone.

---

## Analytics

Go to **Analytics** to see:

- **Funnel** — how many candidates went from sourced → contacted → replied → interested → interviewed → hired
- **Time to hire** — median and average days from first contact to offer accepted
- **Source breakdown** — which upload type (PDF batch, CSV, etc.) produces the most hires
- **Cohort analysis** — how candidates sourced in different months performed over time

Select a specific job from the filter at the top to see job-level data. Global view shows everything across all jobs.

---

## Notifications

If you connect Slack, the system posts to your configured channel whenever a candidate replies, advances to a new stage, schedules an interview, or is marked as hired.

---

## Common questions

**Does it send real emails?**
Yes. It uses a Gmail account you connect. Outgoing emails come from that address and replies go back to the same inbox, which the system reads automatically.

**Do candidates need to install anything?**
No. They receive emails with plain links. Interview scheduling, application forms, and rescheduling all happen in their browser with no login required.

**Can I customise the emails?**
Yes. Each job has an email settings panel where you can set the recruiter name, customise the initial outreach template, and change what questions are asked in follow-ups.

**What happens if a candidate bounces?**
The system detects the bounce automatically, flags that candidate's email as invalid, and stops sending to them. You'll see a badge on their profile.

**Can the same candidate apply to multiple jobs?**
Yes. Candidates live in a shared pool. The same person can be matched, scored, and emailed independently for each job.

**How do I stop outreach on a job?**
Either set the job to **Closed** (stops all new outreach) or toggle **Auto-engage** off in the job's matching settings.

---

## Setup (for developers)

- **Stakeholders / PMs:** [PRODUCT.md](PRODUCT.md) — try link, productivity, hosting, security (plain language)
- **Engineers:** [TECHDETAILS.md](TECHDETAILS.md) — architecture, env vars, migrations, deployment
