# Gant — AI Coaching Feedback Assistant — Requirements

**Status: DRAFT — for review, not yet built.**
**Date: 2026-09-03.**
**Origin:** Gant was scoped as future V2 work in two planning docs
(`docs/project/GANT-AI-REQUIREMENTS.md` and
`docs/project/GANT-COACH-GUARDRAILS-CONVERSATION-GUIDE.md`). The repo owner is
now considering pulling it forward ahead of its V2 slot (flagged in
`NEXT-SESSION-NOTES.md`). This spec turns those planning docs into a buildable
requirements set, grounded in how the app's feedback/coaching code actually
works today.

**Source of truth for intent:** the two Gant docs above. Where this spec and
those docs disagree, the docs win and this spec should be corrected. This
document only adds the engineering detail (data model, RLS, integration points,
build sequence) they deliberately left out.

---

## 0. Scope and non-goals

**In scope (V1 of Gant):**
- A **coach-facing** capture-and-refine flow, reached from the Coaching tab,
  that turns a coach's raw dictated/typed observation into structured,
  club-standard feedback about a **team** or an **individual player**, tied to a
  specific event (game / training / video review).
- A **player/caregiver-facing** view of approved feedback, surfaced in the team
  view, so a player (or a child's caregiver) can see feedback written about
  them — see Section 8. **⚠️ OPEN — the user's description of this view was cut
  off mid-sentence ("...where they can see more things about them, including
  ___"). Section 8.4 lists the candidate contents; the exact list must be
  confirmed before build.**
- The Gant guardrails as an editable **system prompt** (phases of play, feedback
  model, tone guide) — not hardcoded, not fine-tuned.

**Explicitly NOT in scope for this spec (deferred, per the Gant docs):**
- **Player-facing self-reflection** where Gant converses directly with a child
  (Gant docs §13.2 / guardrails guide Part 5). This is a separate safety/design
  problem and must get its own spec. Gant here only ever talks to coaches.
- **Auto-populating the biannual report card** from accumulated feedback (Gant
  docs §13.1). Design the data model so this stays *possible* later, but do not
  build it now.
- Any change to the existing lesson/session **rating** feedback
  (`session_feedback`, `lesson_feedback`) — those are a different, coach-only
  reporting concern and Gant does not touch them.

---

## 1. Coach entry point (Coaching tab)

**Current state (verified):** `src/pages/AICoach.tsx` is a stub rendering "AI
coaching features (future release)". It is routed at `/ai-coach`
(`ProtectedRoute` allowing ADMIN, MANAGER, COACH). The Coaching page
(`src/pages/Coaching.tsx`) already has a black **"Ask AI Coach"**
`<Link to="/ai-coach">`, and its subtitle already advertises an "AI coaching
assistant". The Coaching bottom tab is shown only to ADMIN / COACH / anyone with
coach authority on a team (`tabsForRole` in `src/lib/main-layout-logic.ts`).

- **1.1** — Gant's coach experience replaces the `AICoach` stub at `/ai-coach`
  (or a clearly-named successor route). The "Ask AI Coach" button remains the
  entry point.
- **1.2** — Access is restricted to users who can legitimately give feedback:
  **Coach and Admin**, plus a Manager only if they hold coach authority on a
  team (`is_coach`). Resolve the existing route mismatch: `/coaching` is
  ADMIN+COACH only while `/ai-coach` currently also allows plain MANAGER. Gant
  capture must gate on the **same** rule as the ability to write `game_feedback`
  (see Section 6 RLS), so a user who cannot save feedback is never offered the
  capture flow.
- **1.3** — The coach first selects the **team** the feedback is about (reuse
  the Coaching/Games team selector pattern — `teamsApi.getMyTeams`, auto-select
  when there is only one team), then whether this is **team** feedback or
  **individual player** feedback (and which player, from the team roster).
- **1.4** — The coach selects the **event context**: which event this feedback
  is about (a game / training / video-review event), consistent with the
  events model (Section 5).

---

## 2. Capture — live and reflective

Per Gant docs §3. Two usage patterns, one underlying capture primitive.

- **2.1** — The coach captures a **raw observation** as free input. Input may be
  **dictated** (speech-to-text) or **typed**. Typed input must always work; the
  dictation path is additive (see Section 9 for the speech dependency).
- **2.2** — **Live capture:** at a game/training, the coach can capture raw
  observations in quick succession for different players/moments without being
  forced to review or approve each one before starting the next. Each capture
  produces its own pending entry.
- **2.3** — **Reflective capture:** at home / reviewing video, the same capture
  primitive is used with no time pressure. The only difference is event type
  (video review) and pace — not a separate code path.
- **2.4** — A raw entry is held in an **unrefined, in-progress state visible only
  to its author coach (and admins)** until the coach approves its refined output
  (Section 4). Raw input is never visible to players, caregivers, or other
  coaches.

---

## 3. Automatic refinement (Gant)

Per Gant docs §4.2.

- **3.1** — Immediately after a raw entry is captured, Gant **automatically**
  produces a refined draft — no coach action required to trigger it. Refinement
  runs a server-side call to the Anthropic API (Claude Sonnet) via a Supabase
  Edge Function (Section 7 / design).
- **3.2** — Refinement checks the raw observation against the club's
  **guardrails** (phases-of-play list, feedback model, tone guide — Section 10)
  supplied as the system prompt, and returns:
  - cleaned-up, structured feedback text in the club's tone,
  - a **phase-of-play tag** (or tags) where identifiable,
  - optionally, a **clarifying question** for the coach (Section 4).
- **3.3** — **All-positive feedback is allowed** (Gant docs §12, decided). Gant
  must not manufacture a "work-on" when the genuine observation is entirely
  positive.
- **3.4** — If refinement fails or times out (API error, no connectivity), the
  raw entry is preserved and clearly marked "not yet refined"; the coach can
  retry. Failure must never lose the coach's raw observation. See Section 9 for
  the offline queue.

---

## 4. Clarification loop and approval

Per Gant docs §4.3–§4.6.

- **4.1** — When Gant returns a clarifying question, the coach can answer it, and
  Gant re-refines with that added context. **~3 rounds is the expected typical
  resolution** (≈90% of entries). **OPEN:** whether a hard ceiling exists (e.g.
  fall back to manual editing after N rounds) — carry the Gant-doc open question
  (§11), decide before build.
- **4.2** — At any point after a refined draft appears, the coach can:
  - **Approve/save it** — it becomes stored, approved feedback subject to the
    visibility rules (Section 8), OR
  - **Send it back for further refinement** (the clarification loop), OR
  - **Move straight on to capturing the next observation**, leaving this draft
    pending.
- **4.3** — The coach can always **edit the refined text directly** before
  approving. Gant assists; the coach retains full editorial control (Gant docs
  §1). The saved feedback is whatever the coach approved, not necessarily
  verbatim Gant output.
- **4.4** — A **pending review list** shows the coach all their unapproved
  refined drafts for a session, workable in any order; each is either
  approved/saved or sent back. Both instant-approve and deferred-approve are
  first-class paths (Gant docs §4.6). **OPEN (Gant docs §11):** review-list UX
  (flat chronological / grouped by player / sorted by "needs attention") — a
  quick coach input item, decide in design.
- **4.5** — **Raw input is discarded once its refined output is approved/saved**
  (Gant docs §4.7 / §8). Unrefined raw text is not retained after approval.

---

## 5. Event context and metadata

**Current state (verified):** games are events (`events.event_type='game'`);
live `game_feedback.game_id` references `events.id` (migration 025). Event types
are `game` / `training` / `general` (migration 023). Today **only game events
have a feedback table wired to them** — training and "video review" do not exist
as feedback-bearing contexts yet.

- **5.1** — Every approved feedback entry is captured against: **date**, **event
  type** (game / training / video review), **team**, and **player** (when
  individual). (Gant docs §4.4.)
- **5.2** — Because feedback must attach to training and video-review as well as
  games, this spec **generalises the feedback-to-event link**. Two options for
  design to choose between:
  - (a) keep the `game_feedback` table but relax its meaning to "event feedback"
    (its `game_id` already points at `events.id`, which can be any event type),
    or
  - (b) introduce a clearly-named `event_feedback` table and migrate/deprecate
    `game_feedback`.
  **Decision belongs in design.md.** Requirement: individual and team feedback
  can be tied to a game, a training event, or a video-review event.
- **5.3** — "Video review" is a capture context, not necessarily a scheduled
  event. Design must decide whether a video-review entry references an existing
  event, a lightweight ad-hoc event, or no event (team/player + date only).

---

## 6. Feedback storage, roles, and write access

**Current state (verified):** `game_feedback` RLS allows SELECT/INSERT for
admins, coaches (via `team_members.role='coach'`), and managers (member of the
team); UPDATE/DELETE only by the `created_by` coach/manager. There is **no
player or caregiver read policy**.

- **6.1** — Approved Gant feedback is stored in the live feedback table
  (per Section 5.2's decision), reusing existing columns where possible:
  `feedback_type ('team'|'player')`, `player_id`, `feedback_text`, `team_id`,
  the event link, and audit fields (`created_by`/`updated_by`).
- **6.2** — New columns Gant needs (design to finalise): the **phase-of-play
  tag(s)**, the **event type** (if not derivable from the linked event), and a
  flag/marker that the entry was Gant-assisted **for internal/audit use only**
  (never shown to players/caregivers — see 8.3).
- **6.3** — Write access (who can create/refine/approve) matches the existing
  coach/admin (+coach-authority manager) rule. A user who cannot write
  `game_feedback` cannot use Gant capture (ties to 1.2).
- **6.4** — Gant is **not disclosed** as the author. Stored feedback is attributed
  to the coach (`created_by`). No "generated by AI" flag is ever surfaced to
  players or caregivers (Gant docs §12, decided).

---

## 7. Privacy and AI-layer constraints

Per Gant docs §8–§9. These are hard constraints.

- **7.1** — Only a **User ID** (and the feedback text/observation) is sent to the
  Anthropic API. **No** player/coach name, email, phone, or date of birth is
  passed to the AI layer.
- **7.2** — Past-feedback history sent for progression review (Section 11) is
  likewise keyed by User ID only, carrying feedback text/tags/dates — never
  identifying fields.
- **7.3** — The Anthropic API key lives **only** as a Supabase secret, read
  server-side in the Edge Function, never shipped in the app bundle (mirror the
  `send-email` `RESEND_API_KEY` pattern).
- **7.4** — Raw audio (if the dictation fallback records audio at all) **never
  leaves the device** and is deleted immediately after on-device transcription
  (Gant docs §6). Only text transits to the backend.
- **7.5** — Approved feedback is personal information under the NZ Privacy Act
  2020 and is retained under the same rules as other personal data (ties to the
  V1.R retention work and the privacy policy). Raw/unrefined input is not
  retained (4.5). **The privacy policy must gain a Gant section before any
  public/store release** — cross-reference `docs/privacy-policy-draft.md`.

---

## 8. Player / caregiver-facing feedback view

**This is the second half of the user's request** — feedback made available to
the team and/or player via their team view. **Current state (verified):** there
is **no** player-facing feedback surface anywhere, and `game_feedback` RLS does
**not** let a player or caregiver read feedback about themselves. Both a new UI
surface and a new RLS policy are required — this is greenfield.

- **8.1** — A player can see **individual** feedback approved about **them**. A
  child never logs in as themselves for this in the current model — their
  **caregiver** sees the child's individual feedback, routed through the
  `player_caregivers` link. (Note: the "Streamlined Invites & Child Access" spec
  introduced child device-login; design must confirm whether a logged-in child
  also sees their own feedback, or only the caregiver does.)
- **8.2** — **Team** feedback is visible to the whole team (all members of that
  `team_id`). Individual feedback is visible **only** to that player and their
  caregiver(s) — never to other players/caregivers.
- **8.3** — Feedback is presented **as from the coach**. No indication that Gant
  was involved is ever shown to players/caregivers (ties to 6.4 / Gant docs §12).
- **8.4** — **⚠️ OPEN — content of the player's team view.** The user's request
  ("...where they can see more things about them, including ___") was cut off.
  Candidate contents to confirm:
  - the player's own approved individual feedback, newest first, by event/date;
  - the team feedback for their team;
  - a per-player **history / progression** view (ties to Section 11) — e.g.
    feedback grouped by phase of play over time;
  - possibly their attendance/RSVP history, position, or other profile facts
    already in the app.
  **Do not build 8.4 until the intended list is confirmed with the user.**
- **8.5** — New RLS policies implement 8.1–8.2 on the feedback table:
  - a player SELECT policy: `feedback_type='team'` for a team they belong to, OR
    (`feedback_type='player'` AND `player_id = auth.uid()`);
  - a caregiver SELECT policy: `feedback_type='player'` AND `player_id` is a
    child linked to `auth.uid()` via `player_caregivers`, plus team feedback for
    that child's team.
  These are additive to the existing coach/manager/admin policies.

---

## 9. Offline / dictation handling

Per Gant docs §6, §9. **Current state (verified):** no speech/mic Capacitor
plugin is installed; no dictation code exists.

- **9.1** — Speech-to-text runs **on-device** (native iOS/Android recognition
  via a Capacitor plugin, or a Web Speech path). Adding that plugin is part of
  this build. Audio is not sent to Supabase or Anthropic — only text (Gant docs
  §9).
- **9.2** — **Preferred: text-level offline queue.** When connectivity is
  patchy pitch-side, the raw *text* is captured and queued locally; only the
  Gant refinement call waits for connectivity. When it returns, queued items are
  sent to the Edge Function and refined as normal (Gant docs §6 flow).
- **9.3** — **Fallback: audio-level offline queue**, used only if on-device
  speech-to-text turns out to need connectivity. Audio is held locally,
  transcribed on-device once back online, then deleted (7.4). **This path
  requires a privacy-policy addition** — flag it if taken.
- **9.4** — **To confirm during design/build:** whether the chosen Capacitor
  speech plugin supports fully offline recognition (determines 9.2 vs 9.3). This
  is the Gant-doc §11 open question for Kiro.

---

## 10. Guardrails (system prompt)

Per Gant docs §9 and the guardrails conversation guide. **This is the true
dependency for quality — engineering is straightforward; the guardrails are
what make Gant useful.**

- **10.1** — The guardrails are three plain-language inputs produced by a
  **coach working session** (3–5 experienced coaches): (a) a phases-of-play
  list, (b) a feedback model (what good feedback contains structurally), (c) a
  tone/style guide with real before/after examples.
- **10.2** — Guardrails are stored as an **editable system prompt** — a config
  constant in the Edge Function or, preferably, a row/table read at request time
  — so they can be updated **without** an app rebuild or store review (Gant docs
  §9). Design decides constant vs table; a table is preferred for editability.
- **10.3** — The guardrails system prompt is large and reused on every request,
  so **Anthropic prompt caching** is used to control latency/cost (Gant docs §2,
  §9).
- **10.4** — **Blocking dependency:** the coach working session must happen (or
  at least produce a first-draft guardrails document) before the refinement
  quality can be validated. The *engineering* can be built and tested against a
  placeholder guardrails prompt, but Gant is not "done" or launchable until real
  guardrails exist. Track the coach session as a non-code task.

---

## 11. Historical review / progression

Per Gant docs §5.

- **11.1** — When a coach writes feedback about a player, Gant may review that
  player's **past approved feedback** (User-ID-keyed, per 7.2) to note whether
  the current observation is the **same** recurring issue or a **new** one, and
  may prompt the coach to reflect on progression (improved / same / new).
- **11.2** — This is a coaching-quality aid: Gant surfaces the comparison and
  asks; it does not assert its own conclusion about a player's development
  without coach input.
- **11.3** — **OPEN (Gant docs §11):** how far back "past feedback" looks — full
  history or a rolling window (e.g. current + prior season). Decide before build.

---

## 12. Session suggestions (coaching page)

Per Gant docs §7.

- **12.1** — Separately from feedback refinement, Gant can suggest coaching
  session / practice ideas based on the areas of need identified across a team's
  or player's feedback history, surfaced on the coaching page for planning.
- **12.2** — **OPEN (Gant docs §11):** whether suggestions are limited to a
  defined drill/practice library or can be generated freely. Decide before build.
  This is a lower-priority slice and may be deferred to a Gant phase 2.

---

## 13. Club-agnostic constraint

Per project standards (club-agnostic rule) — Gant is new build, so it must obey it.

- **13.1** — Any club name/colour/logo shown in Gant UI comes from
  `useClubBranding()` / `club_settings`, never hardcoded.
- **13.2** — Any club context passed to the Anthropic call from the Edge Function
  comes from `CLUB_*` env vars with generic defaults (the accepted small
  duplication), mirroring `send-email`. Gant carries **no** WCR-specific literals.
- **13.3** — The guardrails prompt content is club-specific *data* (a club's own
  feedback philosophy), stored in config/table per 10.2 — not baked into code —
  so another club supplies their own without a code change.

---

## 14. Open decisions to close before/at build (consolidated)

Carried from the Gant docs and this analysis:

1. **[Section 8.4]** Exact contents of the player's team-view feedback surface
   (user's sentence was cut off). **Blocks the player-facing UI.**
2. **[Section 5.2]** Reuse `game_feedback` (relaxed to event feedback) vs a new
   `event_feedback` table.
3. **[Section 4.1]** Hard ceiling on clarification rounds, or open-ended.
4. **[Section 4.4]** Review-list UX (needs a quick coach input).
5. **[Section 9.4]** Does the chosen speech plugin work offline (text vs audio
   queue) — decides a privacy-policy impact.
6. **[Section 11.3]** How far back progression review reads.
7. **[Section 12.2]** Fixed drill library vs free-form session suggestions.
8. **[Section 8.1]** Does a logged-in child see their own feedback, or only the
   caregiver?
9. **[Section 10]** Coach working session scheduled to produce real guardrails
   (non-code, but gates launch quality).
10. **Naming/trademark** — confirm "Gant" is clear for public use (Gant docs §11).
