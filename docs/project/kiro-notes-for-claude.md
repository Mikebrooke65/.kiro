# Kiro's notes for Claude (cross-tool alignment)

**Author:** Kiro (the AI coding agent in the Kiro IDE), writing on 2026-09-04.
**Audience:** Claude (Claude Code / Cowork) and the repo owner.
**Why this file exists:** the owner runs *both* Kiro and Claude on this repo and
wants us working from one aligned understanding. Kiro's operating conventions
live in `.kiro/steering/project-standards.md`; Claude's live in `CLAUDE.md`.
This file reconciles the two: what `CLAUDE.md` doesn't cover, what looks out of
date, and — most importantly — where the two docs appear to **conflict**, with
evidence rather than an assumption about who's right.

I was explicitly asked **not** to edit `CLAUDE.md` (Claude has context on why
each line is there that I don't). Treat everything below as suggestions for
Claude to fold into `CLAUDE.md` itself.

Everything here was checked against the actual repo state on branch
`prototype` at commit `bbe6e95`, from the clone at
`C:\Users\miker\Kiro projects\WCR Football App`.

---

## 1. Git remote & push — the flagged conflict, confirmed

**What I actually observe in this clone (`git remote -v`, `git branch -vv`):**
- The **only** remote is `kiro` → `https://github.com/Mikebrooke65/WCR-Football-App.git`.
- There is **no `origin`**.
- Branch `prototype` has **no upstream configured** — so a bare `git push`
  errors with *"fatal: no upstream configured for branch 'prototype'"*. The
  push that works is the explicit form:
  ```
  git push kiro prototype
  ```

**How this squares with the two docs:**
- `project-standards.md` (Kiro's) says: only remote is `kiro`, no `origin`, use
  `git push kiro prototype`. **That matches reality in this clone.**
- `CLAUDE.md` step 4 tells the user to run a bare `git push` (and the broader
  section is built around a `git format-patch` → `git am` → `git push`
  handover). The bare `git push` would **fail** in this clone as configured,
  and there is no `origin` here.

**The honest reconciliation (not "Kiro is right, Claude is wrong"):**
The difference is almost certainly *environmental*, not a factual disagreement:
- **Kiro** runs on the owner's laptop with a real terminal, so it commits and
  pushes directly with `git push kiro prototype`.
- **Claude/Cowork** runs in a cloud sandbox with no push access to the owner's
  remote, hence the patch (`git am`) handover — the user then runs the final
  push on their own machine.

So the patch workflow itself isn't wrong for Cowork. But two concrete things are
worth Claude correcting in `CLAUDE.md`:
1. **Name the remote.** The push command in this repo is `git push kiro prototype`,
   not a bare `git push` (which fails — no upstream), and there is no `origin`.
   If the clone Claude/Cowork hands patches into has a differently-named remote,
   that's a per-clone quirk to reconcile — but the canonical remote pointing at
   `github.com/Mikebrooke65/WCR-Football-App` is named `kiro` on the owner's
   Kiro laptop.
2. If an `origin` remote ever appears, `project-standards.md` says to remove it
   (it shouldn't exist). Worth Claude and the owner agreeing on that so the two
   clones don't drift into different remote setups.

---

## 2. Two working clones on the owner's machine — coordination risk

`CLAUDE.md` states the owner's dev machine path is
`C:\Users\miker\WCR-Football-App`. **Kiro is operating from a different path:**
`C:\Users\miker\Kiro projects\WCR Football App`.

Both push to the same GitHub repo/branch, so the *remote* is the single source
of truth — but two separate working directories on one machine can drift out of
sync locally. **Practical guidance for both tools:** always `git pull` (or
re-clone/verify head) before starting work, because the other tool may have
pushed since. If these are meant to be the same clone, the paths need
reconciling; if they're deliberately separate, treat the GitHub `prototype`
branch as the only truth and never assume the other clone's working tree
matches.

---

## 3. Status source of truth — a real divergence

- `CLAUDE.md` says: for feature *status*, see `.kiro/specs/<feature>/tasks.md`.
- `project-standards.md` says (mandatory, session-start): **read
  `NEXT-SESSION-NOTES.md` (repo root) first** — it's the single source of truth
  for overall V1 status, what's done, in progress, and next.

These aren't contradictory but they're not aligned either. The reality today:
- **`NEXT-SESSION-NOTES.md`** = the cross-cutting V1/V2 status picture (the
  "where things stand" table, the build-order, the V2 backlog). Read it first
  for *"what should I work on / what's the state of the project."*
- **`.kiro/specs/<feature>/tasks.md`** = the detailed per-feature checklist and
  completion notes for one feature.

Suggestion for `CLAUDE.md`: point at **both**, and name `NEXT-SESSION-NOTES.md`
as the top-level status doc to read at session start (it currently isn't
mentioned there at all).

---

## 4. Spec-doc git-tracking — current facts (CLAUDE.md's note partly resolved)

`CLAUDE.md` flags that some specs had `design.md`/`tasks.md` delivered to disk
but never committed. Current `git ls-files` state:
- `streamlined-invites-and-child-access/` — **still only `requirements.md` is
  tracked.** `design.md`/`tasks.md` are not in git. CLAUDE.md's warning stands
  for this spec; worth committing them (or confirming they're intentionally
  out).
- `gant-ai-feedback-assistant/` — **all three tracked** (`requirements.md`,
  `design.md`, `tasks.md`). The recommended "commit all three from the start"
  practice was followed here.

So the recommendation in `CLAUDE.md` is correct and already being followed for
new specs; only the older `streamlined-invites` spec still needs catching up.

---

## 5. Things CLAUDE.md doesn't cover that Claude should know

These are in Kiro's `project-standards.md` but absent from `CLAUDE.md`. They're
real project rules, not preferences — worth Claude having:

**Club-agnostic rule (new code only).** No hardcoded club name, colours, logo,
domain, or URL in new code. Branding comes from: `club_settings` via a
`useClubBranding()` hook (client) and env vars with generic fallbacks
(`CLUB_NAME`, `CLUB_COLOR`, `APP_URL`, `EMAIL_FROM`, `EMAIL_REPLY_TO`) in Edge
Functions. Existing hardcoded WCR code is left alone (retrofitting is a V3
concern). Much of `src/app/**` was dead WCR-specific code — **note: Kiro
deleted the orphaned `src/app/` tree on 2026-09-04**, so that caveat in older
docs is now moot.

**Database table conventions:**
- Team membership → use `team_members` (NOT `user_teams`, which is only used by
  AuthContext profile loading).
- Games are `events` with `event_type = 'game'` — query the `events` table, not
  `games`. `game_feedback.game_id` references `events.id` (any event_type).
- Soft-delete with `deleted_at`; audit fields `created_by`/`updated_by`.

**Display conventions:**
- Team names always render as `"{age_group} {name}"` → e.g. "U9 Lithium" (never
  the name alone, never "Lithium (U9)").
- Page/brand colours are fixed product design, not club branding: Home blue
  `#0091f3`, Coaching green `#22c55e`, Games orange `#ea7800`, Resources purple
  `#8b5cf6`, Schedule cyan `#06b6d4`, Messaging grey `#545859`. Progress Notes
  (Gant) uses amber `#d97706`.

**Docs to update after changes:** `CHANGELOG.md` (user-facing) and
`CONVERSATION-HISTORY.md` (technical journey), plus `NEXT-SESSION-NOTES.md` when
status changes.

**Secrets handover:** never paste a secret into chat. Save it to a file
*outside* the repo (e.g. `C:\Users\miker\<name>.txt`), pipe into
`supabase secrets set`, then delete the file. `.env` changes should be mirrored
to the OneDrive backup (`C:\Users\miker\OneDrive\Project Secrets\`).

---

## 6. Verification — what Kiro actually runs, and the current test baseline

Kiro verifies in the owner's working tree directly (no sandbox/patch step):
`npm run build`, then `npx vitest --run`. The scoped-`tsc` trick in `CLAUDE.md`
(throwaway `tsconfig.tmpcheck.json`, strict, `jsx: react-jsx`,
`moduleResolution: Bundler`, `types: ["vite/client"]`) is exactly what Kiro uses
too — good alignment.

**Current test baseline (as of `bbe6e95`): 254 passing + 2 that are
environment-gated** (`256` total). Those 2 are the live-network "redeem-invite"
integration tests in `src/lib/invites-api.preservation.test.ts`, wrapped in
`describe.skipIf(!LIVE_READY)` where `LIVE_READY` requires `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` **and `SUPABASE_SERVICE_ROLE_KEY`** in
`.env.development`. So the reading depends on the environment:
- **No service-role key present (e.g. Claude's sandbox):** the block **skips** →
  "254 passed, 2 skipped", exit 0.
- **Service-role key present (e.g. the repo owner's laptop):** the block **runs
  live** and currently **fails** → "254 passed, 2 failed", exit 1.
Neither is a regression from local code changes. **Don't treat the 2 as a code
regression** — but note they genuinely *fail* when run live on the owner's
machine, which is worth understanding before go-live (it's the `redeem-invite`
live path, separate from feature work). If the **passing count drops below 254**,
or a *different* file fails, that's a real problem.

**Known build-invisible TypeScript errors** (Vite/esbuild doesn't type-check, so
`npm run build` stays green despite these — don't chase them as if you caused
them):
- `src/lib/teams-api.ts` — a `TeamMemberWithTeam` map missing the required
  `is_coach` field (around line 168/207). Pre-existing, tracked.
- `src/pages/Games.tsx` `loadGames()` uses `gamesApi.supabase` (a `protected`
  member) — pre-existing.
- (CLAUDE.md's own `JSX.Element` / `TS2503` note is a separate, real tooling gap
  — still applies.)

---

## 7. Current repo state Claude may not know (as of 2026-09-04)

- **Migrations are up to `075`.** Latest: `075_messages_admin_inbox.sql` (makes
  `messages.team_id` nullable + a shared admin inbox — the "message the club
  admins" fix, V1.M). Migrations 068–074 are the Gant/Progress Notes data model.
  All run live by the owner in the SQL Editor.
- **Gant / "Progress Notes" is built (spec `gant-ai-feedback-assistant`, Tasks
  1–9).** AI coaching-feedback assistant: capture → refine (via `gant-refine`
  Edge Function, deployed) → review → approve; pending queue; person/team notes;
  auto-summary; and an admin desktop guardrails+usage screen at
  `/desktop/progress-notes`. User-facing name is "Progress Notes"; "Gant" is
  internal only (never shown to players/caregivers). Remaining Gant work is
  V2/phase-2 (see `NEXT-SESSION-NOTES.md` V2.7) plus a combined privacy+retention
  workstream.
- **`src/config/desktopFeatures.ts`** now exists — a launch feature-flag file.
  `reporting: false` hides the desktop Reporting suite for the V1 trial
  (deferred to V2.8); flip to `true` to re-enable. It gates both the sidebar nav
  and the routes.
- **Desktop is Admin-only for V1.** The `/desktop` tree is gated by one
  `ProtectedRoute allowedRoles={[ADMIN]}`; the sidebar "Main/Admin" split is now
  purely visual.
- **Edge Functions** in play: `gant-refine`, `send-email`, `send-message-push`,
  `remove-team-member`. `ANTHROPIC_API_KEY` is set as a Supabase secret
  (`gant-refine`, model `claude-sonnet-4-6`, overridable via `CLAUDE_MODEL`).
  CLAUDE.md's deploy guidance (`npx supabase functions deploy <name>`, separate
  from `git push`) is correct and still applies.

---

## 8. Net summary for Claude

Most of `CLAUDE.md` is accurate and useful — the migration/live-DB warnings, the
Netlify-credits deploy gotcha, the Edge Function deploy step, and the
verify-before-deliver discipline all match what Kiro sees. The things worth
updating:
1. Push command is `git push kiro prototype` (remote is `kiro`; no `origin`; no
   upstream, so bare `git push` fails). Reconcile if Claude's clone differs.
2. Add `NEXT-SESSION-NOTES.md` as the session-start status doc.
3. Add the club-agnostic rule, the `team_members`/`events` table conventions,
   and the team-name display format.
4. Note the 254/2 test baseline and the known build-invisible type errors.
5. `src/app/` has been deleted; migrations are at 075; Gant/Progress Notes and
   `desktopFeatures.ts` now exist.

If any of this contradicts something Claude knows from context I don't have,
Claude should trust its own context and flag the disagreement to the owner
rather than silently overwriting — same principle the owner asked of me.
