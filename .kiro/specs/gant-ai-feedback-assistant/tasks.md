# Gant — AI Coaching Feedback Assistant — Tasks

**Status: DRAFT — for review, not yet built.**
**Date: 2026-09-03.**
**Reads with:** `requirements.md`, `design.md` (this folder).

Tasks are ordered so each slice is independently shippable and testable. Numbers
in parentheses reference requirements (R) and design sections (D). **Non-code
gate:** Task 0 (coach guardrails session) governs launch *quality* — the build
can proceed against placeholder guardrails, but Gant is not launchable until
Task 0 delivers real ones (R10.4).

---

## Task 0 — Coach guardrails working session (NON-CODE, gating)

- [ ] 0.1 Run the coach session (3–5 coaches) per
  `docs/project/GANT-COACH-GUARDRAILS-CONVERSATION-GUIDE.md`; produce first-draft
  (a) phases-of-play list, (b) feedback model, (c) tone guide with before/after
  examples. (R10.1)
- [ ] 0.2 Decide whether phase tags map into the existing Technical/Tactical/
  Physical/Mental report-card categories (Gant docs §13.1) — affects how phases
  are defined now. (R10.1, non-goal note)
- [ ] 0.3 Capture the output as the seed content for `gant_guardrails` (Task 3).

## Task 1 — Confirm open decisions (blocks specific tasks)

- [ ] 1.1 **Confirm Req 8.4** — the exact contents of the player/caregiver team-
  view feedback surface (the user's cut-off "...including ___"). **Blocks Task
  7.** 
- [ ] 1.2 Confirm remaining open decisions in requirements §14 (clarification
  ceiling, review-list UX, progression window, session-suggestion scope,
  child-sees-own-feedback, naming/trademark).

## Task 2 — Data model: extend the feedback table (R5.2, R6.1–6.2, D2.1)

- [ ] 2.1 Migration `0XX_gant_feedback_columns.sql`: add `event_type`
  (`game|training|video_review`, nullable), `phase_tags text[] default '{}'`,
  `gant_assisted boolean default false` (and/or `source`) to `game_feedback`.
  Idempotent; run manually in Supabase SQL Editor; commit to git. (D2.1)
- [ ] 2.2 Update `src/types/database.ts` `GameFeedbackRecord` for the new columns.
- [ ] 2.3 **Latent-bug fix (separate, shippable alone):** repoint or remove
  `reporting-api.getGameFeedback()` + desktop `GameFeedbackReport.tsx`, which
  select dead 4-Moments columns dropped in migration 022. (D2.1 note)

## Task 3 — Guardrails store (R10.2, D2.3)

- [ ] 3.1 Migration `0XX_gant_guardrails.sql`: single-row `gant_guardrails`
  (`phases_of_play jsonb`, `feedback_model text`, `tone_guide text`,
  `system_prompt_override text`, `updated_at`). RLS: authenticated coach/admin
  read, admin write (mirror `club_settings`, migration 046).
- [ ] 3.2 Seed the row from Task 0.3's output (or a placeholder if 0 not yet done).
- [ ] 3.3 (Later / admin UX) a desktop admin editor for the guardrails row — can
  be deferred; editing via SQL is acceptable for first launch.

## Task 4 — Edge Function `gant-refine` (R3, R4.1, R7, R11, D3, D7)

- [ ] 4.1 Scaffold `supabase/functions/gant-refine/index.ts` from `send-email`'s
  skeleton: `Deno.serve`, CORS + OPTIONS, require `Authorization` header (401
  otherwise). (D3)
- [ ] 4.2 Read `ANTHROPIC_API_KEY` (required) + optional `CLUB_*` from secrets;
  read `gant_guardrails` at request time; assemble the cached system prompt. (R10.3, D7)
- [ ] 4.3 Implement `GantRefineRequest`/`GantRefineResponse`; call Claude Sonnet
  with prompt caching; parse refined text + phase tags + optional clarifying
  question + progression note. (R3.2, R4.1, R11)
- [ ] 4.4 **Privacy boundary:** enforce that only `subjectUserId` + text/tags/
  dates leave; strip/reject identifying fields. Unit-test this. (R7.1–7.2)
- [ ] 4.5 Error/timeout handling that preserves the coach's raw text and signals
  retry. (R3.4)
- [ ] 4.6 Deploy: `supabase functions deploy gant-refine`; set `ANTHROPIC_API_KEY`
  via `supabase secrets set` (key handed over via a file outside the repo). Verify
  with a scripted authenticated call (all-positive input + a clarify round-trip).
  (D3, D9)

## Task 5 — Client API `src/lib/gant-api.ts` (D4)

- [ ] 5.1 `GantApi extends ApiClient`; `refine()` wrapping
  `functions.invoke('gant-refine')` with readable error unwrap (copy
  `email-api.ts`). 
- [ ] 5.2 `saveFeedback(...)` reusing/extending `gamesApi.createGameFeedback` to
  write the new columns; sets `gant_assisted=true`, `created_by`=coach. (R6.1, R6.4)
- [ ] 5.3 Read methods: `getFeedbackForPlayer`, `getTeamFeedback` (RLS-scoped),
  plus a helper that assembles userId-keyed `history` for progression. (R11, D4)

## Task 6 — Coach capture/refine UI (replaces AICoach stub) (R1–R4, D5)

- [ ] 6.1 Pure logic in `src/lib/gant-capture-logic.ts`: pending-entry model,
  review-list ordering, "discard raw on approve" transition, offline enqueue/flush
  ordering. Unit-tested. (R2.4, R4.4, R4.5, R9.2)
- [ ] 6.2 Replace `src/pages/AICoach.tsx` with the Gant screen: context bar (team/
  scope/player/event pickers reusing Coaching/Games patterns), capture control,
  refined-draft card (editable text, phase tags, clarify box, progression note),
  actions (Approve / Refine again / Next), pending review list. (D5)
- [ ] 6.3 Gate the screen on coach-authority — same rule as `tabsForRole`
  `showCoaching` and the write RLS; resolve the `/ai-coach` vs `/coaching` role
  mismatch. (R1.2, R6.3)
- [ ] 6.4 Desktop equivalent under `src/pages/desktop/` following existing layout
  conventions. (D5)

## Task 7 — Player / caregiver feedback view (R8, D6) — **blocked on Task 1.1**

- [ ] 7.1 Migration `0XX_feedback_player_caregiver_read.sql`: additive SELECT
  policies — player reads own individual + own team feedback; caregiver reads
  linked child's individual + child's team feedback (reuse migration 060/061
  caregiver-team resolver pattern). Run manually; commit. (R8.5, D6.1)
- [ ] 7.2 Team-view UI surface in `TeamPage.tsx` per the **confirmed** Req 8.4
  contents: individual feedback (me/my child), team feedback, candidate
  progression view. Never expose `gant_assisted`/source. (R8.2–8.4, D6.2)
- [ ] 7.3 Live RLS verification: player sees only own+team; caregiver sees linked
  child's; a player cannot read another player's individual feedback;
  coach/manager/admin unaffected. (D9)

## Task 8 — Event-type extension: training & video review (R5) 

- [ ] 8.1 Wire capture + save for `training` and `video_review` event types
  (games already work). Decide video-review event handling (existing event / ad-
  hoc / none) per R5.3. Can follow slice 1 once the game path is proven.

## Task 9 — Speech-to-text + offline queue (R9, D8)

- [ ] 9.1 Add a Capacitor speech-recognition plugin (or Web Speech path);
  **confirm offline support** → choose text queue (R9.2) vs audio queue (R9.3). (R9.4)
- [ ] 9.2 On-device transcription; audio never leaves device, deleted post-
  transcription if the audio-queue fallback is used. (R7.4, R9.3)
- [ ] 9.3 Local offline queue for raw entries; flush + refine on reconnect;
  reuse Task 6.1's ordering logic. (R9.2)
- [ ] 9.4 If audio-queue path taken, add the privacy-policy clause. (R9.3, R7.5)

## Task 10 — Progression review (R11, D4)

- [ ] 10.1 Assemble userId-keyed history (bounded by the confirmed window, R11.3)
  and pass to `gant-refine`; surface the same/new-issue prompt to the coach. (R11)

## Task 11 — Session suggestions (R12) — lower priority / Gant phase 2

- [ ] 11.1 Coaching-page suggestions from a team/player's feedback history;
  fixed-library vs free-form per the confirmed R12.2 decision.

## Task 12 — Privacy policy + docs (R7.5, R13)

- [ ] 12.1 Add a Gant section to `docs/privacy-policy-draft.md` (User-ID-only to
  AI, no audio transmission, retention aligned with V1.R). Gate before any store
  release.
- [ ] 12.2 Update `CHANGELOG.md` and `NEXT-SESSION-NOTES.md` (move Gant from
  "considered" to in-progress) per project standards as slices land.

## Task 13 — Verification checkpoint

- [ ] 13.1 `npm test` + `npm run build` clean on the pushed head.
- [ ] 13.2 Full manual live pass (capture → refine → clarify → approve →
  player/caregiver sees it; offline capture → reconnect). Nothing "done" until
  proven live.
