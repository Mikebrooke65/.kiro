# Gant — AI Coaching Feedback Assistant — Design

**Status: DRAFT — for review, not yet built.**
**Date: 2026-09-03.**
**Reads with:** `requirements.md` (this folder), `docs/project/GANT-AI-REQUIREMENTS.md`,
`docs/project/GANT-COACH-GUARDRAILS-CONVERSATION-GUIDE.md`.

This design translates the requirements into concrete architecture, data model,
and integration points, using the patterns already proven in this codebase
(`send-email` / `redeem-invite` Edge Functions, `game_feedback` model,
`useClubBranding`, the Coaching/Games team-selector flow).

---

## 1. High-level architecture

```
Coach (Coaching tab → Gant screen, mobile/desktop)
  │  raw text (typed or on-device speech-to-text)
  ▼
src/lib/gant-api.ts  (client wrapper, extends ApiClient)
  │  invoke Edge Function with { userIdContext, rawText, phaseHints?, history? }
  ▼
supabase/functions/gant-refine  (Deno, service-role NOT needed for the AI call;
  │                              needs caller auth header like send-email)
  │  reads ANTHROPIC_API_KEY + CLUB_* from secrets
  │  builds [ guardrails system prompt (cached) + raw text + minimal history ]
  ▼
api.anthropic.com/v1/messages  (Claude Sonnet, prompt caching on the system block)
  │  refined text + phase tag(s) + optional clarifying question
  ▼
Edge Function returns structured JSON to the app
  ▼
Coach reviews → edits → Approve  →  gant-api saves to feedback table (client insert
                                    under existing RLS, OR a save endpoint)
  │
  ▼
Player / Caregiver (Team view) reads approved feedback under NEW RLS policies
```

Two independent server capabilities:
- **`gant-refine`** — the AI call. Stateless per request; holds no feedback.
- **Persistence** — approved feedback is written to the feedback table. Preferred:
  a normal authenticated client insert under existing+new RLS (like
  `gamesApi.createGameFeedback` does today), so we don't route writes through
  service role unnecessarily. A dedicated `gant-save` endpoint is only needed if
  we want the server to enforce raw-input disposal or attach server-side audit.

**Why the AI call is its own Edge Function and not client-side:** the Anthropic
key must never ship in the Capacitor bundle (Req 7.3), and server-side templating
keeps the guardrails/system prompt out of client code (mirrors why `send-email`
builds templates server-side).

---

## 2. Data model

### 2.1 Feedback table — decision: extend, don't replace (Req 5.2)

Reuse the **live `game_feedback` table** (migrations 022 + 025), relaxing its
meaning from "game feedback" to "event feedback". Rationale: its `game_id`
already references `events.id` (any event type), the write path
(`gamesApi.createGameFeedback`) and `Games.tsx` capture UI already exist, and a
rename/migration of a live table with data carries more risk than additive
columns. We keep the table name for now to avoid a churny rename, and document
that `game_id` means "event id" (as migration 025's own comment already says).

> Alternative considered: a fresh `event_feedback` table + deprecate
> `game_feedback`. Cleaner name, but more migration surface and it strands the
> existing `Games.tsx` flow. Rejected for V1; revisit if a rename becomes worth
> it during the V1.R data-retention work.

**Additive migration (new columns on `game_feedback`):**

| Column | Type | Purpose |
|--------|------|---------|
| `event_type` | `text CHECK IN ('game','training','video_review')` NULL | Capture context when not derivable from the linked event (esp. video review, Req 5.3). Nullable for backward compatibility with existing rows. |
| `phase_tags` | `text[] DEFAULT '{}'` | Phase-of-play tag(s) Gant assigned (Req 3.2, 6.2). Enables progression grouping (Section 11) and future report roll-up. |
| `gant_assisted` | `boolean DEFAULT false` | Internal/audit only — was this refined via Gant. **Never exposed to players/caregivers** (Req 6.4/8.3). |
| `source` | `text` NULL | Optional provenance ('gant','manual') for reporting; overlaps `gant_assisted`, pick one in build. |

`feedback_type`, `player_id`, `feedback_text`, `team_id`, `game_id`(=event id),
`created_by`, `updated_by`, timestamps stay as-is.

> **Also fix a latent bug found during context-gathering:** `reporting-api.ts
> getGameFeedback()` and desktop `GameFeedbackReport.tsx` still select dead
> "4-Moments" columns (`attacking_www`, `key_areas`, …) that migration 022
> dropped. Not caused by Gant, but this spec touches the same table — flag it and
> fix it in the same pass (either repoint the report at the live `feedback_text`
> shape or remove the dead query). Track as a separate task so it can ship
> independently.

### 2.2 Raw/pending capture — client-local, not a server table

Raw observations and pending refined drafts are **transient** (Req 4.5: raw
input is discarded on approval). Options:

- **Preferred:** hold pending drafts **client-side** (in-memory + a local
  persistence layer for the offline queue, Req 9.2) until approved; only the
  approved result is persisted server-side. This makes "discard raw on approve"
  automatic and keeps unrefined text off the server entirely (strongest privacy
  story, Req 2.4/7).
- If a coach needs pending drafts to survive app restarts / cross-device, a
  short-lived `gant_pending` table (owner-only RLS, auto-expiry) would be needed.
  Adds a retention surface — only do this if the offline/multi-device
  requirement demands it. **Decide in build; default to client-local.**

### 2.3 Guardrails storage (Req 10.2)

A single-row-ish config, editable without redeploy, admin-writable:

`gant_guardrails` table:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | boolean PK default true | single-row pattern (mirrors `club_settings`) |
| `phases_of_play` | `jsonb` | list of `{ name, definition, category? }` |
| `feedback_model` | `text` | the "what good feedback contains" rules |
| `tone_guide` | `text` | phrasing rules + before/after examples |
| `system_prompt_override` | `text` NULL | optional fully-assembled prompt escape hatch |
| `updated_at` | `timestamptz` | |

RLS: any authenticated coach/admin may READ (the Edge Function reads it under the
caller's context or service role); only `role='admin'` may WRITE — mirror
`club_settings` policies (migration 046). The Edge Function assembles the system
prompt from these fields (or uses `system_prompt_override` if present) and sends
it as a **cached** system block to Anthropic (Req 10.3).

> Club-agnostic (Req 13.3): guardrails are club *data*, not code — another club
> edits this row, no rebuild.

---

## 3. Edge Function: `gant-refine`

Mirror `send-email`'s skeleton:

- `Deno.serve`, `corsHeaders`, OPTIONS preflight branch.
- **Require an `Authorization` header** (401 if absent) — Gant refinement is a
  club/AI-cost-bearing action, not anonymous. Unlike `redeem-invite`, there is no
  reason to allow unauthenticated access.
- Read secrets: `ANTHROPIC_API_KEY` (required), plus optional `CLUB_NAME`,
  `CLUB_COLOR` etc. only if the prompt needs club context (Req 13.2). Guardrails
  come from `gant_guardrails` (Section 2.3), read at request time.
- Request body (structured, never raw HTML/branding from client):
  ```ts
  interface GantRefineRequest {
    mode: 'refine' | 'clarify';
    rawText: string;               // the coach's observation (or clarification answer)
    feedbackScope: 'team' | 'player';
    // NO names/emails/DOB. Player identity is a userId only (Req 7.1):
    subjectUserId?: string;        // when feedbackScope === 'player'
    eventType: 'game' | 'training' | 'video_review';
    conversation?: { role: 'assistant' | 'user'; text: string }[]; // clarification loop
    history?: { text: string; phaseTags: string[]; date: string }[]; // Req 11, userId-keyed upstream
  }
  ```
- Response:
  ```ts
  interface GantRefineResponse {
    refinedText: string;
    phaseTags: string[];
    clarifyingQuestion?: string;   // present when Gant needs more (Req 4.1)
    progressionNote?: string;      // Req 11 (same/new issue prompt)
  }
  ```
- Anthropic call: `POST https://api.anthropic.com/v1/messages`, model = Claude
  Sonnet (confirm exact model id at build — docs say "Sonnet 5"), `Bearer`/
  `x-api-key` per Anthropic's current header spec, **prompt caching** on the
  guardrails system block (`cache_control`).
- **Privacy enforcement (Req 7.1):** the function must reject / strip any
  obviously-identifying fields; only `subjectUserId`, text, tags, dates go
  outward. Keep the boundary in one place.
- Errors: on Anthropic failure/timeout, return a clear error so the client can
  mark the entry "not yet refined" and offer retry (Req 3.4) — never lose raw
  text.
- **Deploy:** `supabase functions deploy gant-refine`; `supabase secrets set
  ANTHROPIC_API_KEY=…` (handed over via a file outside the repo, never pasted in
  chat — project standard). **Not** shipped by `git push`.

---

## 4. Client: `src/lib/gant-api.ts`

Extends `ApiClient` (like `games-api.ts`). Methods:

- `refine(req: GantRefineRequest): Promise<GantRefineResponse>` — wraps
  `supabase.functions.invoke('gant-refine', …)`, unwrapping non-2xx errors into
  readable messages (copy `email-api.ts`'s error unwrap).
- `saveFeedback({ eventId, teamId, feedbackType, playerId?, feedbackText,
  eventType, phaseTags, gantAssisted })` — inserts into the feedback table via
  the existing authenticated client path (reuse/extend
  `gamesApi.createGameFeedback` rather than duplicating).
- `getMyFeedback(...)` / `getFeedbackForPlayer(playerId)` /
  `getTeamFeedback(teamId)` — reads for the player/caregiver view (Section 6),
  relying on RLS to scope results.
- Progression helper: assemble the userId-keyed `history` for a player from prior
  approved feedback before calling `refine` (Req 11), so no identifying data is
  gathered client-side beyond the id.

---

## 5. Coach UI flow (replaces `AICoach` stub)

Route `/ai-coach` (Req 1.1), green Coaching colour `#22c55e`, `pb-20` for nav
clearance. Mobile-first; a desktop equivalent under `src/pages/desktop/` follows
the existing split/table layout patterns.

Flow:
1. **Context bar:** team selector (reuse Coaching/Games pattern), scope toggle
   Team | Player, player picker (roster via `gamesApi.getTeamPlayers`), event
   picker (event via `eventsApi.getEventsByType`), event-type derived or chosen.
2. **Capture:** big record/type control. Dictation button uses the on-device
   speech plugin (Section 8); typing always available. On stop/submit → create a
   pending entry and fire `gant-api.refine` automatically (Req 3.1).
3. **Refined draft card:** shows refined text (editable), phase tags, and — if
   present — the clarifying question with an answer box (Req 4.1) and/or a
   progression note (Req 11). Actions: **Approve & save**, **Refine again**,
   **Next observation** (leave pending).
4. **Pending review list:** entries not yet approved for this session, workable
   in any order (Req 4.4); badge/count so the coach knows what's outstanding.
5. On **Approve**: `saveFeedback`, then discard the raw text for that entry
   (Req 4.5).

Gate the whole screen on coach-authority (Req 1.2 / 6.3) — same rule as
`tabsForRole`'s `showCoaching` / the write RLS.

---

## 6. Player / caregiver view (Team view) — Req 8

**New RLS first, then UI.** Nothing renders to a player/caregiver until 8.5's
policies exist.

### 6.1 RLS (additive to existing coach/manager/admin policies)

On the feedback table:
- **Player read:**
  ```sql
  feedback_type = 'team' AND EXISTS (team_members where team_id = feedback.team_id and user_id = auth.uid())
  OR (feedback_type = 'player' AND player_id = auth.uid())
  ```
- **Caregiver read:** team feedback for a team their linked child is on, plus
  individual feedback where `player_id` is a child linked via `player_caregivers`
  to `auth.uid()`. Reuse the caregiver-team-access resolver pattern established
  by migrations 060/061 (caregivers reading a linked child's team) so this stays
  consistent with existing caregiver visibility.

### 6.2 UI

Surface in the Team view (`TeamPage.tsx`) — likely a per-person expandable
section or a dedicated "Feedback" area. **Contents blocked on Req 8.4** (user's
cut-off sentence). Minimum once confirmed:
- individual feedback about me/my child, newest first, grouped by event/date;
- team feedback for the team;
- (candidate) a progression view grouped by `phase_tags` over time.
Never show `gant_assisted`/source (Req 8.3).

---

## 7. Guardrails system prompt assembly

The Edge Function builds:
```
[system, cache_control=ephemeral]:
  You are assisting a football coach... (fixed instructions: refine only, never
  invent a work-on, all-positive allowed, ask a clarifying question when a phase
  is ambiguous, keep the coach's voice, ~3 rounds).
  PHASES OF PLAY: <gant_guardrails.phases_of_play>
  FEEDBACK MODEL: <gant_guardrails.feedback_model>
  TONE GUIDE: <gant_guardrails.tone_guide>
[user]:
  scope + eventType + rawText (+ prior conversation turns for clarify mode)
  (+ userId-keyed history for progression)
```
Prompt caching applies to the large, stable system block (Req 10.3). Editing the
`gant_guardrails` row changes behaviour with no redeploy (Req 10.2).

---

## 8. Speech-to-text / offline (Req 9)

- Add a Capacitor speech-recognition plugin (or a Web Speech API path for the
  browser build). **Confirm offline support** (Req 9.4) — determines:
  - **9.2 text queue (preferred):** transcribe on-device, queue raw *text*
    locally when offline; flush to `gant-refine` when back online.
  - **9.3 audio queue (fallback):** queue audio locally, transcribe on-device
    when online, delete audio immediately after (Req 7.4) — **and add a privacy-
    policy clause**.
- Local queue: a small persisted store (e.g. a local table / storage) holding
  pending raw entries + their context, retried on reconnect. This is also the
  natural home for pending drafts (Section 2.2).

---

## 9. Testing strategy

Mirror the project's discipline (pure logic unit-tested; live paths verified
against Supabase; nothing "done" until proven live):
- **Pure logic (unit):** prompt assembly, privacy stripping (assert no
  name/email/DOB can leave), phase-tag parsing of Anthropic responses,
  offline-queue enqueue/flush ordering, review-list ordering.
- **RLS (integration, live):** a player sees only their own individual + team
  feedback; a caregiver sees their linked child's; a coach/manager/admin
  unaffected; a player cannot read another player's individual feedback.
- **Edge Function:** cannot be Deno-run locally here (same caveat as
  `send-email`) — verify deployed against a real key with a scripted call; assert
  a clarifying-question round-trip and an all-positive input.
- **Manual live pass:** capture (typed + dictated) → auto-refine → clarify →
  approve → player/caregiver sees it; offline capture → reconnect → refine.
- Do not add tests the user didn't ask for beyond what verifies these paths.

---

## 10. Rollout / sequencing notes

- **Guardrails are the gate on quality**, not engineering (Req 10.4). The stack
  can be built and tested against placeholder guardrails, but Gant is not
  launchable until the coach working session produces real ones.
- Edge Function + secret are a **manual deploy step** (`supabase functions
  deploy` + `supabase secrets set`) — call it out at PR/handover time; it does
  not ride `git push kiro prototype`.
- **Cost/latency:** the clarification loop is multiple API round-trips on a
  mobile network — test pitch-side conditions, keep the system prompt cached.
- Ship in slices: (1) coach capture+refine+approve for **game** feedback reusing
  the existing table; (2) player/caregiver view + RLS; (3) training/video-review
  event types; (4) progression review; (5) session suggestions. Slices 4–5 can be
  a Gant "phase 2".
