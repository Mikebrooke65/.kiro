# Lite User Registration Fix — Bugfix Design

## Overview

Self-registration from an invite link fails with *"new row violates row-level security
policy for table users"*. The cause is confirmed: `invitesApi.redeemInviteCode()`
(`src/lib/invites-api.ts`) calls `supabase.auth.signUp()`, and because email confirmation
is enabled on this Supabase project, `signUp()` returns **no session**. The browser is
still the `anon` role at the moment it inserts into `users`, so the policy added in
migration 044 (`id = auth.uid()`) cannot match — `auth.uid()` is null. The insert is
rejected, and the auth user created a moment earlier is left orphaned, which makes a
retry fail with "user already registered".

The fix moves the entire registration transaction server-side into a new **Supabase Edge
Function** (`supabase/functions/redeem-invite`) running under `service_role`, so RLS is
never in the path and no browser session is required at any point. One call validates the
code, resolves or creates the auth user, inserts the `users` profile row, inserts the
`team_members` row, and marks the invite redeemed — with compensating rollback if any step
fails. `invitesApi.redeemInviteCode()` becomes a thin client wrapper over that function,
keeping its current signature so `LiteLandingPage` is untouched apart from error copy.

The auth user is created with `email_confirm: true` **only when the submitted email
matches the invite's `recipient_email`** (case-insensitive, trimmed). That match is what
proves control of the address, so a second confirmation email would be redundant. A
non-matching email still registers, but keeps Supabase's own confirmation as the safety net.

Edge Function choice, and the email-match rule, are settled decisions D1 and D2 in
`bugfix.md` — this design implements them, it does not revisit them.

## Glossary

- **Bug_Condition (C)**: A registration attempt against a valid, unexpired, unredeemed
  invite code, using an email with no existing `users` row, on a project with email
  confirmation enabled. See `isBugCondition` below.
- **Property (P)**: The registration transaction completes atomically server-side —
  auth user, `users` row (`user_type = 'lite'`), `team_members` row, invite marked
  redeemed — with no RLS error and no orphan.
- **Preservation**: Behaviour outside C that must be unchanged: the existing-user path,
  the already-a-member path, the invalid / redeemed / expired code statuses and their
  landing-page messages, client-side form validation, the `{age_group} {name}` team
  display format, Copy Link / Send Link, `privacy_consent_at` capture, migrations 043 and
  044 staying in place, and `netlify/functions/create-user.ts`.
- **F** — `invitesApi.redeemInviteCode()` as it exists today: client-side, `anon` role at
  the point of insert.
- **F'** — the fixed handler: `supabase/functions/redeem-invite` under `service_role`,
  plus the thin client wrapper that calls it.
- **`redeemInviteCode()`** — `src/lib/invites-api.ts`. Today: validate → look up existing
  user → `auth.signUp()` → insert `users` → insert `team_members` → update `invite_codes`
  → re-select and return the `User`. After the fix: validate → invoke the Edge Function →
  return the `User` it responds with.
- **`validateInviteCode()`** — `src/lib/invites-api.ts`. Stays client-side and unchanged;
  it is what produces the "Invalid Code" / "Already Used" / "Code Expired" states and the
  expired-code notification to the inviter. It works anonymously because of migration 043.
- **`emailMatchesInvite`** — the normalised comparison between the submitted email and
  `invite_codes.recipient_email` that decides pre-confirmation (D2).
- **Orphaned auth user** — a row in `auth.users` with no matching `public.users` row,
  left behind by a failed pre-fix attempt (defect 1.2).

## Bug Details

### Bug Condition

The bug fires whenever a genuinely new registrant submits the form against a good invite
code. `signUp()` withholds the session while email confirmation is pending, so the client
is still `anon` for the following insert into `users`, and the RLS check `id = auth.uid()`
fails. The bug does **not** depend on whether the submitted email matches the invite's
`recipient_email` — that match only decides whether the fixed handler pre-confirms.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type RegistrationAttempt {
           code, email, password, first_name, last_name, privacy_consent
         }
  OUTPUT: boolean

  // Existing-user attempts never reach signUp(), so they are outside C.
  RETURN inviteIsValid(X.code)              // exists, unredeemed, not expired
     AND NOT existsUserWithEmail(X.email)   // no public.users row
     AND projectHasEmailConfirmationEnabled()
END FUNCTION
```

```
FUNCTION emailMatchesInvite(X)
  INPUT: X of type RegistrationAttempt
  OUTPUT: boolean

  RETURN invite(X.code).recipient_email IS NOT NULL
     AND lower(trim(X.email)) = lower(trim(invite(X.code).recipient_email))
END FUNCTION
```

### Examples

- **Invited manager, matching email.** Valid code `36ZKFT8M`, email equal to the invite's
  `recipient_email`, valid password, consent ticked. Expected: account created, added to
  the team, invite redeemed, immediate login. Actual: red error *"new row violates row-level
  security policy for table users"*; nothing persisted except an orphaned auth user.
- **Immediate retry of the same submission.** Expected: succeeds. Actual: *"user already
  registered"* — a different error, from the orphan left by the first attempt, which makes
  the flow look intermittent rather than broken.
- **Registrant using a different address than the invite went to.** Expected: registration
  and team membership complete, but the account is not pre-confirmed, so Supabase's
  confirmation email gates login (2.8). Actual: same RLS failure.
- **Existing user (e.g. already registered for an External League team), new team invite.**
  Expected: no account creation, membership added, existing user returned (3.1). Outside C —
  but see the baseline caveat below, because the current client-side existing-user lookup
  runs as `anon`.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- An email that already has a `users` row skips account creation entirely, gains only the
  team membership, and that existing user is returned — one person, one account, many team
  memberships (3.1).
- A user already in the invite's team keeps their existing `team_members` row; no duplicate
  is inserted (3.2).
- Invalid / already-redeemed / expired codes still return their specific status, the landing
  page still shows "Invalid Code" / "Already Used" / "Code Expired", and an expired code
  still notifies the inviter (3.3).
- Links delivered by "Copy Link" still validate and register, and Send Link / Resend Link
  from V1.2 are untouched (3.4).
- `privacy_consent_at` is still recorded on the `users` row from the consent tick (3.5).
- Migrations 043 and 044 stay in place and unreverted; anonymous visitors can still read
  `invite_codes` to validate a code before logging in (3.6).
- Client-side validation still blocks submission for missing fields, passwords under 6
  characters, and unticked consent, with the existing messages (3.7).
- Team names still render as `{age_group} {name}` in the heading and success screen (3.8).
- `netlify/functions/create-user.ts` and the desktop admin user-management path are not
  touched (3.9).

**Scope:**
Everything that does not satisfy `isBugCondition` should be unaffected. That includes
existing-user registrations, already-member registrations, invalid / redeemed / expired
codes, client-side validation rejections, the admin create-user path, and invite
generation and sending.

**Preservation baseline caveat.** 3.1 and 3.2 are documented as behaviour the current code
gets right, but the existing-user lookup in `redeemInviteCode()` runs as `anon` against
`public.users`, and no policy grants `anon` SELECT on that table. RLS returns an empty set
rather than an error, so `existingUser` is likely always null in the anon flow, sending
even existing users into `signUp()` and out through *"user already registered"*. Exploratory
testing must establish the real baseline before the preservation tests are written. If it
confirms this, then for existing-user inputs `F(X)` today is an error, not the documented
behaviour, and moving the lookup server-side under `service_role` fixes a second latent
defect. The preservation tests should then assert the **documented intent** of 3.1 and 3.2
rather than literal observed current behaviour — noted explicitly so the widening of the
fix is a decision rather than an accident.

## Hypothesized Root Cause

The primary cause is confirmed by live testing on 2026-08-14, so this section records the
confirmed mechanism plus the secondary causes that the fix must also address.

1. **No session at insert time — confirmed primary cause.** With email confirmation
   enabled, `supabase.auth.signUp()` returns a user but no session. supabase-js keeps
   sending the anon key, so `auth.uid()` is null for the subsequent
   `.from('users').insert({ id: userId, ... })`, and migration 044's `WITH CHECK
   (id = auth.uid())` cannot pass. Same mechanism would then block the `team_members`
   insert and the `invite_codes` update.

2. **No transaction boundary across the four writes.** `redeemInviteCode()` performs four
   independent statements over the wire with no rollback. Failure at step 2 leaves the
   auth user from step 1 behind (1.2). Even with RLS fixed, any later failure would still
   orphan records — so the atomicity problem is separate from the RLS problem and must be
   fixed on its own terms.

3. **Existing-user detection also runs under `anon`.** As covered in the baseline caveat,
   the `users` lookup almost certainly returns nothing for anonymous visitors, so the
   existing-user branch is unreachable in the anon flow.

4. **Confirmation email is unconditional.** `signUp()` always triggers Supabase's
   confirmation email, even for an address the recipient just demonstrated control of by
   clicking our invite link (1.3).

5. **Errors surface raw.** `LiteLandingPage` renders `err.message` directly, so database
   policy text reaches the person registering (1.4).

Migrations 043 and 044 are correct and necessary — 043 is what lets an anonymous visitor
validate a code at all — but they are not sufficient, because the client never becomes
`authenticated` during registration.

## Correctness Properties

Property 1: Bug Condition — Registration Completes Server-Side For New Registrants

_For any_ registration attempt where the bug condition holds (`isBugCondition` returns
true), the fixed handler SHALL complete registration in a single server-side call executing
under `service_role`, producing no RLS error and leaving: an auth user for the submitted
email, a `users` row with `user_type = 'lite'` and `privacy_consent_at` set from the consent
tick, a `team_members` row for the invite's team, and the invite marked redeemed by that
user — without the browser holding an authenticated session at any point.

**Validates: Requirements 2.1, 2.5, 2.6**

Property 2: Preservation — Non-Buggy Inputs Behave Identically

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false), the
fixed handler SHALL produce the same observable result as the original, preserving the
existing-user path (no account creation, membership only, existing user returned), the
already-a-member path (no duplicate `team_members` row), the invalid / redeemed / expired
code statuses and their landing-page messages including the expired-code notification to
the inviter, and the client-side validation rejections.

**Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.7**

Property 3: Bug Condition — Pre-Confirmation Follows The Email Match

_For any_ registration attempt where the bug condition holds, the account SHALL be created
with `email_confirm: true` and no Supabase confirmation email, and login SHALL succeed
immediately, if and only if the submitted email equals the invite's `recipient_email`
compared case-insensitively with surrounding whitespace trimmed; otherwise registration and
team membership SHALL still complete but the account SHALL NOT be pre-confirmed, leaving
Supabase's own confirmation as the gate before login. This SHALL hold regardless of whether
the invite link arrived by our email service or by the Copy Link fallback.

**Validates: Requirements 2.2, 2.7, 2.8, 3.4**

Property 4: Bug Condition — No Orphan Or Partial State On Failure

_For any_ registration attempt where the bug condition holds and any step of the
transaction fails, the fixed handler SHALL leave no auth user, no `users` row, no
`team_members` row and no invite redemption attributable to that attempt, SHALL surface a
plain-language message containing no raw database policy or constraint text, and an
otherwise-valid retry with the same email SHALL succeed.

**Validates: Requirements 2.3, 2.4**

## Fix Implementation

### Changes Required

**New file**: `supabase/functions/redeem-invite/index.ts`

The whole transaction, under `service_role`. Follows `supabase/functions/send-email/index.ts`
for structure: `Deno.serve`, CORS preflight, JSON error bodies, non-2xx on failure.

1. **Client construction.** `createClient(Deno.env.get('SUPABASE_URL'),
   Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))` — both are injected into Edge Functions
   automatically, so no new secrets are needed. `auth: { persistSession: false,
   autoRefreshToken: false }`, matching `scripts/create-test-user.ts`.

2. **Caller authorisation.** Registration happens before the person has an account, so the
   function must accept a caller with no user session. supabase-js sends the anon key as
   the bearer token when there is no session, which satisfies default JWT verification, so
   the function keeps the default and simply must not additionally require an end-user
   session the way `send-email` does. If verification rejects the anon key in this project's
   configuration, deploy with `--no-verify-jwt`. **The invite code is the authorization** —
   this is an unauthenticated endpoint that can create auth users, so it must: require a
   code that is present, unredeemed and unexpired; ignore any client-supplied `role`,
   `user_type`, `team_id` or `active` and set them server-side; and log rejected attempts.
   Rate limiting is not in scope here, but the exposure should be recorded.

3. **Request validation.** Require `code`, `email`, `password` (min 6), `first_name`,
   `last_name`, `privacy_consent`. Normalise the email once (`lower(trim())`) and use that
   normalised value for every lookup, insert and comparison.

4. **Server-side code validation.** Re-read `invite_codes` by code under `service_role` and
   re-check unredeemed and not expired. The client already validated, but the client check
   is advisory — the server must not trust it. Return distinct machine-readable statuses
   (`invalid`, `redeemed`, `expired`) so the landing page can keep its existing distinct
   messages (3.3).

5. **Resolve the user.**
   - Existing `public.users` row for the email → use it, create nothing (3.1).
   - No profile row, but an auth user exists for that email (the pre-fix orphan case) →
     adopt it **only if** the email matches the invite's `recipient_email`: set the
     submitted password and `email_confirm` per the match, then continue with the profile
     insert. Restricting adoption to the invited address is what stops a valid code being
     used to take over someone else's auth record. Any other collision returns a
     plain-language "an account already exists for this email — try logging in instead".
     Look the auth user up via the admin users endpoint filtered by email; PostgREST cannot
     reach the `auth` schema.
   - Otherwise → `auth.admin.createUser({ email, password, email_confirm:
     emailMatchesInvite, user_metadata: { first_name, last_name } })` (2.2, 2.7, 2.8).

6. **Profile and membership inserts.** Insert `users` with `role: 'player'`,
   `user_type: 'lite'`, `active: true`, `cellphone: ''`, and `privacy_consent_at` set to
   now when consent was given (3.5). Then insert `team_members` for `invite.team_id` with
   `role: 'player'`, skipping the insert when a row already exists (3.2).

7. **Redemption last.** Set `redeemed_by` / `redeemed_at` only after every other write has
   succeeded, so a failure never burns the code.

8. **Compensating rollback.** Track what this invocation created and undo it in reverse on
   any failure: delete the `team_members` row if this call inserted it, delete the `users`
   row if this call inserted it, and `auth.admin.deleteUser()` if this call created the auth
   user. Never delete an auth user or membership that already existed. This is what makes
   Property 4 hold and what makes a retry clean (2.3). `netlify/functions/create-user.ts`
   already does the single-step version of this and is the pattern to follow.

9. **Error mapping.** Map internal failures to plain-language messages and never echo
   Postgres policy or constraint text (2.4). Log the raw detail with `console.error` for
   diagnosis, return the safe message to the caller.

10. **Club-agnostic.** No club name, colour, logo, domain or URL in this function. It
    returns data only; the landing page formats the team name as `{age_group} {name}`. The
    V1.4 welcome email is out of scope, so no branding env vars are needed yet — when it
    lands it calls the existing `send-email` function, which already sources branding from
    `CLUB_NAME` / `CLUB_COLOR` / `APP_URL` / `EMAIL_FROM`.

**Modified file**: `src/lib/invites-api.ts`

11. **`redeemInviteCode()` becomes a wrapper.** Keep the signature
    `(code: string, userData: LiteRegistrationData): Promise<User>` so `LiteLandingPage`
    compiles unchanged. Body: `this.supabase.functions.invoke('redeem-invite', { body: ... })`,
    then return the `User` from the response. Reuse the `extractFunctionError` approach from
    `src/lib/email-api.ts` — `functions.invoke` otherwise collapses every failure into
    "Edge Function returned a non-2xx status code", which would defeat 2.4. Remove the
    client-side `signUp()` / insert / update sequence entirely.

12. **`validateInviteCode()` unchanged.** It still runs client-side and anonymously via
    migration 043, and still drives the three error states and the expired-code
    notification (3.3, 3.6).

**Modified file**: `src/pages/LiteLandingPage.tsx`

13. **Error copy only.** Show the server's plain-language message with a fallback, and drop
    any path that could render raw error text (2.4). Client-side validation, the privacy
    notice, the `{age_group} {name}` heading and success screen, and the Go to Login link
    all stay as they are (3.7, 3.8). The success screen already names the team correctly.

**Optional**: `scripts/cleanup-orphan-auth-users.ts`

14. **One-off orphan sweep.** Report and optionally delete `auth.users` rows with no
    `public.users` row, for orphans created before the fix whose email does not match an
    invite and therefore cannot be adopted by step 5. Destructive, so it should default to
    dry-run and require an explicit flag to delete.

**Not changed**: migrations 043 and 044 stay in place and unreverted (3.6);
`netlify/functions/create-user.ts` is untouched (3.9); no new migration is needed, per D2.

**Deployment note.** Edge Functions do not deploy with the app on `git push kiro prototype`.
This fix is not live until `supabase functions deploy redeem-invite` is run. Easy to forget,
and the symptom is that the client calls a function that does not exist.

## Testing Strategy

### Validation Approach

Two phases. First, surface counterexamples on the **unfixed** code to confirm the mechanism
and establish the true preservation baseline — particularly for the existing-user path,
where the documented behaviour and the actual behaviour may differ (see the baseline
caveat). Then verify the fix satisfies Properties 1, 3 and 4 and leaves the Property 2
cases unchanged.

**Tooling reality check.** The project has no test framework installed — `package.json` has
only `dev` and `build` scripts, and there is no vitest, jest or fast-check. It does have
`tsx`, and `scripts/` already holds Supabase-touching scripts (`create-test-user.ts`,
`test-auth.ts`, `verify-user-email.ts`) that read `VITE_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` from the environment. So:
- **Integration and exploratory tests**: `tsx` scripts in `scripts/`, following the existing
  convention. This flow touches real GoTrue admin calls and real RLS, which cannot be
  meaningfully faked.
- **Unit and property-based tests**: require adding `vitest` and `fast-check` as devDeps
  plus a `test` script. Worth doing, and scoped to the pure helpers where PBT actually pays
  off. Run as `vitest --run`, never in watch mode.

Tests must use throwaway email addresses and clean up after themselves. Anything that
deletes auth users needs an explicit guard so it cannot run against real accounts.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and
confirm or refute the root cause analysis. If refuted, re-hypothesize.

**Test Plan**: A `tsx` script that drives the real flow with the **anon** key (not the
service key — using the service key would mask the entire bug) against a valid invite code,
asserting the outcome and inspecting what was left behind in `auth.users`, `public.users`,
`team_members` and `invite_codes`.

**Test Cases**:
1. **New email, matching invite address**: submit against a valid code; expect the RLS
   failure (will fail on unfixed code).
2. **Orphan-on-failure check**: after case 1, look for an auth user with no `users` row;
   expect the orphan to exist (confirms 1.2).
3. **Immediate retry**: rerun case 1; expect "user already registered" rather than the RLS
   error (will fail on unfixed code).
4. **Session check after `signUp()`**: assert `getSession()` is null immediately after
   `signUp()` — this is the single observation that confirms the mechanism.
5. **Existing-user baseline**: submit an email that has a `users` row, as `anon`, and record
   what actually happens. This determines whether 3.1 is a preservation case or a second
   latent defect.
6. **Confirmation email**: verify Supabase sends its confirmation message during the
   unfixed flow (confirms 1.3).
7. **Edge case — expired and redeemed codes**: confirm these already return their distinct
   statuses, so the baseline for 3.3 is recorded before any change.

**Expected Counterexamples**:
- `redeemInviteCode()` rejected at the `users` insert with *"new row violates row-level
  security policy for table users"*, with an orphaned auth user left behind.
- Cause: no session after `signUp()` under email confirmation, so `auth.uid()` is null and
  migration 044's `id = auth.uid()` check cannot pass.
- Possible additional finding: the existing-user lookup returns nothing under `anon`, so
  case 5 fails too.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed handler
produces the expected behaviour.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := redeemInvite_fixed(X)
  ASSERT result.success = true
     AND no_rls_error(result)
     AND exists_auth_user(X.email)
     AND exists_users_row(X.email) WITH user_type = 'lite'
     AND exists_team_member(invite(X.code).team_id, result.user.id)
     AND invite(X.code).redeemed_by = result.user.id
     AND browser_never_held_a_session_during(result)
END FOR

FOR ALL X WHERE isBugCondition(X) DO
  result := redeemInvite_fixed(X)
  IF emailMatchesInvite(X) THEN
    ASSERT auth_user_email_confirmed(X.email)
       AND no_supabase_confirmation_email_sent(X.email)
       AND can_log_in(X.email, X.password)
  ELSE
    ASSERT result.success = true
       AND NOT auth_user_email_confirmed(X.email)
       AND supabase_confirmation_required(X.email)
  END IF
END FOR

FOR ALL X WHERE isBugCondition(X) AND any_step_fails(redeemInvite_fixed(X)) DO
  ASSERT NOT exists_auth_user(X.email)
     AND NOT exists_users_row(X.email)
     AND invite(X.code).redeemed_by = NULL
     AND redeemInvite_fixed(X) CAN SUCCEED ON RETRY
END FOR
```

Failure injection for the third block: force the `team_members` insert to fail (nonexistent
`team_id` on a crafted invite, or a temporary constraint) and assert the rollback removed
the auth user and profile row.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed
handler produces the same result as the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT redeemInvite_original(X) = redeemInvite_fixed(X)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking
because it generates many cases across the input domain automatically, catches edge cases
manual tests miss, and gives a stronger guarantee that non-buggy inputs are untouched.
Here it applies cleanly to the pure decision logic — email normalisation and matching,
request validation, and status/error mapping — which is where regressions in the
preservation cases would actually originate. The database-touching preservation cases are
verified by scripted integration tests, because their outcome depends on real RLS and real
GoTrue behaviour.

**Test Plan**: Record behaviour on the UNFIXED code first for each case below, then write
tests capturing it. Where the recorded baseline is itself an error (see the baseline
caveat), assert the documented intended behaviour instead and note the deviation.

**Test Cases**:
1. **Existing user gains a membership**: an email with a `users` row against a valid code
   creates no account, adds only the membership, returns the existing user (3.1).
2. **Already a member**: the resolved user is already in the invite's team — no duplicate
   `team_members` row, and no error (3.2).
3. **Invalid / redeemed / expired codes**: each returns its own status; the landing page
   shows "Invalid Code" / "Already Used" / "Code Expired"; an expired code notifies the
   inviter (3.3).
4. **Copy Link delivery**: a link that was copied rather than emailed validates and
   registers exactly as an emailed one, and Send Link / Resend Link still work (3.4).
5. **Consent timestamp**: `privacy_consent_at` is set on the `users` row (3.5).
6. **Anonymous code validation still works**: migrations 043 and 044 are still present, and
   an anon visitor can still read `invite_codes` (3.6).
7. **Client-side validation**: missing fields, password under 6 characters, and unticked
   consent are still blocked in the browser with the existing messages, before any network
   call (3.7).
8. **Team name format**: heading and success screen still render `{age_group} {name}` (3.8).
9. **Admin create-user path**: creating a user through desktop admin still works, unchanged
   (3.9).

### Unit Tests

- `emailMatchesInvite`: case differences, leading/trailing whitespace, null
  `recipient_email`, and a non-matching address.
- Request validation: each missing required field, password under 6 characters, consent
  false.
- Error mapping: every internal failure maps to a plain-language message, and no mapped
  message contains "row-level security", "violates", "constraint" or a policy name (2.4).
- Rollback bookkeeping: given a record of what an invocation created, the compensations run
  in reverse order and never target pre-existing records.
- Server-side status derivation: unredeemed/unexpired → valid; `redeemed_by` set →
  `redeemed`; `expires_at` in the past → `expired`.

### Property-Based Tests

- **Email normalisation and matching** (supports Property 3): for randomly generated
  addresses with random case and surrounding whitespace, `emailMatchesInvite` agrees with
  `lower(trim(a)) === lower(trim(b))`, and every lookup, insert and comparison in one
  invocation uses the same normalised value.
- **Error mapping never leaks** (supports Property 4): for arbitrary generated error
  objects and message strings, the mapped client-facing message is drawn from the known
  safe set and never contains raw database text.
- **Validation and status logic are total** (supports Property 2): for arbitrary generated
  request payloads and invite records, validation always returns an explicit accept or a
  specific rejection reason — never a crash and never an unmapped fall-through, so
  preservation cases can't be reclassified by an unhandled input.
- **Rollback is exact** (supports Property 4): for a randomly generated sequence of
  succeeded/failed steps, the compensations undo exactly the records created in that
  invocation and nothing that pre-existed.

### Integration Tests

- **Full happy path, matching email**: real invite code → register → assert all four writes
  → log in immediately with no confirmation step (Properties 1 and 3).
- **Full happy path, non-matching email**: registration and membership complete, account
  not pre-confirmed, login gated by Supabase confirmation (Property 3).
- **Orphan adoption**: seed an auth user with no profile row for the invited address, then
  register — the orphan is adopted, the password is the submitted one, and registration
  completes (2.3). Then the same with a non-invited address, which must be refused with the
  "account already exists" message rather than adopted.
- **Rollback under injected failure**: force a mid-transaction failure and assert nothing
  persists and a retry succeeds (Property 4).
- **Existing user across two teams**: one account, two `team_members` rows, no second auth
  user (3.1).
- **No session throughout**: assert `getSession()` is null before, during and after the
  successful call (2.6).
- **Capacitor/native reachability**: confirm the call resolves against the absolute
  `https://<project-ref>.supabase.co/functions/v1/redeem-invite` URL in the Android wrapper,
  not a relative app-origin path — the reason D1 chose an Edge Function over a Netlify
  function.
- **Deployment gate**: confirm the flow fails loudly with a clear message if
  `redeem-invite` has not been deployed, so a missed `supabase functions deploy` is obvious
  rather than mysterious.
