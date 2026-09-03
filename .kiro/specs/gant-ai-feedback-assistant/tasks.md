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

- [x] 4.1 `src/pages/GantPendingQueue.tsx` — replaces the old `AICoach.tsx`
  stub at the same `/ai-coach` route (so the Coaching page's existing link
  needed no change beyond its label/colour). **Note:** did not implement a
  separate nav badge count this pass (the `resolveApprovalsTab` pattern
  reference) — deferred as a small polish item, not blocking; the queue
  itself is fully functional without it.
- [x] 4.2 Team filter (dropdown, reusing the standard team-selector data
  source `teamsApi.getMyTeams`) + player filter within the selected team
  (`gamesApi.getTeamPlayers`, disabled until a team is chosen). Underlying
  order is always chronological (`captured_at ASC`) regardless of filter
  state; no filter = full flat list. **Live-verified** via
  `scripts/verify-gant-capture-and-queue.ts` — see Task 5's write-up below,
  same script covers both tasks.
- [x] 4.3 Tapping an entry opens `GantReviewModal` (Task 3) directly.

## Task 5 — Capture v1 (D3.1) — ✅ DONE + LIVE-VERIFIED 2026-09-03

- [x] 5.1 `gantApi.createPendingEntry({ teamId, playerId?, rawText, eventType?,
  eventId? })` — built in Task 3's pass on `gant-api.ts` (same file).
- [x] 5.2 `src/components/GantCaptureSheet.tsx` — a single textarea, no
  team/player picker of its own (context always supplied by the caller, per
  Requirement 1.1). **No Gant call at capture time**, confirmed — the
  component only calls `createPendingEntry`, nothing else. Shows a brief
  inline confirmation and stays open so a coach can capture several entries
  in a row (Req 3.1.3, quick-fire).
- [x] 5.3 Wired from `GantPendingQueue.tsx`'s "+ Add a note" button (team
  and, if selected, player filter become the capture context). **The
  person-detail screen (Task 6) and Games-page (Task 9) entry points are not
  yet wired** — those tasks aren't built yet; this is the queue-page entry
  point only, sufficient for the loop to be fully usable end-to-end today.
- [x] 5.4 Gated via the route's `ProtectedRoute allowedRoles={[ADMIN, COACH]}`
  — matches `/coaching`'s existing rule, resolving the mismatch Requirement
  1.2 called out. **Known pre-existing gap, not introduced by this change:**
  `ProtectedRoute` only checks the synchronous global `user.role`, so a
  Manager holding per-team `is_coach` authority (who correctly sees the
  Coaching tab via `tabsForRole`'s `hasCoachAuthorityOnAnyTeam`) would be
  redirected away if they navigated directly to `/coaching` or `/ai-coach` —
  this already existed for `/coaching` before this change and is a
  `ProtectedRoute` architecture limitation, not something this build
  introduced or is scoped to fix. Flag in `NEXT-SESSION-NOTES.md`.
- [x] **Live-verified together with Task 4** via
  `scripts/verify-gant-capture-and-queue.ts` (9/9 checks passed, real
  Supabase data):
  - 4 entries captured by one coach (2 for playerX, 1 team-scoped, 1 for
    playerY) + 1 by a second coach.
  - No filter: the first coach sees exactly their own 4 — confirms RLS scopes
    to `captured_by`, not "everyone's."
  - Team filter alone: all 4 of that coach's entries for the team.
  - Team + player filter: exactly playerX's 2 entries — critically, **not**
    the team-scoped entry and **not** playerY's, confirming the filter
    correctly excludes `player_id IS NULL` and other players' rows.
  - RLS isolation: the first coach genuinely cannot read the second coach's
    pending entry at all (0 rows visible), not just filtered out client-side.
  - All fixtures (4 users, 1 team, 5 entries) cleaned up on exit.
  - **Unrelated pre-existing bug found while scoped-type-checking the new
    files:** `src/lib/teams-api.ts` line 168 has a genuine type error
    (`pendingMemberships` map is missing the now-required `is_coach` field on
    `TeamMemberWithTeam`) — confirmed via `git diff` that this file was never
    touched by this build. `npm run build` doesn't catch it (Vite/esbuild
    doesn't type-check); there's no project-wide `tsc` script per `CLAUDE.md`.
    Not fixed here — flag in `NEXT-SESSION-NOTES.md` as a found-but-unrelated
    issue, same practice as the earlier 4-Moments reporting bug.

## Task 6 — Person-detail screen (D6) — ✅ DONE + LIVE-VERIFIED 2026-09-03

- [x] 6.1 Migration `070_game_feedback_player_caregiver_read.sql` (built in
  Task 1's pass, moved earlier since it touches the same table as 069): four
  additive SELECT policies — player-self, team-member (for team-scoped
  notes), caregiver-of-linked-child, caregiver-of-linked-child's-team. A
  device-logged-in child is covered automatically (`player_id = auth.uid()`
  doesn't distinguish an adult from a device-logged-in child) — no separate
  policy needed.
- [x] 6.2 **Implemented as a modal over `/team`** (`GantPersonDetailModal.tsx`),
  not a separate route — kept the roster's own team-selection context
  trivially intact and matches every other Team-page overlay (Add Player,
  Add Caregiver, Remove confirmation). Wired from `TeamPage.tsx`'s
  `RosterRow`: the name/contact block (not the whole row, so the row's other
  action buttons keep independent click targets) is tappable for any real
  (non-pending) player row. Gated per Req 1.2: `canAddNote` is
  `isClubAdmin || currentUserRoles.includes('coach')` (which already folds
  in `is_coach`-authority Managers as a synthetic 'coach' entry, per
  `fetchRoster`'s existing convention) — a plain Manager/player/caregiver
  gets view-only. **No editable-fields panel** — v1 scope is notes-only
  (Req 2.2/12.5).
- [x] 6.3 `GantNotesPanel.tsx`: summary card (Task 7) + list, newest first,
  text/author/date (Req 2.1.1). Never renders `gant_assisted`/`round_count`
  (Req 6.4) — the component's data shape (`GantFeedbackNote`) doesn't even
  carry those fields.
- [x] 6.4 Add-note entry point (coach/admin only, inside
  `GantPersonDetailModal`) opens Task 5's `GantCaptureSheet` pre-filled with
  this player + team. **Not built this pass:** "this coach's pending entries
  for this person inline" (D4.4) — the pending queue (Task 4) already covers
  reaching any pending entry via its team/player filters, so this inline
  duplication is deferred as a small polish item, not blocking.
- [x] 6.5 **Live-verified via `scripts/verify-gant-person-detail.ts` (10/10
  checks passed):** the subject player reads their own note; their linked
  caregiver reads it too; a genuinely unrelated player gets **zero rows**
  (RLS-enforced server-side, not client-filtered); a coach on the team reads
  it; any team member (even one unconnected to the individual note) reads a
  team-scoped note; the cached summary follows the identical access pattern
  (subject + caregiver yes, unrelated player no).
- [x] 6.6 **Disclosure boundary, confirmed by design:** the coach/admin-facing
  capture (Task 5) and review (Task 3) screens are free to name "Gant" as a
  coherent presence per Req 6.4b (not forced to, but not prohibited either);
  `GantNotesPanel.tsx` (the player/caregiver-facing side) has no code path
  that could render Gant's name — its data shape simply doesn't carry that
  information, so this isn't just a convention being followed, it's
  structurally impossible for this component to leak it.

## Task 6b — Team-notes on the Team roster page (Req 6.5, D6.3) — ✅ DONE

- [x] 6b.1 Added a "Show/Hide Team Progress Notes" toggle below the team
  selector on `TeamPage.tsx`, reusing `GantNotesPanel` (`scope="team"`),
  scoped to `feedback_type='team'` + the selected `team_id`. Readable by any
  member of that team (confirmed in Task 6.5's live verification — the
  team-scoped-note check used a team member unrelated to the individual note
  fixture, and it worked).
- [x] 6b.2 No Team page layout redesign attempted — the toggle is a single
  small link/expand affordance, not a new permanent block competing with the
  existing roster-row button density (Req 12.6, still explicitly deferred).

## Task 6c — Progress Notes branding pass (Req 13, D6.3b) — ✅ DONE

- [x] 6c.1 Confirmed: `#d97706` (Tailwind `amber-600`) used as the single
  literal hex throughout (not yet extracted to a shared constant — see note
  below).
- [x] 6c.2 Applied consistently across every surface built so far:
  `GantReviewModal`, `GantCaptureSheet`, `GantPendingQueue` (header border,
  filters area, "+ Add a note" button, round-count badges), `Coaching.tsx`'s
  entry-point button, `GantPersonDetailModal`, `GantNotesPanel` (summary card
  border + phase-tag chips), and the new Team-notes toggle on `TeamPage.tsx`.
  **Not yet done:** the Games-page quick link (Task 9, not built yet). **Small
  follow-up worth doing, not blocking:** the hex is currently duplicated as a
  literal string (`'#d97706'` / `GANT_ACCENT` locally per-file) across 6
  files rather than one shared constant — fine for now, but worth extracting
  to e.g. `src/lib/gant-branding.ts` if a design-time hex change is ever
  needed, to avoid a multi-file find-and-replace.

## Task 7 — Auto-summary (D7) — ✅ DONE + LIVE-VERIFIED 2026-09-03

- [x] 7.1 Migration `073_gant_player_summaries.sql` (built in Task 1's pass):
  `gant_player_summaries` (`player_id` PK → users.id, `summary_text`,
  `generated_at`). RLS mirrors the person-detail read rule — same viewers as
  the notes feed (subject player, linked caregiver, coach/manager/admin).
- [x] 7.2 `mode: 'summarize'` was already implemented in `gant-refine` (Task
  2). Wired the trigger side just now: `gant-api.ts`'s `approve()` now
  fetches the player's last 10 approved notes and calls `summarize()` +
  `upsertPlayerSummary()` **only when `playerId` is set** (team-scoped ticks
  skip this — no single player to summarise for). Deliberately **best-effort
  and swallowed** (console warning, not thrown) — a summary-refresh failure
  must never undo an already-successful feedback save.
- [x] 7.3 `GantNotesPanel.tsx` reads the cached row via `getPlayerSummary()`
  on open — confirmed **zero** Gant/Anthropic calls happen at view time; the
  only call is the one `approve()` already made at Tick time. Pinned above
  the notes feed (Req 2.1.2).
- [x] **Live-verified end to end via `scripts/verify-gant-summary-refresh.ts`
  (6/6 checks passed):** confirmed no summary row exists before a Tick;
  simulated `approve()`'s exact new sequence (insert the ticked note → fetch
  last-10 → call `summarize` → upsert) against real data and a real
  Anthropic call; the resulting summary **genuinely synthesised both** the
  pre-existing note (tracking back) and the newly-ticked one (composure
  under pressure) into one coherent overview — not just echoing the latest
  note.

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

## Live bugs found and fixed during the repo owner's first real test (2026-09-03)

The repo owner's first genuine end-to-end test (capture → refine → Save,
then Work on) surfaced four real issues in one session — three mechanical,
one a genuine functional gap in the refinement flow. All four fixed and
live-verified same session; recorded here (and cross-linked from
`NEXT-SESSION-NOTES.md`'s V1 status table) since they're real defects found
after this spec's earlier tasks had already been marked done and
live-verified — a reminder that "live-verified" via a scripted probe still
doesn't replace an actual human clicking through the real screens.

**1. Tick/Save silently failed ("colour changes but nothing happens").**
Root cause: `game_feedback.game_id` is a required FK to `events` (migrations
022/025), but nothing in the capture flow (the pending queue's "+ Add a
note" button) creates or references an event — so the insert behind Tick
was rejected every time. Fix: `gant-api.ts`'s `approve()` now creates a
minimal ad-hoc `event_type='general'` placeholder event on the fly when no
`eventId` was supplied, then uses that as `game_id`. `eventId` is now
optional on `approve()`'s params. Live-verified:
`scripts/verify-gant-approve-no-event.ts`.

**2. The failure in (1) was invisible.** `GantReviewModal` and
`GantCaptureSheet` are full-screen `z-[60]` overlays; their callers
(`GantPendingQueue.tsx`) reported errors only to a page-level banner state
that sits BEHIND that overlay — so a real failure produced no visible
feedback at all, just the button's disabled state resetting. Fixed: both
components now maintain their own `inlineError` state and always render it
inside themselves; the `onError` callback prop is now optional (kept for a
caller that also wants to log/track it, but no longer the only place the
message appears). Also fixed a related staleness bug: `GantPendingQueue`
never cleared its own banner state, so an old failed attempt's message
could resurface later, invisibly, looking like a fresh unrelated error once
a later modal closed — now cleared on every modal open and on `onResolved`.

**3. A second RLS gap, surfaced only once (1) was fixed.** Fixing the event
FK issue revealed `gant_outcomes` insert failing with "new row violates
row-level security policy" (42501) even though the insert's own `WITH
CHECK` was satisfied. Root cause: this codebase's `ApiClient.insert()`
always does `.insert(record).select().single()` to return the created row,
and Postgres requires an `INSERT ... RETURNING` to also satisfy the table's
SELECT policy for the new row — migration 072 only granted SELECT to
admins. Fix: migration `074_gant_outcomes_resolver_can_read_own.sql`, an
additive SELECT policy letting a resolver read back only the outcome rows
THEY logged (`resolved_by = auth.uid()`) — harmless (their own audit trail
only) and consistent with the insert-then-return pattern used throughout
this codebase. Run and confirmed live.

**4. The real functional bug: "Work on" had no memory of Gant's own prior
response.** The repo owner's first refined draft was, in their words,
"100% perfect." Hitting "Work on" and adding one more sentence caused Gant
to regress into asking basic clarifying questions (including the team's
age group — already-known data) instead of simply improving on its own
excellent first answer. Root cause: the follow-up call sent the coach's
new addition alongside the original raw rounds, but never told Gant what
IT had already drafted — so from Gant's perspective these were two
disconnected fragments, not a continued conversation. Separately, nothing
was ever passing the team's age group through, even though it's known data
(the team's own `age_group` column) — Gant had a genuine reason to ask,
even though a coach should never have to answer that mid-flow.

Fix, across `gant-refine`'s request shape, `gant-api.ts`, and
`GantReviewModal.tsx`:
- Added `ageGroup` (already-known team data) and `priorResponse` (Gant's
  own most recent output) to the review request. The system prompt now
  explicitly instructs Gant never to ask for the age group and to use it to
  pick which of the guardrails' two age-banded phase lists applies.
- The Edge Function's user-message builder now reconstructs an actual
  conversation on any round beyond the first: `priorResponse` represents
  everything up to and including all-but-the-newest round (never listed a
  second time, to avoid double-counting), and only the LATEST round is
  framed as new coach input building on/answering that prior response.
- `GantReviewModal` always passes its own current `response` state as
  `priorResponse` on every call (both the initial refine-on-open call and
  every subsequent "Work on" round) — since `response` is updated to the
  latest result after every single call, this stays correct across a 2nd,
  3rd, or any further round, not just the first "Work on."

Live-verified with `scripts/verify-gant-workon-context.ts` (7/7 checks
passed) via a real 3-round conversation: round 1 (a genuine observation,
`ageGroup: 'Open'` supplied) → confirmed Gant did NOT ask about age group;
round 2 ("Work on" with `priorResponse` supplied) → confirmed it did NOT
regress into a question, and the refined text genuinely incorporated BOTH
the original observation and the new addition into one coherent paragraph;
round 3 (a further "Work on," with round 2's output as the new
`priorResponse`) → confirmed it kept building coherently rather than
resetting, and produced an appropriate feed-forward "work-on" following the
club's guardrails structure, unprompted. A contrast run (deliberately
omitting `priorResponse`, simulating the pre-fix behaviour) was also
captured for the record, though the model's non-determinism means it
doesn't reproduce the exact original regression every time — which is
itself a reason the fix shouldn't rely on the model getting lucky.

**Edge Function redeployed** (`supabase functions deploy gant-refine`) —
this change does not ship with `git push`.
## Second live-test batch — UX polish + one more latent save bug (2026-09-03)

A second run of live testing (same session, after the four fixes above)
produced a batch of UX refinements plus one further real save bug. All
client-side — **no Edge Function redeploy needed** for this batch; ships
with `git push`.

**5. Latent Save bug that would have defeated fix (1) in the real UI path.**
`GantReviewModal.handleTick` passed `eventId: entry.event_id ?? entry.id`.
Capture-queue entries always have `event_id = null`, so this fell back to
`entry.id` — a `gant_pending_entries` UUID, **not** an `events` id. That
truthy fallback made `approve()` believe it already had an event and skip
the ad-hoc placeholder creation from fix (1), then insert `game_feedback`
with a bogus `game_id`. On a writable team that violates the FK; on a team
the coach can't write to it failed RLS first (which is exactly the "new row
violates row-level security policy for game_feedback" error the repo owner
hit). Fix: pass `entry.event_id ?? undefined` so `approve()` correctly
detects "no event" and creates the placeholder. Fix (1)'s ad-hoc-event path
was never actually exercised by the UI until this was corrected.

**6. Progress Notes team picker offered caregiver-only teams (RLS save
error).** The pending-queue picker used `getMyTeams`, which unions in teams
the user is only linked to as a caregiver. Selecting such a team ("Open
Riverhead Frogs", where the owner is only a caregiver) let a note be
started, then the save was correctly refused by the DB (migration 022
requires own coach/manager membership). Fix: new `getMyCoachingTeams(userId)`
in `teams-api.ts` returns write-authority teams only (`role in (coach,
manager)` OR `is_coach = true`), and `GantPendingQueue` uses it. Progress
Notes is a write surface, so the picker must only offer teams the coach can
actually write to.

**7. Capture sheet UX ("Done" was confusing; captures looked like nothing
happened).** `GantCaptureSheet` rewritten: "Done" → "Close" (it never
finished anything — Capture does); the 1.5s fade confirmation replaced with
a persistent captured-count banner so rapid captures never look like a
no-op; up-front helper copy explains the Capture-then-Close model; and
Close now shows an inline discard-confirm bar ("Keep editing" / "Discard &
close") when there's genuinely-unsaved typed text (inline, not
`window.confirm`, for consistency with the rest of the app).

**8. Review screen hid the wrong path when the coach kept typing.** With
unsaved text in "Add more", the Save button is now HIDDEN entirely (not
greyed) and "Work on" becomes the emphasised filled button — because saving
in that state would tick the current refined note and silently discard the
coach's addition. Once the addition is processed and the box is empty again,
Save returns. A one-line hint appears while text is pending.

**9. Duplicate teams in Coaching and Games dropdowns.** Both pages mapped
`getMyTeams` results straight to options with no dedup, so a user who is
both a coach on a team and a caregiver of a child on that same team saw it
listed multiple times. The Team page already dedupes via
`buildTeamSelection`; Coaching and Games now dedupe by team id (keep first
appearance) to match.

Verified: `npm run build` clean; `npx vitest --run` = 254 passing (the 2
pre-existing `invites-api.preservation.test.ts` live-network failures are
unrelated and independently confirmed).
