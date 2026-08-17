# Bugfix Requirements Document

## Introduction

A team manager who receives an invite link (e.g. `https://clubfootball.app/invite/36ZKFT8M`)
lands on the invite page, fills in the registration form (first name, last name, email,
password, privacy consent) and submits. Submission fails with a red error:
*"new row violates row-level security policy for table users"*. No account is usable,
no team membership is created, and the invite code stays unredeemed.

**Root cause (confirmed by live testing 2026-08-14):** `invitesApi.redeemInviteCode()`
calls `supabase.auth.signUp()`. With email confirmation enabled on this Supabase project,
`signUp()` does not return a session — Supabase sends its own "confirm your email"
message and withholds the session until the link is clicked. The client is therefore
still acting as the `anon` role when it attempts the subsequent insert into `users`,
and the RLS policy `id = auth.uid()` cannot match because there is no authenticated
user yet. Migrations 043 and 044 (added while diagnosing) are correct and necessary,
but not sufficient.

**Agreed fix direction:** move the whole registration transaction server-side, running
under `service_role` so RLS is not in the path. One call creates the auth user, inserts
the `users` profile row, inserts the `team_members` row, and marks the invite code
redeemed. The handler is a **Supabase Edge Function** (see D1 below). The auth user is
created with `email_confirm: true` **only when the submitted email matches the invite's
`recipient_email`** (see D2 below) — that match is what proves ownership of the address,
so a second confirmation email would be redundant friction. A non-matching email may
still register, but keeps Supabase's own confirmation step as the safety net.

**Impact:** self-registration is completely broken. No invited manager or player can
create an account. This blocks V1.4 and V1.5, and blocks any soft launch.

**Out of scope** (planned separately, do not pull in): V1.4 post-registration welcome
screen and mobile Team page; V1.6 invite landing page branding.

## Bug Analysis

### Current Behavior (Defect)

What currently happens when someone with a new email address submits the registration
form from a valid invite link.

1.1 WHEN a person opens a valid, unexpired, unredeemed invite link and submits the registration form with an email address that does not match an existing `users` row THEN the system fails with the raw database error *"new row violates row-level security policy for table users"*, and no `users` profile row, no `team_members` row and no invite redemption are created

1.2 WHEN that failure occurs THEN the system has already created a Supabase auth user, leaving an orphaned auth record with no matching `users` profile row, so a retry with the same email address fails again with a different error ("user already registered")

1.3 WHEN `supabase.auth.signUp()` is called during registration THEN the system sends Supabase's own "confirm your email" message to an address the recipient has already demonstrated control of by clicking our invite link, and withholds the session until that second link is clicked

1.4 WHEN registration fails for any reason THEN the system displays the raw database or auth error text to the person registering, with no plain-language explanation or next step

1.5 WHEN registration fails THEN the invite code remains unredeemed and the inviting manager receives no signal that the invitee attempted and failed to register

### Expected Behavior (Correct)

2.1 WHEN a person opens a valid, unexpired, unredeemed invite link and submits the registration form with an email address that does not match an existing `users` row THEN the system SHALL complete registration successfully in a single server-side call executing under `service_role`, creating the auth user, the `users` profile row (`user_type = 'lite'`), the `team_members` row for the invite's team, and marking the invite code redeemed

2.2 WHEN the auth user is created and the submitted email matches the invite's `recipient_email` THEN the system SHALL create it with the email already confirmed, so no Supabase confirmation email is sent and no email-confirmation step stands between the person and a working login

2.3 WHEN any step of the registration transaction fails THEN the system SHALL leave no orphaned auth user and no partial profile or membership rows, so that a retry with the same email address can succeed

2.4 WHEN registration fails THEN the system SHALL display a plain-language message describing what went wrong and what to do next, and SHALL NOT surface raw database policy or constraint text to the person registering

2.5 WHEN registration succeeds THEN the system SHALL show the success screen naming the team in the standard `{age_group} {name}` format, and the person SHALL be able to log in immediately with the email and password they just set (immediate login is subject to 2.8 when the submitted email does not match the invite)

2.6 WHEN registration is attempted THEN the system SHALL NOT depend on the browser holding an authenticated session at any point during the transaction

2.7 WHEN the submitted email, compared case-insensitively and with surrounding whitespace trimmed, equals the invite's `recipient_email` THEN the system SHALL create the auth user with `email_confirm: true`, SHALL NOT trigger a Supabase confirmation email, and the person SHALL be able to log in immediately — regardless of whether the invite link arrived by our email service or by the "Copy Link" fallback

2.8 WHEN the submitted email does not equal the invite's `recipient_email` (or the invite has no `recipient_email`) THEN the system SHALL STILL complete registration and team membership, but SHALL NOT pre-confirm the account, so Supabase's own email confirmation applies before login succeeds

### Unchanged Behavior (Regression Prevention)

Existing behaviour the current code gets right. Each of these is a known regression
risk of moving the transaction server-side.

3.1 WHEN the submitted email matches an existing `users` row (e.g. John Smith already registered for an External League team) THEN the system SHALL CONTINUE TO skip account creation entirely, add only the team membership, and return that existing user — one person, one account, many team memberships

3.2 WHEN the resolved user is already a member of the invite's team THEN the system SHALL CONTINUE TO leave the existing `team_members` row alone and insert no duplicate

3.3 WHEN an invite code is invalid, already redeemed, or expired THEN the system SHALL CONTINUE TO return that specific status and the landing page SHALL CONTINUE TO show its distinct message ("Invalid Code", "Already Used", "Code Expired"), and an expired code SHALL CONTINUE TO notify the inviter

3.4 WHEN an invite is delivered by the "Copy Link" fallback rather than by our email service THEN the system SHALL CONTINUE TO allow that link to be opened, validated and registered against, and the "Send Link" / "Resend Link" behaviour built in V1.2 SHALL CONTINUE TO work unchanged

3.5 WHEN privacy consent is given on the registration form THEN the system SHALL CONTINUE TO record `privacy_consent_at` with the consent timestamp on the `users` row (required for V1.9 store submission)

3.6 WHEN the fix is applied THEN migrations 043 and 044 SHALL CONTINUE TO be in place and unreverted, and anonymous visitors SHALL CONTINUE TO be able to read `invite_codes` in order to validate a code before logging in

3.7 WHEN the registration form is submitted with missing fields, a password shorter than 6 characters, or privacy consent unchecked THEN the system SHALL CONTINUE TO block submission client-side with the existing validation messages

3.8 WHEN the invite landing page renders the team name (heading and success screen) THEN the system SHALL CONTINUE TO display it as `{age_group} {name}` (e.g. "Open Bozos"), never the bare name

3.9 WHEN an admin creates a user through the existing admin path THEN `netlify/functions/create-user.ts` SHALL CONTINUE TO work unchanged

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type RegistrationAttempt {
           code, email, password, first_name, last_name, privacy_consent
         }
  OUTPUT: boolean

  // The bug fires only for genuinely new registrants against a good code.
  // Existing-user attempts avoid signUp() entirely and already work.
  RETURN inviteIsValid(X.code)
     AND NOT existsUserWithEmail(X.email)
     AND projectHasEmailConfirmationEnabled()
END FUNCTION
```

The bug condition does NOT depend on whether the submitted email matches the invite's
`recipient_email`. The bug fires either way — the email match only decides whether the
fixed handler pre-confirms the account.

```pascal
FUNCTION emailMatchesInvite(X)
  INPUT: X of type RegistrationAttempt
  OUTPUT: boolean

  RETURN invite(X.code).recipient_email IS NOT NULL
     AND lower(trim(X.email)) = lower(trim(invite(X.code).recipient_email))
END FUNCTION
```

**F** = `invitesApi.redeemInviteCode()` as it exists today (client-side, `anon` role at
the point of insert).
**F'** = the fixed registration handler (server-side, `service_role`).

### Properties

```pascal
// Property: Fix Checking - registration completes for new registrants
FOR ALL X WHERE isBugCondition(X) DO
  result ← register'(X)
  ASSERT result.success = true
     AND no_rls_error(result)
     AND exists_auth_user(X.email)
     AND exists_users_row(X.email) WITH user_type = 'lite'
     AND exists_team_member(invite(X.code).team_id, result.user.id)
     AND invite(X.code).redeemed_by = result.user.id
END FOR
```

```pascal
// Property: Fix Checking - pre-confirmation follows the email match (2.7 / 2.8)
FOR ALL X WHERE isBugCondition(X) DO
  result ← register'(X)
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
```

```pascal
// Property: Fix Checking - no orphaned auth user on partial failure
FOR ALL X WHERE isBugCondition(X) AND any_step_fails(register'(X)) DO
  ASSERT NOT exists_auth_user(X.email)
     AND NOT exists_users_row(X.email)
     AND invite(X.code).redeemed_by = NULL
     AND register'(X) CAN SUCCEED ON RETRY
END FOR
```

```pascal
// Property: Preservation Checking - non-buggy inputs behave identically
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Concretely, `NOT isBugCondition(X)` covers the preservation cases in 3.1–3.3:
an existing user's email, an already-member user, and invalid / redeemed / expired codes.

### Counterexamples

| Input | Current result (F) | Required result (F') |
|-------|--------------------|----------------------|
| Valid code `36ZKFT8M`, new email, valid password, consent given | Red error: "new row violates row-level security policy for table users"; orphaned auth user left behind | Account created, added to team, invite redeemed, immediate login works |
| Same input retried after the first failure | "User already registered" | Succeeds (no orphan to collide with) |

## Resolved Decisions

Both previously open decisions are now settled. The reasoning is recorded because it
constrains later work more than the conclusions do.

**D1. RESOLVED — the registration handler is a Supabase Edge Function**
(`supabase/functions/...`), not a Netlify function.

*Deciding reason: Capacitor.* The existing admin path calls
`fetch('/.netlify/functions/create-user')` — a **relative** path (see
`src/pages/desktop/UserManagement.tsx`). Inside a Capacitor native app wrapper, relative
URLs resolve against the local app origin, not against Netlify, so that call would fail
on a device. Supabase Edge Functions are invoked through the supabase client at an
absolute `https://<project-ref>.supabase.co/functions/v1/...` URL and therefore behave
identically in a browser and in the native app. Lite-user registration happens on a
phone and is one of the flows most likely to run inside the native app once V1.1 lands,
so it must not depend on Netlify-relative paths.

Supporting reasons:
- The club-agnostic branding secrets (`CLUB_NAME`, `CLUB_COLOR`, `APP_URL`, `EMAIL_FROM`)
  already live in Supabase secrets.
- V1.4's welcome email will want to call the existing `send-email` Edge Function, so
  co-locating the registration handler with it is simpler.

**The existing Netlify choice for admin `create-user` was not a mistake.** Admin user
management is desktop-only, so a relative path is fine in that context. It simply does
not transfer to a mobile flow. `netlify/functions/create-user.ts` stays unchanged
(already covered by 3.9).

*Accepted tradeoff:* Edge Functions need a separate `supabase functions deploy` step
rather than deploying automatically with the app on git push. Easy to forget — call it
out in the deployment steps.

All new code must stay club-agnostic: no hardcoded club name, colour, logo, domain or
URL. `supabase/functions/send-email/index.ts` is the reference implementation for
env-var-sourced branding.

**D2. RESOLVED — option (c): pre-confirm the email only when the submitted email matches
the invite's existing `recipient_email`.** No new migration, no delivery-tracking column,
no branching on delivery method.

*The insight that resolves the emailed-vs-copied-link tension:* the guarantee no longer
comes from the **delivery channel**, it comes from the **email match**. A forwarded or
pasted link cannot be used to register under a different address — only the invited
address gets a pre-confirmed account. So "Copy Link" ceases to be a security-weaker path
and becomes merely a different way of delivering the same link.

Therefore:
- IF submitted email == `invite.recipient_email` (case-insensitive, trimmed) → create the
  auth user with `email_confirm: true`, immediate login, no Supabase confirmation email
  (2.7).
- IF submitted email != `invite.recipient_email` → the person may still register, but the
  account is **not** pre-confirmed; Supabase's own email confirmation applies as the
  safety net (2.8).

*Accepted constraint:* a recipient cannot get a frictionless signup under a different
address than the one invited. Judged acceptable because in practice the invited manager
registers with the address the invite was sent to.

**Copy Link is kept** (reinforces 3.4). Reasons, in order:
1. Resend's free plan caps at 100 emails per day. Onboarding a large competition in one
   sitting could hit that cap, and a manual fallback avoids being blocked.
2. Covers a Resend outage or a rejected address.
3. Grassroots managers often prefer sending links by text or WhatsApp.
4. With D2 resolved as above, it carries no additional security cost.
