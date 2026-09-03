# Gant — AI Coaching Feedback Assistant — Tasks

**Status: DRAFT v2 — reflects the 2026-09-03 working session, not yet built.**
**Supersedes:** the v1 draft of this file (same day).
**Reads with:** `requirements.md`, `design.md` (this folder).

Ordered so each slice is independently shippable and testable, per design.md
Section 10's rollout sequence. **Non-code gate:** Task 0 governs launch
*quality*, not the build sequence — engineering can proceed against placeholder
guardrails, but Gant isn't launchable with real content until Task 0 lands.

---

## Task 0 — Coach guardrails refinement (NON-CODE, gating on quality)

**Approach decided 2026-09-03: show, don't just tell.** Rather than (or before)
a workshop-style conversation, the repo owner will **demo Gant working live to
coaches, let them actually use it** (running on the placeholder guardrails,
`docs/project/GANT-PLACEHOLDER-GUARDRAILS.md`), and gather refinement from real
usage. Coaches react to and correct something concrete and working, rather
than designing a feedback philosophy from a blank page in a meeting. The
conversation guide's structured questions (`docs/project/GANT-COACH-GUARDRAILS-CONVERSATION-GUIDE.md`)
remain useful as a fallback/complement wherever a live demo doesn't naturally
surface an answer (e.g. Part 4's "what should Gant never comment on" is easier
to ask directly than to wait for a coach to hit it by accident).

- [ ] 0.1 Build/deploy enough of the stack (Tasks 1–5 minimum: data model,
  Edge Function, review loop, capture) seeded with the placeholder guardrails,
  so there's something real to demo and let coaches try.
- [ ] 0.2 Demo + hands-on trial with 3–5 experienced coaches; capture their
  reactions, corrections, and preferred phrasing directly against real output
  — this **is** the guardrails-definition process, not a precursor to it.
- [ ] 0.3 Use the `gant_outcomes` export (Task 8.2) once real trial usage
  exists — round counts and tick/cross patterns from actual coach use are a
  genuine refinement signal, sooner than originally expected, since real usage
  starts as early as this trial rather than waiting for full launch.
- [ ] 0.4 Fold coach input into an updated `gant_guardrails` row (via the
  admin screen, Task 8.1, once built — or a direct SQL update before then).
  Treat this as iterative, not a single one-off session — refine again after
  more real usage, same "living document" spirit already noted in the
  conversation guide.
- [ ] 0.5 Decide whether phase tags map into the existing Technical/Tactical/
  Physical/Mental report-card categories (affects how phases are defined) —
  can be settled during the live trial rather than as a separate step.

## Task 1 — Data model (D2) — ✅ DONE + LIVE-VERIFIED 2026-09-03

- [x] 1.1 Migration `068_gant_pending_entries.sql`: `gant_pending_entries`
  (team_id, player_id?, event_type?, event_id?, raw_text jsonb array of
  rounds, last_gant_response jsonb, round_count, captured_by, captured_at,
  updated_at). RLS: captured_by = auth.uid() OR admin, all operations. (D2.1)
- [x] 1.2 Migration `069_gant_feedback_columns.sql`: additive columns on
  `game_feedback` — `event_type`, `phase_tags text[]`, `gant_assisted
  boolean`, `round_count`. (D2.2)
- [x] 1.3 Migration `071_gant_guardrails.sql`: `gant_guardrails` single-row
  table (`phases_of_play jsonb`, `feedback_model text`, `tone_guide text`,
  `continuity_language text`, `system_prompt_override text`, `updated_at`).
  RLS: authenticated coach/coach-authority-manager/admin read, admin write.
  **Seeded with the placeholder draft**
  (`docs/project/GANT-PLACEHOLDER-GUARDRAILS.md`) directly in the migration.
  (D8)
- [x] 1.3b Migration `070_game_feedback_player_caregiver_read.sql`: the
  player/caregiver read RLS from Task 6.1, built alongside the other
  `game_feedback` changes since it touches the same table (moved earlier from
  Task 6 — no reason to defer it).
- [x] 1.4 Migration `072_gant_outcomes.sql`: `gant_outcomes` append-only log
  (team_id, player_id?, outcome, round_count, resolved_by, resolved_at). RLS:
  admin-only SELECT, resolver-scoped INSERT. (D2.4)
- [x] 1.4b Migration `073_gant_player_summaries.sql`: the auto-summary cache
  table from Task 7.1, built alongside since it's a small, related table —
  moved earlier from Task 7.
- [x] 1.5 Updated `src/types/database.ts`: extended `GameFeedbackRecord`,
  added `GantPendingEntry`, `GantRawRound`, `GantResponse`, `GantGuardrails`,
  `GantPhaseBand`/`GantPhaseOfPlay`, `GantOutcome`, `GantPlayerSummary`.
- [x] 1.6 **Latent-bug fix, done:** `reporting-api.getGameFeedback()` and
  `GameFeedbackReport.tsx` rewritten to query the live schema (join `events`
  for date/opponent instead of selecting dropped 4-Moments columns); removed
  the dead `GameFeedback` type and the report's now-unused `MomentCard`
  helper. `npm run build` clean; `npx vitest --run` unaffected (239 passing,
  the 2 pre-existing failures are live-network `redeem-invite` integration
  tests, confirmed failing identically on a clean stash — unrelated to this
  change).

**✅ All 6 run live in the Supabase SQL Editor and verified, 2026-09-03** — the
repo owner ran 068 through 073 in order; all succeeded. Confirmed via
`SELECT feedback_model, tone_guide FROM gant_guardrails;` that the placeholder
seed row landed with its full real content (not empty/no-opped). Data model is
genuinely live — Task 2 can now build and test against it.

## Task 2 — Edge Function `gant-refine` (D4.3) — ✅ DONE + LIVE-VERIFIED 2026-09-03

- [x] 2.1 Scaffolded from `send-email`'s skeleton: `Deno.serve`, CORS + OPTIONS,
  requires `Authorization` header (401 if absent).
- [x] 2.2 Reads `ANTHROPIC_API_KEY` + `gant_guardrails` fresh on every request
  (no caching in the function itself — editing the guardrails row takes effect
  immediately, per Req 9.2); assembles a cached (`cache_control: ephemeral`)
  system prompt from the guardrails content.
- [x] 2.3 Implemented `mode: 'review'` — accepts `{ scope, subjectUserId?,
  eventType?, rounds: string[], recentHistory? }`, calls Claude Sonnet
  (`claude-sonnet-4-6`, overridable via `CLAUDE_MODEL` secret), returns
  `{ kind: 'refined'|'question', text, phaseTags? }`. **Note on `recentHistory`
  (Req 4.9):** implemented as caller-supplied (the client assembles the
  player's last 4 approved notes and passes them in), not fetched by the
  function itself — matches design.md's `GantRefineRequest` shape exactly;
  the function only needs to *use* the history in the prompt, not query for
  it. Gant does reference it naturally using the guardrails' continuity
  language — confirmed live in the summarize test below.
- [x] 2.4 Implemented `mode: 'summarize'` — accepts a player's last-10 notes
  (text/tags/dates, User-ID keyed), returns `{ summaryText }`. (D7)
- [x] 2.5 **Privacy boundary, live-verified:** the function's request shape
  accepts no name/email/DOB field at all in either mode — only
  `subjectUserId` + text/tags/dates. Nothing to strip because nothing
  identifying can be sent in the first place.
- [x] 2.6 Error/timeout handling: Anthropic failures/malformed responses throw
  a clear error (500) rather than silently succeeding; the client-side caller
  (Task 3/5) is responsible for keeping the pending entry as-is on failure.
- [x] 2.7 **Deployed and live-verified via `scripts/verify-gant-refine.ts`
  (9/9 checks passed):**
  - Unauthenticated call → 401.
  - A plain **player**'s token → 403 ("Coach, Manager, or Admin access
    required") — confirms Gant is genuinely unreachable by a player/caregiver,
    not just undisclosed in the UI (Req 6.4).
  - A **coach**'s token, messy dictated input ("um in the small sided game
    they were finding space really well and switching play") → cleaned up,
    correctly phase-tagged (`"Progressing through midfield"`), club-toned
    refined text.
  - An **all-positive** input (a player with "nothing to work on") → refined
    as genuinely all-positive, no manufactured work-on (Req 3.3).
  - `mode: 'summarize'` on 3 sample notes → a real, warm 2-4 sentence summary
    that naturally used continuity language ("worth keeping building on")
    from the placeholder guardrails.
  - **API key never re-exposed** — the script calls the deployed function
    over HTTPS; it never reads or handles the raw Anthropic key at all.
  - Fixture users (one coach, one player, throwaway `wcr-gant-probe-*`
    emails) created and fully cleaned up (auth + profile) on every exit path.

## Task 3 — Review loop (D4) — ✅ DONE + LIVE-VERIFIED 2026-09-03

- [x] 3.1 `src/lib/gant-api.ts`: `review()`, `cacheGantResponse()`,
  `addWorkOnRound()`, `approve()` (in sequence: insert `game_feedback` with
  `gant_assisted=true` + log `gant_outcomes('ticked')` + delete pending row),
  `discard()` (log `gant_outcomes('crossed')` + delete pending row). Also
  includes `createPendingEntry()`/`getMyPendingEntries()`/`getPendingEntry()`
  (Task 5's capture methods, built alongside since they share the same file)
  and `summarize()`/`upsertPlayerSummary()` (Task 7's methods, same reason).
  **Note:** `approve()`/`discard()` are a sequence of client calls, not one
  atomic server call — documented in the method's own comment as an accepted
  tradeoff (a partial failure leaves the pending entry in place for retry
  rather than losing data, since it's deleted last).
- [x] 3.2 Pure logic (`src/lib/gant-review-logic.ts`): `appendWorkOnRound`,
  `needsFreshGantCall` (the refine-on-open cache check — Req 3.1.2, decided
  2026-09-03), `resolveReviewActions` (response-kind → available-actions
  mapping), `roundsAsPlainText`. **15 unit/property tests, all passing**
  (`src/lib/gant-review-logic.test.ts`), including the "no repeat call on
  re-open" case and a property test confirming no artificial round cap exists
  (Req 4.6).
- [x] 3.3 Review screen component (`src/components/GantReviewModal.tsx`):
  header (team/player/event/date, Progress Notes branding per Req 13), full
  round-history block, Gant response block with the two visual states (solid
  card for a refined comment, dashed amber outline for a clarifying question —
  D4.1), action buttons conditional on response kind, plus a "close and leave
  pending" affordance (Req 5.1 — the entry isn't force-resolved).
- [x] 3.4 "Work on" input: a single `<textarea>` shared identically across the
  first capture and every Work-on round — both typed and dictated text land in
  the same field (dictation itself is Task 9, not yet wired, but the input
  control makes no distinction between the two).
- [x] 3.5 No round cap — confirmed by property test in 3.2 (arbitrary-length
  round arrays, 0–50, always accepted) and structurally: nothing in
  `gant-review-logic.ts` or the Edge Function enforces a limit.
- [x] 3.6 **Live verification, done — `scripts/verify-gant-review-loop.ts`,
  13/13 checks passed** against real Supabase data and real Anthropic calls
  (confirms Task 2's Edge Function and Task 3's logic/API independently of
  capture UI, which doesn't exist yet):
  - Manually inserted a `gant_pending_entries` row (standing in for capture).
  - First `review()` call → a refined comment.
  - Cached the response on the pending entry.
  - Added a genuine second "Work on" round (a different observation about the
    same player) and called `review()` again with the FULL accumulated
    history — **confirmed the refined output incorporated BOTH rounds**
    (first touch AND the final-pass comment), following the Hattie feed-up/
    back/forward structure from the placeholder guardrails almost verbatim
    ("great to see it landing so well today... One area to keep building
    on... The next step is...").
  - `approve()` sequence: `game_feedback` row inserted with
    `gant_assisted=true` and the correct `round_count`; `gant_outcomes` row
    logged with `outcome='ticked'`; pending entry deleted; the saved feedback
    read back and confirmed to match exactly.
  - A second entry run through `discard()`: `gant_outcomes` logged with
    `outcome='crossed'`, pending entry deleted, and confirmed **zero**
    `game_feedback` rows were created for it.
  - All fixtures (2 users, 1 team, 1 event, plus every created row) cleaned
    up on exit — confirmed zero leftover data.

## Task 4 — Pending queue (D5) — filterable by team/player (decided 2026-09-03)

- [ ] 4.1 "My pending notes" list, reachable from the Coaching tab; reuse the
  `resolveApprovalsTab` badge pattern (`main-layout-logic.ts`) for a
  pending-count badge.
- [ ] 4.2 Team filter (reuse standard team-selector pattern) + optional player
  filter within the selected team. Underlying order is always chronological
  regardless of filter state; no filter = full flat list across all
  teams/players (Req 5.2).
- [ ] 4.3 Tapping an entry opens Review (Task 3).

## Task 5 — Capture v1 (D3.1)

- [ ] 5.1 `gantApi.createPendingEntry({ teamId, playerId?, rawText, eventType?,
  eventId? })`.
- [ ] 5.2 Capture sheet component (dictate-or-type input, player/team already
  fixed by caller) — **no Gant call at capture time** (design's recommended
  default; revisit after live testing if coaches expect immediate feedback).
- [ ] 5.3 Wire capture entry points: from the person-detail screen (Task 6) and
  from the roster directly (decide which is primary; both can coexist).
- [ ] 5.4 Gate capture to coach/admin/coach-authority-manager — same rule as
  `tabsForRole`'s `showCoaching`.

## Task 6 — Person-detail screen (D6) — v1 scope is notes-only

- [ ] 6.1 Migration: additive RLS on `game_feedback` for player-self,
  device-logged-in-child-self, and caregiver-of-linked-child read (D6.1),
  reusing the migration 060/061 caregiver-team-access resolver pattern. A
  logged-in child and their caregiver both get read access — not either/or
  (Req 6.3, resolved).
- [ ] 6.2 New route/screen (`/team/person/:userId` or a modal over `/team` —
  decide at build time). Wire from `TeamPage.tsx` roster row tap, gated per
  Req 1.2 (self/caregiver/logged-in-child = view-only; coach/admin = view +
  add-note + this-person's pending list). **No editable-fields panel — removed
  from scope (Req 2.2/12.5).**
- [ ] 6.3 Notes feed: summary card (Task 7) + list, newest first, text/author/
  date (Req 2.1.1). Never render `gant_assisted`/`round_count` (Req 6.4).
- [ ] 6.4 Add-note entry point (coach/admin only) opening Task 5's capture sheet
  pre-filled with this player + team, plus this coach's pending entries for this
  person inline (Req 2.1.4 / D4.4).
- [ ] 6.5 Live RLS verification: player sees only their own notes + team notes;
  a device-logged-in child sees their own directly; caregiver sees linked
  child's; a player cannot read another's; coach/admin unaffected.
- [ ] 6.6 **Disclosure boundary check (Req 6.4/6.4b):** confirm the coach/
  admin-facing side (Tasks 3, 5 — onboarding/help copy, and optionally the
  response box) can name "Gant" as a coherent presence, while the
  player/caregiver-facing notes feed (this task) never mentions Gant or AI
  involvement anywhere, under any circumstance. Verify both sides
  deliberately, not just the disclosed one.

## Task 6b — Team-notes on the Team roster page (Req 6.5, D6.3) — small, independent

- [ ] 6b.1 Add a "Progress Notes" link/section below the team name on
  `TeamPage.tsx`, reusing Task 6's summary-card + feed pattern, scoped to
  `feedback_type='team'` + `team_id`. Readable by any member of that team.
- [ ] 6b.2 Note: **do not** attempt a broader Team page layout redesign as part
  of this task — that's explicitly out of scope (Req 12.6). Add this link
  cleanly; a full layout pass is separate future work.

## Task 6c — Progress Notes branding pass (Req 13, D6.3b)

- [ ] 6c.1 Confirm the exact accent hex at design time (recommended default:
  Tailwind `amber-600` / `#d97706`) — distinct from the six reserved page
  colours and from Games' orange.
- [ ] 6c.2 Apply it consistently across every Progress-Notes surface: roster
  links (individual + team, Task 6b), the person-detail notes panel (Task 6),
  the capture sheet (Task 5), the review screen (Task 3), the pending-queue
  badge (Task 4), and the Games-page quick link (Task 9). One colour, used
  everywhere the feature appears — a single sweep/checklist across those
  tasks rather than a separate component to build.

## Task 7 — Auto-summary (D7) — cached-on-approval (decided 2026-09-03)

- [ ] 7.1 Migration: `gant_player_summaries` (`player_id` PK → users.id,
  `summary_text`, `generated_at`). RLS mirrors the person-detail read rule
  (Task 6.1) — same viewers as the notes feed.
- [ ] 7.2 Implement `mode: 'summarize'` in `gant-refine` (see Task 2.4);
  trigger it from `approve()` (Task 3.1) whenever a note is ticked, upserting
  the affected player's `gant_player_summaries` row. Team-scoped ticks don't
  trigger this (no single player to summarise for).
- [ ] 7.3 Person-detail screen (Task 6) simply reads the cached row on open —
  no Gant call at view time. Pin above the notes feed (Req 2.1.2).

## Task 8 — Guardrails admin screen + usage-signal panel (D8)

- [ ] 8.1 `src/pages/desktop/DesktopGantSettings.tsx` (admin-only): phases-of-
  play editor, feedback-model text area, tone-guide text area.
- [ ] 8.2 **CSV export button for `gant_outcomes`** (round count, outcome,
  team/player, date) — decided 2026-09-03: no in-app analytics/insights UI for
  v1, just clean exportable data for external review (e.g. feeding it to
  Claude separately for guardrails-improvement suggestions).
- [ ] 8.3 Wire Task 0's coach-session output in as the real seed content once
  available (replacing any placeholder from Task 1.3).

## Task 9 — Games page quick link (Req 1.3)

- [ ] 9.1 Confirm `Games.tsx`'s existing `selectedPlayerId` state can be carried
  through a link/navigation to the person-detail screen (or capture sheet
  directly).
- [ ] 9.2 Replace/augment the existing "Ask AI Coach" entry point on the Games
  page with this quick link — team (and player, if selected) pre-filled, no
  re-selection needed.

## Task 10 — Deferred / phase 2 (not built in this pass, tracked here)

Resolved and removed from this list (2026-09-03 follow-up): team-notes location
(now Task 6b), video-review handling (now just a capture-flow label, Task 5),
logged-in child's own-notes visibility (now Task 6.1/6.5), editable personal
fields (removed from Gant's scope entirely, see requirements Section 12.5).

- [ ] 10.1 **Continuous multi-player dictation** (D3.2) — segmentation + roster
  fuzzy-name-matching, feeding into the same Task 3 review loop unchanged.
- [ ] 10.2 **Progression review** (Req 12.4) — Gant noting recurring issues while
  a coach is *writing* a new note (distinct from the read-side auto-summary).
- [ ] 10.3 **Session suggestions** (Req 12.7).
- [x] 10.4 **Naming — DECIDED 2026-09-03: "Progress Notes."** (Req 12.8). "Gant"
  stays internal/backstage only, never shown to players/caregivers. Use
  "Progress Notes" as the UI label everywhere across Tasks 4–6b.
- [ ] 10.5 **Team page / roster layout redesign** (Req 12.6) — out of scope for
  this build; scope as its own follow-up once Gant's additions (person-detail
  link, team-notes link) are in place and real crowding is visible.
- [ ] 10.6 **Editable personal fields + the player-can't-see-own-phone-number
  gap** (Req 12.5) — separate future conversation, not a Gant task. Track the
  phone-number visibility gap in `NEXT-SESSION-NOTES.md`.

## Task 11 — Privacy policy + docs

- [ ] 11.1 Add a Gant section to `docs/privacy-policy-draft.md` — User-ID-only to
  AI, no audio transmission (except the on-device fallback, deleted
  immediately), the new `gant_pending_entries` retention surface (short-lived
  but real), retention aligned with V1.R. Gate before any store release.
- [ ] 11.2 Update `CHANGELOG.md` and `NEXT-SESSION-NOTES.md` as slices land.

## Task 12 — Verification checkpoint

- [ ] 12.1 `npm test` + `npm run build` clean on the pushed head.
- [ ] 12.2 Full manual live pass end to end: capture (typed + dictated, leave
  pending) → reopen later from the queue → review loop (refine → question →
  Work on → refine → tick) → confirm visible on the person-detail screen to the
  right viewers only → confirm the auto-summary reads sensibly → confirm a
  crossed entry saves nothing and logs the outcome.
