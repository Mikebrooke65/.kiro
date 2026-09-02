# Gant — AI Coaching Feedback Assistant — Tasks

**Status: DRAFT v2 — reflects the 2026-09-03 working session, not yet built.**
**Supersedes:** the v1 draft of this file (same day).
**Reads with:** `requirements.md`, `design.md` (this folder).

Ordered so each slice is independently shippable and testable, per design.md
Section 10's rollout sequence. **Non-code gate:** Task 0 governs launch
*quality*, not the build sequence — engineering can proceed against placeholder
guardrails, but Gant isn't launchable with real content until Task 0 lands.

---

## Task 0 — Coach guardrails working session (NON-CODE, gating on quality)

- [ ] 0.1 Run the coach session (3–5 coaches) per
  `docs/project/GANT-COACH-GUARDRAILS-CONVERSATION-GUIDE.md`; produce first-draft
  phases-of-play list, feedback model, tone guide with before/after examples.
- [ ] 0.2 Decide whether phase tags map into the existing Technical/Tactical/
  Physical/Mental report-card categories (affects how phases are defined now).
- [ ] 0.3 Capture the output as seed content for `gant_guardrails` (Task 1.3).

## Task 1 — Data model (D2)

- [ ] 1.1 Migration: `gant_pending_entries` (team_id, player_id?, event_type?,
  event_id?, raw_text jsonb array of rounds, last_gant_response jsonb,
  round_count, captured_by, captured_at, updated_at). RLS: captured_by = auth.uid()
  OR admin, all operations. (D2.1)
- [ ] 1.2 Migration: additive columns on `game_feedback` — `event_type`,
  `phase_tags text[]`, `gant_assisted boolean`, `round_count`. (D2.2)
- [ ] 1.3 Migration: `gant_guardrails` single-row table (`phases_of_play jsonb`,
  `feedback_model text`, `tone_guide text`, `system_prompt_override text`,
  `updated_at`). RLS: authenticated coach/admin read, admin write. Seed from
  Task 0.3 (or placeholder). (D8)
- [ ] 1.4 Migration: `gant_outcomes` append-only log (team_id, player_id?,
  outcome, round_count, resolved_by, resolved_at). RLS: admin-only SELECT,
  insert via server-side call only. (D2.4)
- [ ] 1.5 Update `src/types/database.ts` for all of the above.
- [ ] 1.6 **Latent-bug fix (separate, shippable alone):** repoint or remove
  `reporting-api.getGameFeedback()` + desktop `GameFeedbackReport.tsx`, which
  select dead 4-Moments columns dropped in migration 022.

## Task 2 — Edge Function `gant-refine` (D4.3)

- [ ] 2.1 Scaffold from `send-email`'s skeleton: `Deno.serve`, CORS + OPTIONS,
  require `Authorization` header.
- [ ] 2.2 Read `ANTHROPIC_API_KEY` + `gant_guardrails` at request time; assemble
  cached system prompt.
- [ ] 2.3 Implement `mode: 'review'` — accepts `{ scope, subjectUserId?,
  eventType?, rounds: string[] }`, calls Claude Sonnet, returns
  `{ kind: 'refined'|'question', text, phaseTags? }`.
- [ ] 2.4 Implement `mode: 'summarize'` — accepts a player's last-10 notes
  (text/tags/dates, User-ID keyed), returns a short synthesis. (D7)
- [ ] 2.5 **Privacy boundary test:** assert no name/email/DOB can leave in
  either mode — only `subjectUserId` + text/tags/dates.
- [ ] 2.6 Error/timeout handling — never lose the coach's accumulated raw input;
  client keeps the pending entry as-is on failure.
- [ ] 2.7 Deploy (`supabase functions deploy gant-refine`; secrets via
  `supabase secrets set`, handed over via a file outside the repo). Verify with
  scripted calls: clean refine, a question, an all-positive input, a multi-round
  sequence.

## Task 3 — Review loop (D4) — buildable/testable before capture UI exists

- [ ] 3.1 `src/lib/gant-api.ts`: `review(entryId)`, `approve(entryId)` (atomic:
  insert `game_feedback` row + log `gant_outcomes('ticked')` + delete pending
  row), `discard(entryId)` (log `gant_outcomes('crossed')` + delete pending row).
- [ ] 3.2 Pure logic (`src/lib/gant-review-logic.ts`): round accumulation,
  Tick/Cross/Work-on state transitions, response-kind → available-actions
  mapping. Unit-tested.
- [ ] 3.3 Review screen component: header (team/player/event/date), original-
  input block (full round history), Gant response block (two visual states per
  D4.1), action buttons conditional on response kind.
- [ ] 3.4 "Work on" input reuses the same dictate-or-type control as capture
  (Task 5) — factor out a shared input component.
- [ ] 3.5 No round cap — verify the loop truly has no artificial limit.
- [ ] 3.6 **Live verification (before building capture UI):** manually insert a
  `gant_pending_entries` row via SQL, confirm the full review loop works
  end-to-end (refine → question → Work on → refine → tick), confirms Task 2's
  Edge Function and Task 3's screen independently of capture.

## Task 4 — Pending queue (D5)

- [ ] 4.1 "My pending notes" list — flat chronological (default per open
  decision), reachable from the Coaching tab; reuse the `resolveApprovalsTab`
  badge pattern (`main-layout-logic.ts`) for a pending-count badge.
- [ ] 4.2 Tapping an entry opens Review (Task 3).

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

## Task 7 — Auto-summary (D7)

- [ ] 7.1 Decide caching approach (live-on-open vs cached-on-approval + a
  `gant_player_summaries` table) — default to live-on-open for simplicity
  unless load testing says otherwise.
- [ ] 7.2 Wire `mode: 'summarize'` into the person-detail screen, pinned above
  the notes feed.

## Task 8 — Guardrails admin screen + usage-signal panel (D8)

- [ ] 8.1 `src/pages/desktop/DesktopGantSettings.tsx` (admin-only): phases-of-
  play editor, feedback-model text area, tone-guide text area.
- [ ] 8.2 Usage-signal panel: sortable list from `gant_outcomes` (round count,
  outcome, team/player, date) — simple list first, aggregation later (Req 10.4).
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
