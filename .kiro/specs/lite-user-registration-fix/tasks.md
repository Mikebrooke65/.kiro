# Implementation Plan

## Overview

Bug: self-registration from an invite link fails with *"new row violates row-level security
policy for table users"* because `supabase.auth.signUp()` returns no session under email
confirmation, so the client is still `anon` when it inserts into `users`.

Fix: move the whole transaction into a new Supabase Edge Function `redeem-invite` running
under `service_role`, with compensating rollback, and pre-confirm the account only when the
submitted email matches the invite's `recipient_email`.

Test tooling reality (from design): the project has no test framework. Exploratory and
integration tests are `tsx` scripts in `scripts/` following `create-test-user.ts` /
`test-auth.ts`. Property-based tests need `vitest` + `fast-check` added as devDependencies
and are run with `vitest --run` (never watch mode).

All test scripts MUST use throwaway email addresses, clean up after themselves, and guard
any auth-user deletion so it cannot run against real accounts.

## Task Dependency Graph

```
1. Bug condition exploration test (FAILS on unfixed code)
        |
2. Preservation property tests (PASS on unfixed code)
        |
3. Fix
   3.1 Pure decision helpers
        |
   3.2 redeem-invite Edge Function ---> depends on 3.1
        |
   3.3 redeemInviteCode() wrapper ---> depends on 3.2
        |
   3.4 LiteLandingPage error copy ---> depends on 3.3
        |
   3.5 Unit + property tests for helpers ---> depends on 3.1
        |
   3.6 Deploy Edge Function ---> depends on 3.2
        |
   3.7 Re-run task 1 test (now PASSES) ---> depends on 3.3, 3.6
        |
   3.8 Re-run task 2 tests (still PASS) ---> depends on 3.4, 3.6
        |
4. Integration verification
   4.1 Pre-confirmation + end-to-end ---> depends on 3.7
   4.2 Rollback under injected failure ---> depends on 3.7
   4.3 (Optional) orphan sweep ---> depends on 3.2
        |
5. Checkpoint ---> depends on 3.8, 4.1, 4.2
```

Tasks 1 and 2 MUST both be complete before any code in task 3 is written. Task 1 must be
observed failing and task 2 must be observed passing on the unfixed code.

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1"] },
    { "wave": 3, "tasks": ["3.2", "3.5"] },
    { "wave": 4, "tasks": ["3.3", "3.6", "4.3"] },
    { "wave": 5, "tasks": ["3.4"] },
    { "wave": 6, "tasks": ["3.7", "3.8"] },
    { "wave": 7, "tasks": ["4.1", "4.2"] },
    { "wave": 8, "tasks": ["5"] }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Registration Completes Server-Side For New Registrants
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists and confirm or refute the root cause
  - **Scoped PBT Approach**: The bug is deterministic, so scope the property to concrete failing cases rather than generating broad input - a real valid, unexpired, unredeemed invite code plus a throwaway email with no `public.users` row, on this project (email confirmation enabled)
  - Create `scripts/explore-lite-registration-bug.ts`, run with `tsx`, using the **anon** key from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` - using the service key would mask the entire bug
  - Bug condition under test (from design `isBugCondition`): `inviteIsValid(code) AND NOT existsUserWithEmail(email) AND projectHasEmailConfirmationEnabled()`
  - Assertions match Property 1 in design: `success = true`, no RLS error, auth user exists, `users` row exists with `user_type = 'lite'` and `privacy_consent_at` set, `team_members` row exists for `invite.team_id`, `invite_codes.redeemed_by = user.id`
  - Case 1: submit `invitesApi.redeemInviteCode()` against a valid code with a new email matching the invite's `recipient_email`
  - Case 2: after case 1, query for an auth user with no `public.users` row - records the orphan (defect 1.2)
  - Case 3: immediately retry the same submission - records the different "user already registered" error
  - Case 4: assert `supabase.auth.getSession()` is null immediately after `signUp()` - the single observation that confirms the mechanism
  - Case 5: submit an email that already has a `users` row, as `anon`, and record what actually happens - this establishes whether 3.1 is a real preservation case or a second latent defect (see the preservation baseline caveat in design)
  - Case 6: confirm Supabase sends its own confirmation email during the unfixed flow (defect 1.3)
  - Case 7: record the current outcome for an expired code and an already-redeemed code, so the 3.3 baseline is captured before any change
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found in the script output and in the spec notes, including whether case 5 also fails
  - Mark task complete when the test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.5, 2.6_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Inputs Behave Identically
  - **IMPORTANT**: Follow observation-first methodology - run the UNFIXED code first, record real outputs, then assert them
  - Non-bug condition under test: everything where `isBugCondition(X)` returns false - existing-user emails, already-a-member users, invalid / redeemed / expired codes, client-side validation rejections
  - Add `vitest` and `fast-check` as devDependencies and a `"test": "vitest --run"` script - property-based testing is what gives the stronger "for all non-buggy inputs" guarantee
  - Observe on UNFIXED code and record: existing user against a valid code (3.1), user already in the invite's team (3.2), invalid / redeemed / expired code statuses and the expired-code notification to the inviter (3.3), `privacy_consent_at` capture (3.5), anon read of `invite_codes` still working under migration 043 (3.6), client-side validation blocking missing fields / password under 6 chars / unticked consent before any network call (3.7), team name rendering as `{age_group} {name}` (3.8), admin create-user path via `netlify/functions/create-user.ts` (3.9)
  - **Baseline caveat**: if observation confirms the existing-user lookup returns nothing under `anon` (no policy grants `anon` SELECT on `public.users`), then `F(X)` for existing users is an error today, not the documented behaviour. In that case assert the **documented intent** of 3.1 and 3.2 and record the deviation explicitly in the test file - widening the fix must be a decision, not an accident
  - Write property-based tests (`vitest` + `fast-check`) for the pure decision logic that exists today and must not change: for randomly generated invite records, the status derived by `validateInviteCode()` is total and specific - unredeemed and unexpired → valid, `redeemed_by` set → `redeemed`, `expires_at` in the past → `expired` - never a crash and never an unmapped fall-through (3.3)
  - Write scripted integration preservation tests in `scripts/preserve-lite-registration.ts` for the database-touching cases, because their outcome depends on real RLS and real GoTrue behaviour
  - Run tests on UNFIXED code with `npm test -- --run` and `tsx`
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behaviour to preserve), except any case the baseline caveat reclassifies - document those clearly rather than deleting them
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 3. Fix for RLS failure in lite user registration

  - [x] 3.1 Extract the pure decision helpers used by the handler
    - Create `supabase/functions/redeem-invite/logic.ts` (importable by tests) holding no I/O
    - `normalizeEmail(email)` → `lower(trim(email))`, used for every lookup, insert and comparison in one invocation
    - `emailMatchesInvite(submittedEmail, recipientEmail)` → true only when `recipient_email` is not null and the normalised values are equal
    - `validateRequest(body)` → explicit accept or a specific rejection reason for missing `code` / `email` / `password` (min 6) / `first_name` / `last_name` / `privacy_consent`
    - `deriveInviteStatus(invite, now)` → `valid` | `invalid` | `redeemed` | `expired`, machine-readable so the landing page keeps its distinct messages
    - `mapError(rawError)` → plain-language message drawn from a known safe set; never contains "row-level security", "violates", "constraint" or a policy name
    - `plannedCompensations(created)` → the rollback list in reverse creation order, never targeting pre-existing records
    - _Bug_Condition: isBugCondition(X) from design_
    - _Expected_Behavior: Properties 1, 3, 4 from design_
    - _Preservation: Preservation Requirements 3.3, 3.7 from design_
    - _Requirements: 2.4, 2.7, 2.8, 3.3, 3.7_

  - [x] 3.2 Implement the `redeem-invite` Edge Function
    - Create `supabase/functions/redeem-invite/index.ts`, following `supabase/functions/send-email/index.ts` for structure: `Deno.serve`, CORS preflight, JSON error bodies, non-2xx on failure
    - Construct the client with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (both auto-injected, no new secrets), `auth: { persistSession: false, autoRefreshToken: false }` as in `scripts/create-test-user.ts`
    - Accept a caller with no user session - supabase-js sends the anon key as bearer, which satisfies default JWT verification; do NOT additionally require an end-user session the way `send-email` does. If verification rejects the anon key, deploy with `--no-verify-jwt`
    - **The invite code is the authorization**: require a code that is present, unredeemed and unexpired; ignore any client-supplied `role`, `user_type`, `team_id` or `active` and set them server-side; `console.error` rejected attempts. Record that rate limiting is out of scope for this fix
    - Validate the request and normalise the email once via `logic.ts`
    - Re-validate the code server-side under `service_role` - the client check is advisory only - and return distinct `invalid` / `redeemed` / `expired` statuses
    - Resolve the user: existing `public.users` row → use it, create nothing; no profile row but an auth user exists for that email (pre-fix orphan) → adopt it **only if** `emailMatchesInvite`, setting the submitted password and `email_confirm` per the match, otherwise return "an account already exists for this email — try logging in instead"; otherwise `auth.admin.createUser({ email, password, email_confirm: emailMatchesInvite, user_metadata: { first_name, last_name } })`
    - Look the auth user up via the admin users endpoint filtered by email - PostgREST cannot reach the `auth` schema
    - Insert `users` with `role: 'player'`, `user_type: 'lite'`, `active: true`, `cellphone: ''`, `privacy_consent_at` set to now when consent was given
    - Insert `team_members` for `invite.team_id` with `role: 'player'`, skipping when a row already exists
    - Set `redeemed_by` / `redeemed_at` last, only after every other write succeeded, so a failure never burns the code
    - Compensating rollback on any failure: undo in reverse only what this invocation created - delete the `team_members` row, then the `users` row, then `auth.admin.deleteUser()` - never touching pre-existing records. `netlify/functions/create-user.ts` is the single-step pattern to follow
    - Map failures to plain-language messages, log raw detail with `console.error`, return only the safe message
    - Club-agnostic: no club name, colour, logo, domain or URL in this function - it returns data only
    - _Bug_Condition: isBugCondition(X) from design_
    - _Expected_Behavior: Properties 1, 3, 4 from design_
    - _Preservation: Preservation Requirements 3.1, 3.2, 3.3, 3.5 from design_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.5_

  - [x] 3.3 Convert `redeemInviteCode()` to a thin client wrapper
    - `src/lib/invites-api.ts`: keep the signature `(code: string, userData: LiteRegistrationData): Promise<User>` so `LiteLandingPage` compiles unchanged
    - Body: `this.supabase.functions.invoke('redeem-invite', { body: ... })`, then return the `User` from the response
    - Reuse the `extractFunctionError` approach from `src/lib/email-api.ts` - `functions.invoke` otherwise collapses every failure into "Edge Function returned a non-2xx status code", which would defeat 2.4
    - Remove the client-side `signUp()` / `users` insert / `team_members` insert / `invite_codes` update sequence entirely
    - Leave `validateInviteCode()` unchanged - it still runs client-side and anonymously via migration 043 and still drives the three error states and the expired-code notification
    - _Bug_Condition: isBugCondition(X) from design_
    - _Expected_Behavior: Property 1 from design_
    - _Preservation: Preservation Requirements 3.3, 3.4, 3.6 from design_
    - _Requirements: 2.1, 2.4, 2.6, 3.3, 3.4, 3.6_

  - [x] 3.4 Update `LiteLandingPage` error copy only
    - `src/pages/LiteLandingPage.tsx`: show the server's plain-language message with a safe fallback, and drop any path that could render raw `err.message` database text
    - Leave client-side validation, the privacy notice, the `{age_group} {name}` heading and success screen, and the Go to Login link exactly as they are
    - _Bug_Condition: isBugCondition(X) from design_
    - _Expected_Behavior: Property 4 from design_
    - _Preservation: Preservation Requirements 3.7, 3.8 from design_
    - _Requirements: 2.4, 2.5, 3.7, 3.8_

  - [x] 3.5 Write unit and property tests for the pure helpers
    - **Property 3: Bug Condition** - Pre-Confirmation Follows The Email Match
    - **Property 4: Bug Condition** - No Orphan Or Partial State On Failure
    - Unit tests: `emailMatchesInvite` across case differences, leading/trailing whitespace, null `recipient_email`, non-matching address; `validateRequest` for each missing field, password under 6, consent false; `deriveInviteStatus` for each status; `mapError` for every internal failure; `plannedCompensations` ordering
    - Property test (supports Property 3): for randomly generated addresses with random case and surrounding whitespace, `emailMatchesInvite` agrees with `normalizeEmail(a) === normalizeEmail(b)`
    - Property test (supports Property 4): for arbitrary generated error objects and message strings, the mapped message is drawn from the known safe set and never contains raw database text
    - Property test (supports Property 2): for arbitrary generated request payloads and invite records, validation and status derivation are total - always an explicit accept or a specific rejection, never a crash or unmapped fall-through
    - Property test (supports Property 4): for a randomly generated sequence of succeeded/failed steps, the compensations undo exactly the records created in that invocation and nothing pre-existing
    - Run with `vitest --run`
    - _Requirements: 2.3, 2.4, 2.7, 2.8_

  - [x] 3.6 Deploy the Edge Function
    - Run `supabase functions deploy redeem-invite`
    - **This fix is not live on `git push kiro prototype`** - Edge Functions do not deploy with the app. The symptom of forgetting is the client calling a function that does not exist
    - Add the deploy step to `docs/deployment/DEPLOY-EDGE-FUNCTIONS.md`
    - _Requirements: 2.1_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Registration Completes Server-Side For New Registrants
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes, the expected behavior is satisfied
    - Run `scripts/explore-lite-registration-bug.ts` from step 1
    - **EXPECTED OUTCOME**: Test PASSES - no RLS error, all four writes present, no orphan, retry clean, and `getSession()` null throughout (confirms the browser never needed a session)
    - _Requirements: 2.1, 2.3, 2.5, 2.6_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Inputs Behave Identically
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests and `scripts/preserve-lite-registration.ts` from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions) - existing user gains membership only, no duplicate `team_members` row, invalid / redeemed / expired statuses and messages unchanged, expired code still notifies the inviter, `privacy_consent_at` still recorded, migrations 043 and 044 still in place, client-side validation unchanged, team names still `{age_group} {name}`, admin create-user path untouched
    - Confirm all tests still pass after the fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [ ] 4. Integration verification against the real project
  - [x] 4.1 Verify pre-confirmation and end-to-end registration
    - **Property 3: Bug Condition** - Pre-Confirmation Follows The Email Match
    - Happy path, matching email: real invite code → register → all four writes → log in immediately with no confirmation step
    - Happy path, non-matching email: registration and membership complete, account NOT pre-confirmed, login gated by Supabase confirmation
    - Copy Link delivery behaves identically to an emailed link, and Send Link / Resend Link still work
    - Existing user across two teams: one account, two `team_members` rows, no second auth user
    - Assert `getSession()` is null before, during and after the successful call
    - Confirm the call resolves against the absolute `https://<project-ref>.supabase.co/functions/v1/redeem-invite` URL in the Android wrapper, not a relative app-origin path - the reason D1 chose an Edge Function
    - Confirm the flow fails loudly with a clear message if `redeem-invite` has not been deployed
    - _Requirements: 2.2, 2.5, 2.6, 2.7, 2.8, 3.1, 3.4_

  - [x] 4.2 Verify rollback under injected failure
    - **Property 4: Bug Condition** - No Orphan Or Partial State On Failure
    - Force the `team_members` insert to fail (nonexistent `team_id` on a crafted invite, or a temporary constraint)
    - Assert no auth user, no `users` row, no `team_members` row and no invite redemption attributable to the attempt
    - Assert the message shown contains no raw database policy or constraint text
    - Assert an otherwise-valid retry with the same email then succeeds
    - Orphan adoption: seed an auth user with no profile row for the invited address, register, and confirm the orphan is adopted with the submitted password; then the same with a non-invited address, which must be refused with the "account already exists" message rather than adopted
    - _Requirements: 2.3, 2.4_

  - [ ] 4.3 (Optional) One-off orphan sweep for pre-fix orphans
    - `scripts/cleanup-orphan-auth-users.ts`: report `auth.users` rows with no `public.users` row
    - Only for orphans whose email does not match an invite and therefore cannot be adopted by the handler
    - Destructive - default to dry-run and require an explicit flag to delete, with a guard against real accounts
    - _Requirements: 2.3_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run `npm run build` and `vitest --run`, plus the `tsx` exploration, preservation and integration scripts
  - Confirm no console errors in the browser during the registration flow
  - Update `CHANGELOG.md` (Fixed) and `CONVERSATION-HISTORY.md` per project standards
  - Commit and `git push kiro prototype`, then run `supabase functions deploy redeem-invite` if not already deployed
  - Ensure all tests pass, ask the user if questions arise.

## Exploration findings (task 1, run 2026-08-14 on unfixed code)

Script: `scripts/explore-lite-registration-bug.ts` (run `npx tsx scripts/explore-lite-registration-bug.ts`).
Outcome: **Property 1 violated — 9 failed assertions. Failure as expected; the bug is confirmed.**

- **Root cause CONFIRMED.** Case 5 reproduced the documented error verbatim under the `anon`
  role: `new row violates row-level security policy for table "users"`, failing at the
  `users` insert, with `getSession()` **null** immediately after `signUp()` (case 4). No
  session after `signUp()` → `auth.uid()` is null → migration 044's `id = auth.uid()` check
  cannot pass. Mechanism as hypothesised.
- **Baseline caveat CONFIRMED — 3.1 / 3.2 are not real preservation cases today.** A raw
  `anon` SELECT on `public.users` for an email that definitely has a row returned
  `rows=0, error=none`. RLS silently filters instead of erroring, so `existingUser` is always
  null in the anon flow and every registrant — existing user or not — is pushed into
  `signUp()`. The preservation tests in task 2 must assert the **documented intent** of 3.1
  and 3.2 and record the deviation; moving the lookup server-side under `service_role` fixes
  this second latent defect.
- **3.3 baseline recorded and healthy.** Expired → `expired`, already-redeemed → `redeemed`,
  nonexistent → `invalid`, each rejected at validation before any write.
- **Environment gap on cases 1, 2, 3, 6.** Two throwaway-address obstacles surfaced, neither
  related to the bug: Supabase Auth rejects RFC-2606 reserved domains outright
  (`Email address "...@example.com" is invalid`), and with a working domain the run hit
  `email rate limit exceeded` on this project's auth email quota. So the case-1 `signUp()`
  never created an auth user, and the orphan (1.2), the "user already registered" retry (1.3
  → case 3) and the direct confirmation-email observation (case 6) are **not yet recorded**.
  The rate-limit error is itself indirect evidence that `signUp()` tries to send Supabase's
  own confirmation email (1.3). To close the gap: re-run after the auth email quota resets,
  or raise the quota / configure custom SMTP in the Supabase dashboard first. The script is
  repeatable and needs no changes.
- **Cleanup verified.** Fixture invite codes, `public.users` rows and auth users were all
  removed; auth-user deletion is guarded to the `wcr-bugtest-*` throwaway pattern.
- **Note on the script.** It mirrors `invitesApi.redeemInviteCode()` statement for statement
  against an `anon` client rather than importing it, because `src/lib/supabase.ts` reads
  `import.meta.env`, which is undefined under `tsx` (verified). Keep the mirror in sync when
  task 3.3 rewrites the wrapper.

## Preservation findings (task 2, run 2026-08-14 on unfixed code)

Tooling added: `vitest@3.2.7` + `fast-check@4.9.0` (exact, devDeps), `"test": "vitest --run"`,
and `vitest.config.ts` (node environment, never watch mode).

Tests: `src/lib/invites-api.preservation.test.ts` (`npm test`) and
`scripts/preserve-lite-registration.ts` (`npx tsx scripts/preserve-lite-registration.ts`).
Outcome: **both PASS on unfixed code — 22 passed, 2 documented-intent skips, 15 script
assertions passed, 5 baseline deviations recorded.**

Baseline held (safe to assert as preservation):
- **3.3** all four statuses via the anon flow — valid / expired / redeemed / invalid — plus
  the distinct landing-page copy ("Code Expired" / "Already Used" / "Invalid Code") and the
  fallback to Invalid Code when no status is set. The status derivation is total and specific
  under property testing (500 runs). Recorded edge case: an unparseable `expires_at` is
  treated as `valid` today, never a crash.
- **3.5** `privacy_consent_at` stores the given timestamp on the `users` row, and the
  payload derivation (consent → ISO timestamp, no consent → null, plus `user_type: 'lite'`,
  `role: 'player'`, `active: true`, `cellphone: ''`) is stable under property testing.
- **3.6** an anonymous visitor can read `invite_codes` (migration 043 working); migrations
  043 and 044 present and unreverted.
- **3.7** client-side validation blocks unticked consent, missing fields and passwords under
  6 characters with the existing messages, in the existing branch order, before any network
  call. Total under property testing.
- **3.8** a team row renders as `{age_group} {name}` ("U9 Hydrogen"), never the bare name.
- **3.9** `netlify/functions/create-user.ts` present, all five steps intact (admin check,
  createUser, `users` insert, rollback, membership), and byte-identical to git HEAD. Not
  invoked live — it needs Netlify runtime env plus an admin JWT and creates real auth users.

**Five deviations recorded — documented behaviour that does not exist on unfixed code.**
All five trace to the same root: `anon` has no SELECT grant on `public.users`, `team_members`
or `teams`, and RLS filters silently (`rows=0, error=none`) instead of erroring.
1. **3.1** existing-user lookup as `anon` returns 0 rows for an email that definitely has a
   row → every registrant is pushed into `signUp()`. Confirms the design's baseline caveat.
2. **3.2** the duplicate-membership guard is equally blind under `anon`, so the current flow
   would attempt the insert rather than skip it.
3. **3.5** an `anon` insert into `users` carrying `privacy_consent_at` is rejected with
   *"new row violates row-level security policy for table users"* — the consent timestamp can
   never be persisted by the current client flow. (Observed with a direct insert probe, not
   `signUp()`, to stay off the auth email quota.)
4. **3.3 (notification half)** `notifyExpiredCodeUsage()` looks the inviter up in
   `public.users` as `anon` → 0 rows → no notification is emitted today. The status is still
   `expired`, so the landing-page message half of 3.3 is unaffected.
5. **NEW — 3.6 / 3.8 / 2.5, needs a decision before task 3.3.** Nothing grants `anon` SELECT
   on `teams`, so the `team:teams(*)` embed in `validateInviteCode()` comes back **null** and
   the invite page heading and success screen render **"undefined undefined"** for an
   anonymous visitor. The designed fix does **not** address this: `validateInviteCode()` stays
   client-side and anonymous, and the Edge Function returns data only. Either the function
   must also return the team (and `LiteLandingPage` use it), or a policy must grant `anon`
   SELECT on `teams` for invited codes. Left unfixed, 3.8 and 2.5 fail after the fix.

Deviations 1 and 2 are marked in the vitest file as `it.skip` named
`DOCUMENTED INTENT (deviation on unfixed code)` — visible, non-red, and re-enabled in task
3.8. Their decision-level logic is asserted and passing today.
*(Status of all five deviations after the fix: see "Preservation re-verification findings
(task 3.8)" below — 1, 2, 3 and 5 resolved, 4 persists.)*

Note on both test files: they mirror the current pure decision branches rather than importing
them, for the same reason as task 1 (`src/lib/supabase.ts` reads `import.meta.env`). When
task 3.1 extracts `supabase/functions/redeem-invite/logic.ts`, the mirrors should be replaced
by imports of the real helpers and **the assertions must not change**.

## Deployment findings (task 3.6)

`supabase functions deploy redeem-invite` — **deployed, ACTIVE, version 1.** CLI 2.114.0,
already logged in and linked to `pikrxkxpizdezazlwxhb`. Uploaded assets: `index.ts` and
`logic.ts` only.

- **Deployed with DEFAULT JWT verification — `--no-verify-jwt` was NOT needed.** A POST carrying
  the anon key as bearer reaches the handler and returns the handler's own validation errors
  (`400 {"error":"You must accept the privacy notice to continue.","reason":"consent_required"}`),
  not a 401. So the design's fallback is unnecessary and the function stays consistent with
  `send-email` rather than `create-user` (which sets `verify_jwt = false` in its own
  `config.toml`). No `config.toml` was added for `redeem-invite`.
- **Probe results** (invalid code, nothing written): `OPTIONS` → `200 ok` (CORS preflight);
  `POST` with anon key + bogus code → `400 {"error":"This invite code is not valid. Please check
  the link and try again.","status":"invalid"}`, i.e. rejected at server-side validation before
  any write. `POST` with no `Authorization` header at all → `401 UNAUTHORIZED_NO_AUTH_HEADER`
  from the gateway, which is expected since supabase-js always sends the anon key.
- **`logic.test.ts` does not break the deploy.** The CLI bundles only what the entrypoint
  imports, so the vitest/fast-check file next to the source was not uploaded. It stays in place.
- Docs updated: `docs/deployment/DEPLOY-EDGE-FUNCTIONS.md` now has a `redeem-invite` section
  (deploy command, expected output, the JWT decision, the verify/probe steps) plus the warning
  that `git push kiro prototype` does not deploy Edge Functions and that the symptom of
  forgetting is the client calling a function that does not exist.

## Verification findings (task 3.7, re-run 2026-08-14 on FIXED code)

Script: `scripts/explore-lite-registration-bug.ts` — the SAME test as task 1, re-run
(`npx tsx scripts/explore-lite-registration-bug.ts`) against the live fix on
`pikrxkxpizdezazlwxhb`.

First re-run: **10 of 11 assertions pass. 1 fails — `retry succeeds` — and the failure is the
assertion's premise, not the fix.** Every write-level assertion passes.

Final re-run after the case-3 re-scope decision below: **PROPERTY 1 HELD — 12 of 12 assertions
pass, 0 failures, exit code 0.** One assertion (case 3) was deliberately changed after the fix;
that change and its justification are recorded in full below and in the script header.

**Mirror kept in sync, assertions untouched.** Task 1 recorded that the script mirrors
`redeemInviteCode()` statement-for-statement rather than importing it (`src/lib/supabase.ts`
reads `import.meta.env`, undefined under tsx) and said to keep the mirror in sync when task
3.3 rewrote the wrapper. Done: `mirrorRedeemInviteCode()` is now a single anon-key
`functions.invoke('redeem-invite', …)` plus the wrapper's `extractFunctionError` body read.
The old `signUp()` → `users` insert → `team_members` insert → `invite_codes` update sequence
is gone from both. **No assertion changed.** Two result fields keep their task-1 names so the
assertion expressions stay byte-identical while the work moved server-side —
`existingUserFoundByAnon` now means "resolved to the pre-existing `public.users` row rather
than creating a new user" (observed with the service-role client either side of the call), and
`authUserIdFromSignUp` is the id the function returned. `sessionBeforeCall` was added next to
`sessionAfterSignUp`; both are observations, neither is asserted. Documented in the script
header.

Passing — Property 1 held on every write (2.1, 2.3, 2.5, 2.6):
- **Case 1** `success=true`, **no RLS error**, and all four writes present: auth user
  `520f7603-…`, `public.users` row with `user_type='lite'` and `privacy_consent_at` set,
  `team_members` row for `invite.team_id`, `invite_codes.redeemed_by = user.id`. The
  registration the bug made impossible now completes.
- **Case 2 — no orphan** (defect 1.2 closed): auth user exists *and* the profile row exists,
  `orphan=false`.
- **Case 4 — `getSession()` null throughout.** Null before the call and null after
  (`sessionBeforeCall=null`, `sessionAfterSignUp=null`). The browser never held a session at
  any point, which is the direct confirmation of 2.6: nothing in the path needs `auth.uid()`.
- **Case 5 — the 3.1 deviation is closed.** The existing-user path returns the existing user
  (`success=true`, `existingUserFoundByAnon=true`, one account, membership added). The raw
  `anon` SELECT on `public.users` still returns `rows=0, error=none`, so RLS is unchanged —
  the lookup simply happens server-side under `service_role` now. This is the second latent
  defect the design predicted, fixed as a consequence.
- **Case 7 — 3.3 baseline preserved**, with the landing page's own copy: expired → `expired`
  ("This code has expired. Your coach/manager has been notified…"), redeemed → `redeemed`
  ("This invite code has already been used."), nonexistent → `invalid` ("This invite code is
  not valid. Please check the link and try again."). All rejected at server-side validation
  before any write; none leaks database text (2.4).

**Environment gap from task 1 is closed.** Cases 1, 2, 3 and 6 are all recorded this run. No
`email rate limit exceeded` and no address rejection — `@mailinator.com` is accepted, and
**case 6 shows why the quota is no longer in the path**: `confirmation_sent_at=null` with
`email_confirmed_at=2026-08-17T00:44:58Z`, i.e. the account was pre-confirmed server-side
because the submitted address matched `recipient_email`, so Supabase sent no confirmation
email at all (2.7, and defect 1.3 closed for the matching-email case). Nothing was weakened
to get there.

**The one failure on the first re-run — `ASSERT retry succeeds` (case 3). Resolved by the
re-scope recorded under "DECISION TAKEN" below; it does not appear in the final run.**
```
✗ retry succeeds: retry error="This invite code has already been used."
firstAttempt: { success: true,  failedAt: null,     error: null }
retry:        { success: false, failedAt: validate, error: "This invite code has already been used." }
orphanLeftBehind: false
```
Triage: **the test is now wrong, the behaviour is right.** On unfixed code the first attempt
failed at the `users` insert, so case 3 re-submitted an *unredeemed* code and recorded the
"user already registered" error (defect 1.3). Post-fix the first attempt succeeds and redeems
the code, so the identical re-submission is correctly rejected as `redeemed` — the same
single-use behaviour this script asserts and passes in case 7b, and that the task-2
preservation tests assert for 3.3. Making `retry succeeds` pass would mean making an invite
code reusable, which contradicts 3.3. By task 3.7's own wording the retry *is* clean: distinct
plain-language message, no database text, no auth user, profile row, membership or redemption
attributable to it, and cleanup confirmed nothing left behind.
**DECISION TAKEN — case 3 re-scoped, both halves implemented (2026-08-14).** Options (a) and
(b) were both implemented rather than choosing between them, because together they preserve the
exact question case 3 was originally asking. This is the **only assertion in the script that
changed after the fix**; every other assertion is byte-identical to task 1, and the change is
documented at the change site and in the script header so it is auditable rather than silent.

- **Case 3a — same-code retry, re-scoped.** `ASSERT retry succeeds` became
  `ASSERT retry is cleanly rejected as redeemed, creating nothing`. It requires all of:
  `success=false`, `validationStatus='redeemed'`, `failedAt='validate'`, a non-empty message
  *distinct* from the first attempt's outcome, **no raw database text** (a new
  `containsDatabaseText()` check, wider than `isRlsError` — which is left byte-identical
  because case 1 asserts on it), and **nothing attributable to the retry**: auth users for the
  address, `public.users` rows and total memberships all measured either side of the call, plus
  the first code's `redeemed_by` / `redeemed_at` unchanged and the second code still unredeemed.
  Observed: `error="This invite code has already been used."`, `rawDbText=false`,
  `auth users 1->1, users rows 1->1, memberships 1->1`, `redemption unchanged? true`.
- **Case 3b — new, the original intent.** A **second valid code for the same email** must
  succeed, i.e. a second attempt is not blocked by leftover state from the first. Asserts
  `success=true`, the returned user is the *same* id as the existing profile row (no duplicate
  account — the admin endpoint still shows exactly **one** auth user for the address), and the
  second code's `redeemed_by` is that id. Observed: all three hold
  (`id=84c471a6-…`, `existingUserFoundByAnon=true`, `auth users for the address=1`).
- **Why not keep `retry succeeds`.** Making it pass would require invite codes to be reusable,
  contradicting preservation requirement 3.3 — the same single-use behaviour this script asserts
  and passes in case 7b and the task-2 preservation tests assert for 3.3. Half 3a checks nothing
  was left behind, half 3b checks progress is still possible, so the pair is **stronger** than
  the single original assertion, not weaker. Property 1 is not weakened: every write-level
  assertion in case 1 is untouched and still passes.

**Cleanup and guard verified.** The `wcr-bugtest-*` deletion guard is intact and unchanged
(`isThrowawayEmail` requires both the `wcr-bugtest-` prefix and a known throwaway domain, and
both cleanup paths refuse anything else). The first re-run removed 2 `public.users` rows, 4
fixture invite codes and 2 auth users, all `wcr-bugtest-mswihr2o4fh-*@mailinator.com`. The final
re-run added one fixture — the case-3b second valid code (`throwawayCode('E')`, addressed to the
same throwaway address) — which is covered by the existing teardown: its id lands in
`createdInviteIds`, and cleanup clears `redeemed_by` pointing at a throwaway user before
deleting the codes. That run removed 2 `public.users` rows, **5** fixture invite codes and 2
auth users, all `wcr-bugtest-mswiym8f158-*@mailinator.com`. Nothing else was touched.

## Preservation re-verification findings (task 3.8, run 2026-08-17 on FIXED code)

The SAME two tests as task 2, re-run against the live fix on `pikrxkxpizdezazlwxhb`
(`redeem-invite` ACTIVE, migration 045 applied). No new tests were written.

Outcome: **no regressions.**
- `npm test` → **2 files, 101 passed, 0 skipped** (task 2 recorded 99 passed + 2 skipped).
  `src/lib/invites-api.preservation.test.ts` 24 tests, `redeem-invite/logic.test.ts` 77.
  The only change in the count is that the 2 documented-intent skips now run and pass.
- `npx tsx scripts/preserve-lite-registration.ts` → **15 assertions passed, 0 failures**, and
  the deviations it records dropped from **5 to 4**: the `teams` embed is now a passing
  assertion instead of a deviation (`rows=1 error="none" embeddedTeam=present`).
- Corroboration: `npx tsx scripts/verify-anon-team-embed.ts` → **6 passed, 0 failed, 0
  skipped**. `npm run build` → clean.

Baseline held, unchanged: all four 3.3 statuses via the anon flow plus the distinct
landing-page copy and the Invalid Code fallback; the unparseable-`expires_at` edge case still
reads `valid`; `privacy_consent_at` storage on the `users` row; anon read of `invite_codes`
(043); migrations 043 and 044 present and unreverted; client-side validation messages and
branch order; the `{age_group} {name}` label ("U9 Hydrogen"); `netlify/functions/create-user.ts`
present, all five steps intact and byte-identical to git HEAD.

**Deviation status after the fix — 4 of 5 resolved.**
1. **3.1 existing-user lookup — RESOLVED, verified live.** The re-enabled test registers a
   throwaway address through `redeem-invite`, then redeems a second code for a *different*
   team as the same person: the function returns the existing user (`user.id` unchanged), the
   auth admin endpoint still shows exactly **one** auth user for the address, `public.users`
   still holds exactly **one** row with the same id and an untouched `privacy_consent_at`, the
   second code's `redeemed_by` is that id, and memberships go 1 → 2. Only the membership was
   added.
2. **3.2 duplicate-membership guard — RESOLVED, verified live.** A third code for the team the
   user is *already* in redeems successfully and leaves `team_members` for `(team, user)` at
   exactly **1** row; total memberships stay at 2 and no second auth user appears.
3. **3.5 `privacy_consent_at` — RESOLVED, verified live.** The row the Edge Function creates
   carries a non-null `privacy_consent_at` (with `user_type='lite'`, `role='player'`), and the
   existing-user path does not rewrite it. The script still records the raw `anon` insert being
   rejected with *"new row violates row-level security policy for table users"* — expected and
   correct: the anon write path stays closed and is no longer on the registration route.
4. **3.3 notification half — PERSISTS, unchanged, as predicted.** Task 3.3 deliberately left
   `validateInviteCode()` client-side and anonymous, so `notifyExpiredCodeUsage()` still looks
   the inviter up in `public.users` as `anon`, still gets `rows=0, error=none`, and still emits
   nothing. The status is `expired` and the "Code Expired" copy is intact, so the landing-page
   half of 3.3 is unaffected. Closing it is a decision outside this bugfix — move the
   notification server-side or grant a scoped read — and the notification itself is still a
   TODO in `invites-api.ts` (a `console.log`, no in-app message wired). Recorded, not fixed.
5. **`teams` embed / "undefined undefined" — RESOLVED by migration 045.** For an anonymous
   visitor `team:teams(*)` returns the invite's team and the heading renders "U9 Hydrogen".
   The policy is scoped as intended: a team whose only invite is expired stays invisible to
   `anon`, and `anon` still cannot update `teams`.

**Mirrors replaced by the real helpers (task 2's instruction; assertions unchanged).**
`baselineInviteStatus()` is now a one-line adapter over the shipped `deriveInviteStatus()` from
`supabase/functions/redeem-invite/logic.ts`, so the 3.3 unit and property assertions hold the
real helper — not a copy — to the recorded baseline. Every assertion is byte-identical.
Left as mirrors, with the reason stated in the file:
- `baselineClientValidation` / `BASELINE_VALIDATION_MESSAGES` and `BASELINE_ERROR_COPY` —
  client-side code in `LiteLandingPage` (form branch order, error-card titles).
  `validateRequest` / `messageForInviteStatus` are server-side counterparts with a different
  shape, not the same function. (Read side by side, `messageForInviteStatus` reproduces the
  landing page's three message bodies word for word; deliberately not asserted, since 3.8 may
  not add assertions.)
- `baselineUsersInsertPayload`, `baselineUserResolution`, `baselineShouldInsertTeamMember` —
  these decisions live inline in `redeem-invite/index.ts`, which imports Deno APIs and
  `npm:@supabase/supabase-js` and so cannot be imported by vitest. They are now covered
  end-to-end by the two re-enabled live tests instead.
- `baselineTeamLabel` — a render-time expression in `LiteLandingPage`.

**One consequence worth knowing:** `npm test` now touches the real project, because the two
re-enabled tests have to go through the deployed function to mean anything. They use a
throwaway `wcr-preserve-38-<runid>@mailinator.com` address, remove every fixture in `afterAll`
(memberships, invite codes, `users` row, auth user), guard auth-user deletion to the
`wcr-preserve-` prefix plus `@mailinator.com` domain, and skip themselves when the Supabase env
vars are absent. No confirmation email is sent (the submitted address matches
`recipient_email`, so `email_confirm` is true), which keeps the run off the auth email quota
that blocked task 1. Post-run sweep confirmed zero leftovers: no `users` rows, invite codes or
auth users matching the fixture pattern.

## Integration findings (task 4.1, run 2026-08-17 on FIXED code)

Script: `scripts/verify-lite-registration-integration.ts` (new — `npx tsx
scripts/verify-lite-registration-integration.ts`), run against the live project
`pikrxkxpizdezazlwxhb` with `redeem-invite` ACTIVE and migration 045 applied.

Outcome: **PROPERTY 3 HELD — 30 of 30 assertions pass, 0 failures, exit code 0.** One
bullet of the task is verified by code inspection rather than live execution (Send Link /
Resend Link, see below); everything else was exercised live.

Like the task-1 script it **mirrors `redeemInviteCode()` rather than importing it** — same
reason (`src/lib/supabase.ts` reads `import.meta.env`, undefined under tsx). The mirror is
one `functions.invoke('redeem-invite', …)` on an anon-key client with the same six payload
keys, plus the wrapper's `extractFunctionError` body read and the same fallback message.

**Happy path, MATCHING email (2.2, 2.5, 2.7) — PASS.** Real invite code addressed to the
submitted address → `success=true`, all four writes present (auth user; `public.users` row
with `user_type='lite'` and `privacy_consent_at` set; `team_members` row for
`invite.team_id`; `invite_codes.redeemed_by = user.id`), `email_confirmed_at` set,
`confirmation_sent_at=null` (no Supabase confirmation mail), and the response carries
`email_confirmed=true` / `email_confirmation_required=false`. **Login proven, not inferred:**
`signInWithPassword` on a separate fresh client returned `session=present, error=none`
immediately, with no confirmation step. That client is deliberately separate so the session
assertions below stay meaningful.

**Happy path, NON-MATCHING email (2.8) — PASS. This is the half task 3.7 did not cover.**
Invite addressed to `…-invited@mailinator.com`, submitted as `…-other@mailinator.com`:
registration still completes (`success=true`, `users` row with `user_type='lite'` and
`privacy_consent_at`, `team_members` row, invite redeemed by that user), the account is **not**
pre-confirmed (`email_confirmed_at=null`), and the response reports
`email_confirmed=false` / `email_confirmation_required=true`. Login is then **actually
refused**: `signInWithPassword` returned `session=null`, `error="Email not confirmed"`,
`code=email_not_confirmed` — the confirmation gate, not a wrong-password error. So the
`email_confirm: emailMatchesInvite` decision is observable end to end in both directions.
- **Observation worth recording, not a failure.** For the non-matching account
  `confirmation_sent_at` is also `null`: `auth.admin.createUser({ email_confirm: false })`
  leaves the account unconfirmed but GoTrue does not itself dispatch a confirmation mail for
  an admin-created user. Property 3 holds as written — registration completes, the account is
  not pre-confirmed, and Supabase's confirmation is the gate before login — but the
  registrant would need a resend/confirmation trigger to get through that gate. Sending one
  is not part of this bugfix (the V1.4 welcome email is out of scope); flagged here so it is
  a known consequence rather than a surprise.

**Copy Link delivery (3.4) — PASS live; Send Link / Resend Link PASS by inspection.**
- Live: the exact string `copyInviteLink()` puts on the clipboard
  (`{origin}/invite/{code}`) was built, the code recovered from its path the way the
  `/invite/:code` route hands it to `LiteLandingPage`, and registration run with that
  recovered code — all four writes present and the account pre-confirmed, identical to the
  matching-email case.
- **By inspection, NOT run live:** Send Link / Resend Link. Sending would consume the
  project's SMTP/auth email quota — the same quota that blocked task 1 with `email rate
  limit exceeded` — so the script asserts the send path in source instead: `sendLabel`
  renders `Resend Link` after a first send and both buttons call the same
  `sendInviteLink()`; that calls `emailApi.sendTeamInvite({ …, inviteCode: opts.code })`;
  `send-email` builds `${branding.appUrl}/invite/${encodeURIComponent(inviteCode)}`, i.e.
  the same `/invite/{code}` shape as the clipboard link; the redemption payload carries the
  code and the person's own fields only, with nothing delivery-specific; and
  `generateInviteCode()` is still a plain `invite_codes` insert, untouched by the fix. Both
  deliveries therefore differ only in transport, and redemption cannot tell them apart.

**Existing user across two teams (3.1) — PASS (cheap live re-check, plus task 3.8).**
Task 3.8 already proved this live and is cited rather than repeated; the re-check was almost
free because the fixtures existed. Redeeming a second code for a different team ("U9 Helium")
as the case-1 registrant returned the **same** `user.id`, and left exactly **1** auth user,
**1** `public.users` row and **2** `team_members` rows, with the second code redeemed by that
id. One account, two memberships, no second auth user.

**`getSession()` null before, DURING and after (2.6) — PASS.** Sampled on the client under
test: `before=null`, **25 in-flight samples all `null`** (polled every 40 ms while the invoke
promise was unsettled, so the call really was in flight, not sampled either side of it),
`after=null`. The client under test still held no session after the separate login client
signed in and out.

**Absolute Functions URL (D1's reason for choosing an Edge Function) — PASS, observed not
assumed.** The anon client was constructed with a recording `fetch`, so the URL supabase-js
actually requested is readable: `https://pikrxkxpizdezazlwxhb.supabase.co/functions/v1/redeem-invite`,
matching `${VITE_SUPABASE_URL}/functions/v1/redeem-invite` exactly. Parsed: `https:`,
host `pikrxkxpizdezazlwxhb.supabase.co`, path `/functions/v1/redeem-invite`. No relative or
app-origin request for the function appears anywhere in the recorded traffic, and the client's
own `functionsUrl` is `https://pikrxkxpizdezazlwxhb.supabase.co/functions/v1`. `src/lib/supabase.ts`
derives it from `VITE_SUPABASE_URL` and never reads `window.location`, which is what makes the
Capacitor/Android wrapper work — under `androidScheme: 'https'` a relative path would resolve
against the local webview origin instead.

**Fails loudly if `redeem-invite` is not deployed — PASS (simulated, nothing was
undeployed).** The live function was left ACTIVE; a deliberately nonexistent name
(`redeem-invite-absent-<runid>`) was invoked instead, which is the same condition as a
forgotten deploy: no function at that URL. Result: the call fails (never silently succeeds),
the wrapper's error path produces exactly
*"Something went wrong and we couldn't complete your registration. Please try again."* — no
`non-2xx`, `404`, `Function not found`, `BOOT_ERROR` or database text — and
`LiteLandingPage` renders it through `safeRegistrationErrorMessage()`, which replaces
anything that is not an `ApiError` with that same fallback. Nothing was written by the failed
attempt (no `users` row, no auth user for the address).

**Cleanup and guard verified.** Throwaway `wcr-int41-<runid>-*@mailinator.com` addresses only
(RFC-2606 domains are rejected by Supabase Auth — task 1 finding), teardown in a `finally` so
it runs on every exit path, and auth-user deletion guarded to the `wcr-int41-` prefix plus a
known throwaway domain, with an explicit REFUSED log for anything else. The run removed 3
`public.users` rows, 4 fixture invite codes and 3 auth users. Independent post-run sweep:
**0** `users` rows, **0** `ZI*` invite codes and **0** auth users matching the fixture
pattern. Nothing else on the project was touched — the only pre-existing rows read were one
team, one second team and one admin id, all read-only.

## Rollback findings (task 4.2, run 2026-08-17 on FIXED code)

Script: `scripts/verify-lite-registration-rollback.ts` (run
`npx tsx scripts/verify-lite-registration-rollback.ts`) against the live fix on
`pikrxkxpizdezazlwxhb` (`redeem-invite` ACTIVE). Every registration attempt goes through the
**anon** client via `functions.invoke`, the same path `invitesApi.redeemInviteCode()` takes;
the service-role client only builds fixtures, measures state either side of each call, and
cleans up.

Outcome: **PROPERTY 4 HELD — 16 of 16 assertions pass, 0 failures, exit code 0.**

**The task's preferred injection is impossible on this project, and the substitute fails the
same statement.** A crafted invite with a nonexistent `team_id` cannot be inserted:
`invite_codes.team_id` is `NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE`
(migration 036) and the live constraint is enforced — probed with the service role,
`23503 insert or update on table "invite_codes" violates foreign key constraint
"invite_codes_team_id_fkey"`. The ghost team is unreachable from the invite side either, since
deleting the team cascades the invite away with it. No constraint was added or dropped on the
live database. So the failure was injected through the membership insert's *other* foreign key
(`team_members_user_id_fkey`, also probed at 23503), using data alone:

1. Seed a decoy auth user `D` on a throwaway address plus a `public.users` row with `id = D`
   but `email =` the address about to register. Legitimate state: `users.id` references
   `auth.users(id)`, and `users.email` is UNIQUE (migration 001) without having to equal the
   auth address.
2. Register the target address. `findAuthUserByEmail` matches the exact normalised auth
   address, so `D` is not found and a **new auth user `B` is created** — the invocation now
   owns an auth user, which is what rollback has to undo.
3. The `users` insert for `B` hits `duplicate key … "users_email_key"`, which the handler reads
   as migration 006's trigger having pre-inserted the row, so it switches to
   `UPDATE … WHERE id = B`, matches nothing, returns no error, and continues.
4. The `team_members` insert for `user_id = B` therefore violates `team_members_user_id_fkey`.
   **The membership insert is the statement that fails**, with the ledger holding an auth user
   this invocation created plus a profile row it believes it created.

`reason: 'insert_team_member'` is **asserted, not assumed** — it is the proof that the auth
user really was created and the flow really did reach the membership insert, so the absence of
that auth user afterwards is rollback having run, not creation never having happened. Probed
first: migration 006's `on_auth_user_created` trigger is **not live** on this project
(`auth.admin.createUser` leaves no `public.users` row), which is what makes step 3 land in the
duplicate branch.

**Case 1 — injected failure, nothing left behind (2.3, 2.4).** `success=false`, HTTP 400,
`reason=insert_team_member`, message *"We couldn't add you to the team for this invite. Please
ask for a new invite."* State measured either side of the call: **auth users for the address
0→0** (the one created mid-transaction is gone), **`users` rows for the address 1→1** (the
decoy fixture row only, `id` and names unchanged — the handler's blind `UPDATE … WHERE id = B`
rewrote nothing), **`team_members` for the team 1→1**, and the invite still
`redeemed_by=null, redeemed_at=null` — the code was not burned. Message carries **no raw
database text**: no policy name, constraint name, SQLSTATE or relation name (checked with a
regex wider than task 1's `isRlsError`, covering `violates` / `constraint` / `duplicate key` /
`foreign key` / `23503` / `23505` / `policy` / `permission denied`).
`plannedCompensations`'s `createdByThisInvocation` filter behaved exactly as designed: the
pre-existing decoy row and its auth user were never candidates.

**Case 2 — the retry succeeds (2.3).** With the injection removed and *the same invite row and
the same address*, the retry completes all four writes: one auth user for the address, `users`
row `user_type='lite'` with `privacy_consent_at` set, `team_members` row present, and
`invite_codes.redeemed_by` = that user. Reusing the same unredeemed code is itself part of the
evidence — the failed attempt left nothing blocking, and no "user already registered"
collision (defect 1.2's signature) appeared.

**Case 3a — orphan adopted on the invited address.** A seeded **unconfirmed** auth user with no
profile row (faithful to a pre-fix orphan, where the `users` insert was the statement RLS
rejected) registering with the invited address: `success=true`, **the same auth user id is
reused** (`dd5c5255-…` in and out), **auth users for the address stay at 1** — no second
account — and the profile row, membership and redemption all land. The submitted password
worked via `signInWithPassword` **after** adoption and did **not** work before it
(`false → true`), so the password change and `email_confirm: true` both took effect (2.7).

**Case 3b — non-invited address refused, not adopted.** An auth user exists for the submitted
address while the invite is addressed to someone else: HTTP **409**, `reason=email_taken`,
message *"An account already exists for this email. Try logging in instead."* — no raw database
text. Nothing was written: auth users 1→1, still no profile row, no membership, team membership
count unchanged, invite unredeemed. The account was **not taken over**: the orphan's original
password still logs in and the submitted password does not, which is the check that proves
adoption was refused rather than performed quietly.

**Secondary observation — a real imprecision, not a Property 4 violation.** The duplicate-key
branch on the `users` insert (`index.ts` step 4) treats *any* 23505 as the migration-006 trigger
case. For a genuine `users_email_key` collision with a different `id` the follow-up
`UPDATE … WHERE id = <new user>` matches zero rows and returns no error, so the handler
continues with a profile row that does not exist and the registrant is told *"We couldn't add
you to the team for this invite"* when the accurate answer is "an account already exists for
this email". Rollback still holds and nothing leaks (2.3 and 2.4 both pass), so this is
recorded rather than fixed — and it is currently unreachable in normal use, because the trigger
that branch exists for is not live on this project and a colliding `users.email` with a
mismatched auth address has to be crafted. Worth a decision outside this bugfix: either narrow
the duplicate check to the `id` conflict, or check the `UPDATE`'s affected-row count.

**Cleanup verified on all exit paths.** Assertions run *before* cleanup, so any leftover would
have been a recorded failure first. The run removed 2 `public.users` rows, 3 fixture invite
codes and 4 auth users, all `wcr-rollback-mswjicwh684-*@mailinator.com`. A separate post-run
sweep confirmed **zero** leftovers: no `users` rows matching `wcr-rollback-%`, no `ZR*` invite
codes, no auth users with the prefix, no memberships. Auth-user deletion is guarded by
`isThrowawayEmail()` (the `wcr-rollback-` prefix **and** `@mailinator.com`), checked against the
address on the auth record itself, and refuses anything else. `@mailinator.com` only — Supabase
Auth rejects RFC-2606 domains outright, as task 1 recorded.

## Orphan sweep findings (task 4.3 — skipped as optional, 2026-08-17)

`scripts/cleanup-orphan-auth-users.ts` was **not written**. The task was marked optional and
the reason it existed has largely gone away: `redeem-invite` now **adopts** an orphaned auth
user automatically whenever the submitted address matches the invite's `recipient_email`
(verified live in task 4.2 case 3a — same auth user id reused, one account, submitted password
active afterwards and not before). What a sweep would still cover is the residue: orphans whose
address matches **no** invite, which the handler deliberately refuses rather than adopts (case
3b). That is destructive housekeeping on `auth.users` with no bug behind it, better run
deliberately with a dry-run and a human reading the list than bundled into this fix. Task 4.1's
independent post-run sweeps found **zero** orphans matching any fixture pattern, so nothing this
spec created is waiting to be cleaned up. If pre-fix orphans are found later, the adoption path
handles the invited ones and the sweep can be written then.

## Checkpoint findings (task 5, run 2026-08-17)

Everything below ran against the live project `pikrxkxpizdezazlwxhb` with `redeem-invite` ACTIVE
at version 1 and migration 045 applied. **No function source changed in this task, so nothing
was re-deployed.**

| Check | Result |
|---|---|
| `npm run build` | **clean** — only the pre-existing chunk-size and dynamic-import warnings |
| `npm test` (`vitest --run`) | **2 files, 101 passed, 0 failed** — after a flaky generator was fixed, see below |
| `scripts/explore-lite-registration-bug.ts` | **12 of 12 assertions, exit 0** — PROPERTY 1 HELD (one flaky first run, see below) |
| `scripts/preserve-lite-registration.ts` | **15 assertions passed, 0 failures, 4 deviations** — identical to task 3.8 |
| `scripts/verify-lite-registration-integration.ts` | **39 checks passed, 0 failures, exit 0** — PROPERTY 3 HELD |
| `scripts/verify-lite-registration-rollback.ts` | **21 checks passed, 0 failures, exit 0** — PROPERTY 4 HELD |
| `scripts/verify-anon-team-embed.ts` | **6 passed, 0 failed, 0 skipped** |

Every script cleaned up after itself; the run logs show the fixture rows, invite codes and auth
users each one removed, all `wcr-*@mailinator.com` throwaways.

**Two flaky results found this run. Both are test-side; neither implicates the fix.**
1. **`logic.test.ts` → "deriveInviteStatus is total and specific for any invite record (3.3)"**
   failed with `RangeError: Invalid time value` thrown **inside its own generator** at
   `logic.test.ts:572`, in `fc.date({ min, max }).map(d => d.toISOString())`. fast-check 4.x
   `fc.date()` can produce `Invalid Date` unless `noInvalidDate: true` is passed, and
   `.toISOString()` then throws before the property body executes — so there is no
   counterexample and `deriveInviteStatus` was never called. Re-running the same file alone
   passed **77/77**, confirming seed dependence. Triage: **the test generator is wrong**
   (category 1), the code under test is not implicated. Recorded via the PBT status tool against
   task 3.5, surfaced for a decision, and then **fixed on the user's instruction**: both
   `fc.date({ min, max })` calls in `logic.test.ts` now pass `noInvalidDate: true` — the
   `expires_at` one so `.toISOString()` cannot throw, and the `now` one because an
   `Invalid Date` there would make every comparison in the expectation false and assert the
   wrong branch. **No assertion changed**, and unparseable `expires_at` values are still covered
   deliberately by the adjacent `fc.constantFrom('not-a-date', '', 'tomorrow')`. Three
   consecutive green runs after the change: `npm test` **101/101**, then `logic.test.ts` alone
   **77/77 twice**.
2. **Exploration script case 5** ("existing-user path returns the existing user (3.1 intent)")
   failed once — `success=true, existingUserFoundByAnon=false` — then passed on re-run
   (`existingUserFoundByAnon=true`, 12/12, exit 0). The registration itself **succeeded in both
   runs**; what wobbled is the script's own service-role pre-read of the pre-existing
   `public.users` row, which `existingUserFoundByAnon` compares against the returned id. A
   second auth user cannot be what happened — `auth.admin.createUser` on an existing address
   fails outright, and the call returned success. So this is an observation-side flake in the
   mirror, not a behaviour change. Case 3b, which uses the same observation mechanism, reported
   `true` in the same failing run.

**Browser check — NOT performed, stated plainly rather than claimed.** There is no browser
driver in this environment, so nothing drove `/invite/{code}` in a real browser and no devtools
console was read. What was checked instead: `npm run build` compiles clean; the registration
path was exercised end to end through the deployed function by the scripts above (including the
copied-link form of the URL and the not-deployed failure mode); and on the success path
`LiteLandingPage` logs nothing — the only `console.error` calls in the registration path are
inside `redeem-invite`, i.e. server-side and deliberate, and the failure path renders the
returned message through `safeRegistrationErrorMessage()`. A real browser pass through
`/invite/{code}` on `clubfootball.app` is still worth doing before calling the flow signed off.

**Docs updated per project standards.** `CHANGELOG.md` gained a `[2026-08-17]` entry (Fixed,
Technical Notes, Security, Outstanding) covering the RLS failure, the Edge Function with
compensating rollback, pre-confirmation on an email match, orphan adoption, plain-language
errors and migration 045 fixing the "undefined undefined" heading — and states that the fix
requires `supabase functions deploy redeem-invite` (already run) and that **Edge Functions do
not ship with `git push kiro prototype`**, with migration 045 needing the SQL Editor the same
way. `CONVERSATION-HISTORY.md` gained a matching session entry (Context, The Journey, Tasks
Completed, Verification, Files, Technical Decisions, Open items) in the required format.

**Open items carried out of this bugfix — decisions for outside this spec, recorded so they are
not lost.**
1. **Preservation deviation 4 — the expired-code notification still emits nothing.**
   `notifyExpiredCodeUsage()` produces no notification because task 3.3 deliberately left
   `validateInviteCode()` client-side and anonymous, so it cannot read the inviter from
   `public.users` (`rows=0, error=none`). It is also still a `console.log` TODO in
   `invites-api.ts` with no in-app message wired. The landing-page half of 3.3 is unaffected —
   the status is `expired` and the "Code Expired" copy is intact. Fix is either moving the
   notification server-side or granting a scoped read.
2. **A non-matching-email registrant cannot get past the login gate unaided.** Registration and
   membership complete and the account is correctly left unconfirmed, but
   `auth.admin.createUser({ email_confirm: false })` does **not** make GoTrue dispatch a
   confirmation email (`confirmation_sent_at=null`, observed in task 4.1). They need a
   resend/confirmation trigger. Property 3 holds as written; this is a consequence, not a
   violation.
3. **The duplicate-key branch in `redeem-invite/index.ts` step 4 is too broad.** It treats *any*
   23505 on the `users` insert as the migration-006 trigger case, so a genuine `users_email_key`
   collision with a *different* id makes the follow-up `UPDATE … WHERE id = <new user>` match
   zero rows silently, and the registrant is told "We couldn't add you to the team for this
   invite" when the accurate answer is "an account already exists for this email". Rollback
   still holds and nothing leaks (2.3 and 2.4 both pass), and it is unreachable in normal use on
   this project because that trigger is not live and the colliding row has to be crafted. Fix is
   to narrow the check to the id conflict, or to check the `UPDATE`'s affected-row count.

## Notes

- **Property numbering matches design.md**: Property 1 (bug condition — server-side
  registration completes), Property 2 (preservation — non-buggy inputs unchanged),
  Property 3 (pre-confirmation follows the email match), Property 4 (no orphan or partial
  state on failure).
- **Task 1 failing is success.** Do not fix the test or the code when it fails. The failure
  is the evidence the bug exists, and the same test validates the fix in 3.7.
- **Baseline caveat (design)**: the existing-user lookup in `redeemInviteCode()` runs as
  `anon` against `public.users`, and no policy grants `anon` SELECT there. RLS returns an
  empty set rather than an error, so 3.1/3.2 may not be real preservation cases today.
  Task 1 case 5 settles it. If confirmed, the preservation tests assert the **documented
  intent** of 3.1 and 3.2 and the deviation is recorded — widening the fix is a decision,
  not an accident.
- **Deployment gap**: `git push kiro prototype` does not deploy Edge Functions.
  `supabase functions deploy redeem-invite` is a separate, easily forgotten step (D1's
  accepted tradeoff).
- **Security exposure to record, not fix here**: `redeem-invite` is an unauthenticated
  endpoint that can create auth users. The invite code is the authorization. Rate limiting
  is out of scope for this bugfix.
- **Club-agnostic rule**: no club name, colour, logo, domain or URL in the new Edge
  Function. It returns data only; `LiteLandingPage` formats the team name as
  `{age_group} {name}`. `supabase/functions/send-email/index.ts` is the reference for
  env-var-sourced branding when V1.4's welcome email lands.
- **Not changed**: migrations 043 and 044 stay in place and unreverted;
  `netlify/functions/create-user.ts` is untouched; no new migration is required (D2).
- **Out of scope**: V1.4 welcome screen and mobile Team page, V1.6 invite landing page
  branding.
