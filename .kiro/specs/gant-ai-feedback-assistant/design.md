# Gant — AI Coaching Feedback Assistant — Design

**Status: DRAFT v2 — reflects the 2026-09-03 working session, not yet built.**
**Supersedes:** the v1 draft of this file (same day), which designed a
dedicated `/ai-coach` picker screen and a Gant-initiated clarification model.
Both are replaced below with the actual agreed mechanic: capture and review as
two separate surfaces, entered from the Team page roster.
**Reads with:** `requirements.md` (this folder), `docs/project/GANT-AI-REQUIREMENTS.md`,
`docs/project/GANT-COACH-GUARDRAILS-CONVERSATION-GUIDE.md`.

---

## 1. High-level architecture

Two independent client surfaces, one shared backend call, one shared table.

```
CAPTURE (Section 3)                          REVIEW (Section 4)
──────────────────                           ──────────────────
Team roster → person-detail screen           Pending queue → open one entry
  "+ Add note" (coach/admin only)               │
Games page quick-link → same, team/player        raw input so far
  pre-selected                                   │
  │                                              ▼
  │ dictate/type raw_text                  gant-api.review(entryId)
  ▼                                              │
INSERT gant_pending_entries                      ▼
  (team_id, player_id?, raw_text,          supabase/functions/gant-refine
   event_type?, event_id?, captured_by)          │  [guardrails system prompt (cached)
                                                  │   + accumulated raw_text/rounds]
                                                  ▼
                                          Claude Sonnet → { refinedText, phaseTags }
                                                  |          OR { clarifyingQuestion }
                                                  ▼
                                          Review screen shows one of the two
                                          coach: Tick | Cross | Work on (loop)
                                                  │
                                     Tick ─────────┴───────── Cross
                                       │                         │
                                       ▼                         ▼
                          INSERT into feedback table      DELETE gant_pending_entries row
                          DELETE gant_pending_entries row  (nothing saved)
                                       │
                                       ▼
                    Player/caregiver + coach/admin read via
                    person-detail screen's notes feed (Section 6)
```

**Why two surfaces, not one:** confirmed explicitly by the repo owner — capture
must be buildable and shippable independently of review, so phase 2 (continuous
multi-player dictation, Section 3.2) can later replace *only* the capture side
without touching review, storage, RLS, or the person-detail screen at all.

---

## 2. Data model

### 2.1 Pending entries — new table, not client-local

The v1 draft proposed holding pending drafts client-side. That no longer fits:
Section 5 (requirements) establishes a **queue that persists across sessions**
("quick-fire on the sideline, review later" — potentially a different sitting,
possibly a different device). This needs a **server-side table**.

`gant_pending_entries`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `team_id` | uuid → teams.id | required |
| `player_id` | uuid → users.id NULL | null = team-scoped entry |
| `event_type` | text CHECK ('game','training','video_review') NULL | |
| `event_id` | uuid → events.id NULL | |
| `raw_text` | text | the accumulated coach input — original + every "Work on" round, newline- or JSON-array-joined (pick one at build; a `jsonb` array of `{text, at}` rounds is more useful for the round-count signal, Section 2.4) |
| `last_gant_response` | jsonb NULL | `{ kind: 'refined'|'question', text: string, phaseTags?: string[] }` — cached so re-opening the entry doesn't require an immediate re-call |
| `round_count` | integer DEFAULT 0 | increments on each "Work on" (Req 4.5/10.1) |
| `captured_by` | uuid → users.id | |
| `captured_at` | timestamptz DEFAULT now() | |
| `updated_at` | timestamptz DEFAULT now() | |

RLS: SELECT/INSERT/UPDATE/DELETE restricted to `captured_by = auth.uid()` OR
admin — mirrors the "visible to that coach (and admin)" rule (Req 2.4 in the
original docs, still true here). A row is deleted on both Tick (after the
feedback insert succeeds) and Cross — nothing lingers once resolved (Req 5.3).

> This table is genuinely temporary data (discarded on approval per Req 4.8),
> but it must survive app restarts and backgrounding — hence a real table with
> RLS, not device-local storage. It is a new retention surface and should be
> flagged in the privacy policy pass (Task 12) even though its contents are
> short-lived.

### 2.2 Approved feedback — extend the live `game_feedback` table

Unchanged decision from v1: reuse `game_feedback` (migrations 022 + 025) rather
than a new table — same rationale (existing write path, `game_id` already means
"event id" for any event type).

**Additive migration:**

| Column | Type | Purpose |
|--------|------|---------|
| `event_type` | text CHECK ('game','training','video_review') NULL | capture context — video review uses the same capture flow, just this label (Req 12, resolved) |
| `phase_tags` | text[] DEFAULT '{}' | from Gant's refined response |
| `gant_assisted` | boolean DEFAULT false | internal/reporting only — never shown to players/caregivers (Req 6.4) |
| `round_count` | integer NULL | carried over from the pending entry at Tick time, for the guardrails feedback loop (Section 2.4) — historical record, doesn't change post-save |

`feedback_type`, `player_id`, `feedback_text`, `team_id`, `game_id` (=event
id), `created_by`, timestamps unchanged.

> **Still flagging the latent bug found earlier:** `reporting-api.getGameFeedback()`
> and desktop `GameFeedbackReport.tsx` query dead 4-Moments columns dropped in
> migration 022. Fix in the same pass (Task 2.3), independently shippable.

### 2.3 Person-detail screen reads

No new table needed for the notes feed itself — it's `game_feedback` filtered
by `player_id` (individual, on the person-detail screen) or `team_id` (team
notes, on the Team roster page itself per Req 6.5), ordered `created_at DESC`.
New RLS is needed for who may read (Section 5).

### 2.4 Guardrails feedback-loop signal (Section 10, requirements)

No new table needed beyond what 2.1/2.2 already carry: `round_count` (on both
the pending entry, live, and the saved feedback row, historical) plus the
saved/crossed outcome (crossed entries are deleted per 2.1, so "crossed" as a
signal needs to be captured **before** delete — add a lightweight
`gant_outcomes` log instead of relying on a deleted row):

`gant_outcomes` (small, append-only, admin-read):

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `team_id` | uuid |
| `player_id` | uuid NULL |
| `outcome` | text CHECK ('ticked','crossed') |
| `round_count` | integer |
| `resolved_by` | uuid |
| `resolved_at` | timestamptz |

RLS: admin-only SELECT. Written once per resolved entry (Tick or Cross), right
before the pending row is deleted. This is the data the admin guardrails screen
(Section 4) reports on.

---

## 3. Capture (Section 3, requirements)

### 3.1 V1 — single player/team capture

Client-side only, no Edge Function call at capture time (Req 3.1.2's open
question — **recommend: no refine-on-capture**, refinement is triggered when
the coach opens the entry in Review, not eagerly at capture. This keeps
quick-fire capture fast — dictate, submit, move to the next player — without
waiting on an API round-trip each time. If live-tested experience shows coaches
expect immediate feedback, this can change to "refine eagerly, but let the
coach ignore it and keep capturing" without altering the data model).

- New component, likely `CaptureSheet` — opened from:
  - **Person-detail screen** (Section 4.4 below) — team/player already fixed.
  - **Games page quick-link** — team fixed, player pre-filled if
    `Games.tsx`'s existing `selectedPlayerId` is set (Req 1.3).
  - A generic "capture" entry from the roster itself (select a row → capture,
    without necessarily opening the full detail screen) — reasonable
    alternative to always routing through the detail screen; **decide at
    build time** which is the primary path, they can coexist.
- On submit: `gantApi.createPendingEntry({ teamId, playerId?, rawText,
  eventType?, eventId? })` → inserts into `gant_pending_entries`.
- No response shown beyond "captured" confirmation — coach can immediately
  capture another (Req 3.1.3).

### 3.2 Phase 2 — continuous dictation (not built now, scoped only)

Documented for later, so v1 doesn't foreclose it:
- A longer-running capture mode records continuously; segmentation (by pause
  and/or detected name) happens either on-device or server-side after the fact.
- Name → `player_id` matching against `teamsApi.getTeamPlayers(teamId)`
  (already exists) via fuzzy string matching — **default assumption per Req
  3.2.4: no AI call needed for this step**, plain fuzzy-match library
  (e.g. Levenshtein-based) is very likely sufficient given a bounded roster
  size per team. Confirm with real transcripts before committing.
- Once matched, **the spoken name is discarded** — each resulting chunk becomes
  an ordinary `gant_pending_entries` row (3.1's shape), carrying only
  `player_id`. This is the privacy boundary from Req 3.2.3 — implemented as "the
  matching step is the last place a name exists in memory," not as a policy
  applied later.
- Everything downstream (review, storage, RLS) is **identical** to v1 — this is
  the entire point of separating capture from review.

---

## 4. Review (Section 4, requirements)

### 4.1 Screen

One entry at a time, opened from the pending queue (Section 5) or immediately
after capture if the coach chooses. Layout:
- **Header:** team · player name (or "Team") · event type · date.
- **Original input block:** the coach's raw text as captured (read-only,
  cumulative across "Work on" rounds — show the full history, not just the
  latest round, so the coach can see what's already been said).
- **Gant response block**, one of two visual states:
  - **Refined comment** — normal card styling.
  - **Clarifying question** — distinct styling (e.g. amber/outline vs the
    refined comment's solid card) so the coach instantly knows which mode
    they're in (Req 4.2).
- **Actions**, conditional on the response state (Req 4.3):
  - Refined comment → **Tick** / **Cross** / **Work on**.
  - Clarifying question → **Cross** / **Work on** (no Tick rendered at all).

### 4.2 The loop

- **Work on** opens the same dictate-or-type input used at capture, appends the
  new round to `raw_text` (as a new array element per 2.1's `jsonb` shape),
  increments `round_count`, and calls `gantApi.review(entryId)` again.
- `gant-api.review()` invokes `gant-refine` with **mode: 'review'** and the
  **full accumulated `raw_text` history** (not just the latest round — Gant
  needs the whole conversation to produce a coherent refinement, per Req 4.5).
  The Edge Function decides, from the guardrails + accumulated input, whether
  to return a refined comment or another clarifying question — this decision
  is entirely the model's, there is no separate "is this question answered
  yet" client-side logic.
- **Tick:** `gantApi.approve(entryId)` — server-side (Edge Function or a
  Postgres function, decide at build) atomically: inserts the approved row into
  `game_feedback` (2.2) with `phase_tags`/`round_count` carried over, logs the
  `gant_outcomes` row (`outcome: 'ticked'`, 2.4), then deletes the
  `gant_pending_entries` row. Atomic so a failure can't lose data or double-save.
- **Cross:** `gantApi.discard(entryId)` — logs `gant_outcomes`
  (`outcome: 'crossed'`) then deletes the pending row. Nothing written to
  `game_feedback`.

### 4.3 Edge Function `gant-refine` — request/response shape

```ts
interface GantRefineRequest {
  mode: 'review';
  scope: 'team' | 'player';
  subjectUserId?: string;        // player_id only — never a name (Req 8.1)
  eventType?: 'game' | 'training' | 'video_review';
  rounds: string[];              // accumulated raw input, oldest first
}

interface GantRefineResponse {
  kind: 'refined' | 'question';
  text: string;                  // the refined comment OR the clarifying question
  phaseTags?: string[];          // present when kind === 'refined'
}
```

Same skeleton as the v1 draft (mirrors `send-email`: `Deno.serve`, CORS,
required `Authorization` header, secrets via `Deno.env.get`, guardrails read
from `gant_guardrails` and sent as a cached system block). The only real change
from the v1 draft is the **response shape** (`kind: 'refined'|'question'`
instead of a `clarifyingQuestion?` optional field alongside always-present
refined text) — this makes the two mutually-exclusive UI states in 4.1 a direct
mirror of the API response, no client-side inference needed.

### 4.4 Reaching Review from the person-detail screen

The person-detail screen's notes feed (Section 6) also lists **this coach's own
pending entries for this person** (if any) inline or in a small "pending"
sub-section, so a coach can jump straight into resolving one while already
looking at that player. This satisfies Req 2.1.4 ("add a new note... right
there, in context") for both capturing *and* resolving.

---

## 5. Pending queue

- A dedicated **"My pending notes"** list (reachable from the Coaching tab
  and/or a badge, similar in spirit to the existing Approvals-badge pattern on
  the Team tab — `resolveApprovalsTab` in `main-layout-logic.ts` is a good
  precedent to reuse/extend) — shows every unresolved `gant_pending_entries`
  row for the current coach, grouped or flat (Req 5.2 — **default to flat
  chronological, revisit if it doesn't scale**).
- Tapping an entry opens Review (Section 4) directly.
- Also reachable per-person, inline, per 4.4.

---

## 6. Person-detail screen (Section 1–2, requirements)

New page/route, e.g. `/team/person/:userId` (or a modal over `/team` — decide
at build time based on how deep linking/back-navigation should feel; a full
route is more shareable and survives refresh, consistent with `/team`'s own
routing).

### 6.1 RLS — who can read the notes feed

Additive to `game_feedback`'s existing admin/coach/manager policies:
```sql
-- Player reads their own individual notes + their team's team notes
feedback_type = 'player' AND player_id = auth.uid()
OR (feedback_type = 'team' AND EXISTS (team_members where team_id = feedback.team_id and user_id = auth.uid()))

-- Caregiver reads their linked child's individual notes + that child's team notes
-- (reuse the caregiver-team-access resolver pattern from migrations 060/061)
feedback_type = 'player' AND player_id IN (SELECT player_id FROM player_caregivers WHERE caregiver_id = auth.uid())
OR (feedback_type = 'team' AND team_id IN (child's teams via player_caregivers → team_members))

-- Coach/Admin: already covered by existing policies (any player on a team they coach / any team for admin)
```

### 6.2 UI (v1 scope: notes-only — editable fields removed, Req 2.2/12.5)

- **Notes panel:** summary card (Section 7) pinned at top, then the feed,
  newest first, each row showing text/author/date (Req 2.1.1).
- **Add-note entry point** (coach/admin viewing someone else): a button opening
  the capture sheet (Section 3.1) pre-filled with this player/team, plus the
  "my pending notes for this person" list (4.4).
- **Never render** `gant_assisted`, `round_count`, or any Gant-attribution
  anywhere on this screen (Req 6.4).
- **A logged-in child sees this exact screen for themselves** (Req 6.3) — no
  separate child-view variant needed; the RLS policy (6.1) already covers
  `player_id = auth.uid()` regardless of whether the "player" is an adult or a
  device-logged-in child.

### 6.3 Team-notes location (Req 6.5) — lives on the Team roster page, not here

A "Notes" link/section below the team name on `TeamPage.tsx` itself, **not** a
route off the person-detail screen. Same summary-card + feed pattern as 6.2,
scoped to `feedback_type='team'` + `team_id` instead of `player_id`. Read
access: any member of that team. This is a small, mostly independent addition
to `TeamPage.tsx` — sequence it alongside Task 6, not blocked by it.

### 6.3b Branding — "Progress Notes," one consistent accent colour (Req 12.8/13)

The feature is called **Progress Notes** everywhere in the UI (never "Gant" —
that name stays internal/backstage). It gets **one distinct accent colour**,
not reused from the app's six reserved page colours — recommended a warm
amber/gold (e.g. Tailwind `amber-600`, `#d97706`; confirm exact hex at design
time). Apply it consistently to every Progress-Notes-related element: the
roster links (6.5's team-notes link and this screen's entry point), the
notes-feed panel border/accent on this screen, the capture sheet and review
screen (Section 3/4), the pending-queue badge (Section 5), and the Games-page
quick-link button (Req 1.3). Treat it like the existing page-colour system —
one colour, used everywhere the feature appears, so it's recognisable without
reading the label.

### 6.4 Note on Team page layout (Req 12.6 — deferred, not solved here)

`TeamPage.tsx`'s roster row already renders Make Manager / Make Coach / Give
App Access / Add Player / Remove per-row, gated by `permissions-logic.ts`. This
spec adds a tap-through to the person-detail screen (6.1–6.2) and a
team-level "Notes" link (6.3) on top of that. The repo owner has flagged the
page as already visually crowded — **a layout redesign is out of scope for
this build** and should be scoped as its own follow-up once these additions
exist and the real crowding is visible (or in parallel, if warranted). Do not
solve this by cramming visual changes into this spec's tasks.

---

## 7. Auto-summary

- Triggered either **on screen open** (simple, one extra Gant call per view) or
  **cached and refreshed on new-note-approval** (Req 7.2, still open — design
  leans toward caching, implemented as: `gant-refine` gets a third `mode:
  'summarize'`, called once at Tick-time for the affected player and the result
  stored — e.g. a `latest_summary` column on... there's no natural per-player
  settings row today, so this likely needs a small `gant_player_summaries`
  table (`player_id` PK, `summary_text`, `generated_at`) — **decide at build
  time whether this complexity is worth it over simply calling summarize live
  on every screen-open**, which is far simpler and may be perfectly fine given
  this screen isn't opened at high frequency).
- `mode: 'summarize'` request carries the player's `subjectUserId` plus their
  last 10 notes' text/tags/dates — never their name (Req 7.3).

---

## 8. Guardrails admin screen (Section 9, requirements)

New desktop-only page (admin role), e.g. `src/pages/desktop/DesktopGantSettings.tsx`:
- Form fields mapping to `gant_guardrails`: phases-of-play editor (structured
  list — name + definition, matching the `jsonb` shape), feedback-model text
  area, tone-guide text area (with room for before/after examples).
- A read-only **usage signal panel** (Section 4 below, from the requirements'
  Section 10): a sortable table of recent `gant_outcomes` — round count,
  outcome, team/player, date — so an admin can spot "these keep taking 5+
  rounds" or "these get crossed a lot" and go edit the guardrails fields above.
  Start simple: a plain sortable list is enough for v1 (Req 10.4); pattern-
  detection/aggregation can come later.
- RLS: `gant_guardrails` write + `gant_outcomes` read are both admin-only
  (mirrors `club_settings`, migration 046).

---

## 9. Testing strategy

Same discipline as the rest of this codebase — pure logic unit-tested, RLS/
live paths verified against real Supabase, nothing "done" until proven live.

- **Pure logic (unit):** pending-entry round accumulation, Tick/Cross state
  transitions, privacy stripping (assert no name ever reaches the Anthropic
  call body beyond `subjectUserId`), guardrails-signal aggregation logic.
- **RLS (integration, live):** player reads own notes + team notes only;
  caregiver reads linked child's; a player cannot read another player's notes;
  coach/admin read/write as expected; pending entries visible only to their
  capturing coach + admin.
- **Edge Function:** verify deployed (cannot Deno-run locally, same caveat as
  `send-email`) — scripted calls for: a clean refine, a question round, an
  all-positive input, a multi-round "Work on" sequence ending in tick, one
  ending in cross.
- **Manual live pass:** capture (typed + dictated) → leave pending → reopen
  later → review loop (refine, question, several Work-on rounds) → tick →
  confirm it appears on the person-detail screen for the right viewers only →
  confirm the auto-summary appears and reads sensibly.

---

## 10. Rollout / sequencing

1. **Data model** — `gant_pending_entries`, `game_feedback` additive columns,
   `gant_guardrails`, `gant_outcomes` (Section 2).
2. **Review loop + Edge Function** — the core mechanic (Section 4), testable
   end-to-end even with a manual/temporary way to create a pending entry (e.g.
   direct insert) before capture UI exists.
3. **Capture v1** (Section 3.1) — wire the real capture sheet + pending queue UI
   (Section 5).
4. **Person-detail screen** (Section 6) — RLS + notes feed (notes-only, v1) +
   add-note entry point.
4b. **Team-notes on the Team roster page** (Section 6.3) — small, independent
   addition to `TeamPage.tsx`, sequence alongside 4.
5. **Auto-summary** (Section 7).
6. **Guardrails admin screen + usage-signal panel** (Section 8) — needed before
   real coaches use this meaningfully, but can be built in parallel with 2–5.
7. **Games-page quick link** (Req 1.3) — small, can land any time after 3–4.
8. **Deferred / phase 2:** continuous multi-player dictation (Section 3.2),
   progression review (Req 12.4), session suggestions (Req 12.7), naming
   (Req 12.8), Team page layout redesign (Req 12.6, out of scope for this
   build), editable personal fields (Req 12.5, separate future conversation).

Guardrails content itself (the actual phases/model/tone text) is a **non-code,
gating dependency** — the coach working session — independent of this build
sequence; the engineering can proceed against placeholder guardrails, but Gant
isn't launchable with real content until that session happens.
