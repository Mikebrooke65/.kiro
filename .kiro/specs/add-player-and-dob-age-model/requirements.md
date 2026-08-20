# Requirements Document

## Introduction

This feature unifies how people are added to a team and replaces the team's `age_group` as the source of adult/child classification with each person's own date of birth. It grew out of building Task 1 (the add-a-junior RLS fix, `.kiro/specs/post-registration-welcome-and-team-page/`), which surfaced two things worth fixing properly rather than patching around:

1. **"Add Junior" is the only add-a-person button that exists.** A Manager can add a child (with caregiver consent), but there is no equivalent flow for adding an adult player — today that only happens by an admin/coach generating a generic invite outside this flow. This feature replaces "Add Junior" with a single **Add Player** entry point that branches on age.
2. **A caregiver is not represented as a team-affiliated adult anywhere.** Confirmed while investigating Task 1: a caregiver only exists as a `users` row (`role = 'caregiver'`) plus a `player_caregivers` link to their child — there is no `team_members` row, and messaging's "whole team" targeting (which reads `team_members` directly) silently excludes them as a result.

Fixing (2) surfaced a bigger question — whether "caregiver of this team" should become a new stored `team_members.role`, or stay a derived fact. **That question is resolved by this document** (see Requirement 6): it is derived, not stored. A caregiver's connection to a team runs through their child's own `team_members` row — never a `team_members` row of the caregiver's own on that team. This was confirmed directly against the messiest real case: **one person can be Admin, Coach of one team, Caregiver of their own child on that same team (via the child's membership, not a row of their own), and Manager of a second team (their daughter's) — all at once.** No stored-role scheme needs to represent that combination; it falls out for free once caregiver affiliation is derived rather than stored.

This feature also picks up a second, larger thread from a separate conversation the app owner had about the privacy policy (draft reviewed 2026-08-20): that draft already describes a v2 model where **every user provides a date of birth**, under-16 requires a linked caregiver, and 16-or-over is a self-declared adult. This document adopts that model as the mechanism for Add Player's adult/junior branch, and — because doing so makes `teams.age_group`-based classification unnecessary as the *only* source of truth — **explicitly supersedes** two rules confirmed in the prior spec:

- `post-registration-welcome-and-team-page` Requirement 3.9 ("age band determined from `teams.age_group`... SHALL NOT require a per-player date of birth") — replaced by Requirement 2 below.
- `post-registration-welcome-and-team-page` Requirement 5.2 ("add-a-junior form SHALL NOT capture... date of birth") — replaced by Requirement 4 below. The child still never signs in, still never has contact details or a photo collected, and the DOB is still visible only to Coach/Manager/Admin of that team (matching the privacy draft's "How we use date of birth" section) — only the DOB-collection prohibition itself is lifted.

Because this reopens decisions the privacy policy already describes in draft form, **the privacy policy draft and this spec need to move together** — whichever changes first should flag the other for review rather than drift apart.

**Not in scope here:** the caregiver multi-child RSVP feature (`event_rsvps.subject_user_id`, agreed 2026-08-20) is a separate, already-scoped piece of work that happens to share the "act on behalf of a linked child" shape. Nothing here should require re-opening that design; if implementation reveals it should, treat that as a signal to pause and reconcile, not to silently diverge.

## Glossary

Terms below are new or changed from the prior spec's glossary; unchanged terms (Model A, Synthetic email, Two-path consent, Club Tournament / External League team, Lite/Full user) carry over as defined there.

- **Add_Player_Flow**: The single entry point (replacing "Add Junior") through which a permitted user adds anyone — adult or child — to a Club Tournament team's roster.
- **Date of birth (DOB)**: A calendar date captured for every person added through Add_Player_Flow (adult or child) and, going forward, for every self-registering adult. Determines Adult/Junior classification (Requirement 2). Distinct from the *routing* DOB a Manager enters when adding someone (see Adult_Confirmation below) — the adult's own self-declared DOB, given at their own invite redemption, is the record of truth for their account; the Manager's entry is provisional and used only to route the flow.
- **Adult**: A person whose self-declared date of birth indicates they are 16 years or older as of today. Owns and uses their own login. (Supersedes the prior team-`age_group`-based definition.)
- **Junior**: A person whose date of birth indicates they are under 16 as of today. Never logs in; a linked Caregiver's account is the active one. (Supersedes the prior team-`age_group`-based definition; the prior spec's term "Child" is retained as a synonym where existing code/docs already use it.)
- **Adult_Confirmation**: The step, applied to the routing DOB a Manager enters in Add_Player_Flow, that decides whether the person being added is routed down the Adult or Junior path. It is provisional, not the record of truth (see Date of birth above).
- **Adult self-registration invite**: An `invite_codes` row with `intended_role` of `player`, `coach`, or `manager` (unchanged from the prior spec's Requirement 6), redeemed through the existing `redeem-invite` Edge Function, resulting in the invitee's own account and a `team_members` row. Add_Player_Flow's Adult path reuses this mechanism unchanged — it does not introduce a new invite type for adults.
- **Caregiver invite**: A new `invite_codes` variant (`intended_role = 'caregiver'`) generated by Add_Player_Flow's Junior path instead of creating the caregiver's account directly. Carries a reference to the specific child (`subject_user_id`, naming chosen to match the same concept already agreed for RSVP's `event_rsvps.subject_user_id`). Redeeming it creates the caregiver's own account (their own chosen password, not a system-generated one) and completes the `player_caregivers` link — it does **not** create a `team_members` row (see Requirement 6).
- **Derived caregiver affiliation**: The rule that "is this person a caregiver connected to team X" is never read from a stored row of the caregiver's own — it is computed by joining `player_caregivers` (caregiver → child) against the child's own `team_members` row(s). See Requirement 6.
- **Age-boundary transition**: What happens when a Junior's DOB indicates they have turned 16 while the season is in progress. Out of scope for this document's acceptance criteria (see Requirement 8) but flagged because it becomes newly answerable once DOB is tracked per person instead of per team.

## Requirements

### Requirement 1: Unified Add Player entry point

**User Story:** As a Manager of a Club Tournament team, I want one "Add Player" action that works for both adults and children, so that I don't need to know in advance which flow applies.

#### Acceptance Criteria

1. THE Team_Page SHALL replace the existing "Add Junior" action with a single "Add Player" action, available to the same roles (Coach, Manager, Admin) under the same Club Tournament team-type restriction as the prior "Add Junior" action (`post-registration-welcome-and-team-page` Requirement 4.2).
2. WHEN a permitted user opens Add_Player_Flow, THE Team_Page SHALL present a form capturing the person's first name, last name, and date of birth.
3. IF the Add_Player_Flow form is submitted with any field failing validation, THEN THE Team_Page SHALL reject the submission, SHALL retain the entered values, and SHALL display an indication of which field is invalid.
4. THE Team_Page SHALL NOT capture the person's contact details or photo through Add_Player_Flow, regardless of which path (Adult or Junior) the date of birth routes them to.
5. WHEN the entered date of birth is validated as 16 years or older as of today, THE Team_Page SHALL route the submission down the Adult path (Requirement 3) and SHALL require the submitting user to additionally provide the person's email address before proceeding.
6. WHEN the entered date of birth is validated as under 16 years as of today, THE Team_Page SHALL route the submission down the Junior path (Requirement 4) and SHALL require the submitting user to additionally provide the caregiver's name, email, and phone — matching the fields the prior "Add Junior" form already captured.
7. WHERE the Adult_Confirmation step routes to the Adult path, THE Team_Page SHALL display a plain confirmation of that routing (for example, restating the entered DOB and that an adult invite will be sent) before the submitting user confirms and the invite is sent, so a Manager can catch a mis-typed DOB before an invite goes out.

### Requirement 2: Date-of-birth-based age determination

**User Story:** As the app, I want to classify a person as Adult or Junior from their own date of birth rather than the team they play for, so that classification is accurate for that specific person instead of an approximation from their team's grade.

#### Acceptance Criteria

1. THE system SHALL classify a person as Adult when their date of birth indicates they are 16 years or older as of today, and as Junior otherwise. This supersedes `post-registration-welcome-and-team-page` Requirement 3.9's team-`age_group`-based classification.
2. WHERE a person has a recorded date of birth, THE Team_Page SHALL use Requirement 2.1's classification, in place of the team's `age_group`, to decide contact display (own cellphone for Adult, caregiver's for Junior — `post-registration-welcome-and-team-page` Requirement 3.7/3.8).
3. WHERE a person has no recorded date of birth (an existing user added before this feature shipped), THE Team_Page SHALL fall back to the team-`age_group`-based classification exactly as it worked before this feature, so no existing roster's contact display changes on deploy.
4. THE system SHALL NOT retroactively request a date of birth from existing users as part of this feature; backfill, if wanted, is a separate decision (Requirement 8).
5. WHERE the selected team's roster includes both people with a recorded date of birth and people without one, THE Team_Page SHALL apply Requirement 2.2 and 2.3 per person, not uniformly for the whole roster.
6. THE system SHALL record a person's date of birth in a way that admits a future display of upcoming birthdays (day and month only) to that team's Coach(es) and Manager(s), matching the already-drafted privacy policy's "How we use date of birth" section — but building that display is not required by this document.

### Requirement 3: Adult path — self-registration via invite

**User Story:** As a Manager adding an adult player, I want them to set up their own account the same way the club's first Manager did, so that they choose their own credentials instead of me creating an account on their behalf.

#### Acceptance Criteria

1. WHEN Add_Player_Flow routes to the Adult path, THE system SHALL generate an Adult self-registration invite for the entered email, with `intended_role` set to `player` and `team_id` set to the selected team — reusing the existing invite-generation and `redeem-invite` mechanism unchanged (`post-registration-welcome-and-team-page` Requirement 6).
2. THE system SHALL send the Adult self-registration invite to the entered email via the Send_Email_Function, following the same delivery pattern as the existing Manager-invite email.
3. WHEN the invitee redeems the Adult self-registration invite, THE Redeem_Invite_Function SHALL create their account and `team_members` row with role `player`, exactly as it does today for any `player`-intended invite.
4. WHEN the invitee redeems the Adult self-registration invite, THE Redeem_Invite_Function SHALL prompt the invitee to confirm their own date of birth is 16 or over before completing registration, matching the already-drafted privacy policy's "Age of account holders" self-declaration step. This confirmed date of birth, not the Manager's routing entry from Requirement 1.5, is the date of birth recorded on the invitee's `users` row.
5. IF the invitee's self-declared date of birth at redemption indicates they are under 16, THEN THE Redeem_Invite_Function SHALL reject completing registration through this invite and SHALL direct the submitting Manager to use the Junior path instead (decided 2026-08-20: never create a self-login account for someone under 16, even briefly). The exact rejection UX — what the invitee sees, and how the Manager is told to redo it as a Junior — is design-time work.
6. THE Adult path SHALL NOT introduce a new invite mechanism — Requirement 3.1's invite is created, sent, and redeemed by the same code paths as every other Adult self-registration invite in the app.

### Requirement 4: Junior path — child record and caregiver invite

**User Story:** As a Manager adding a child, I want the same consent-protected flow that exists today, with the caregiver ending up with a real self-chosen-password account instead of one I generated for them.

#### Acceptance Criteria

1. WHEN Add_Player_Flow routes to the Junior path, THE system SHALL create a child `users` row with a synthetic email that cannot sign in, recording the date of birth captured in Requirement 1.2 — this is the one exception to the child having no contact/DOB data collected, and it supersedes `post-registration-welcome-and-child-page` Requirement 5.2's DOB prohibition specifically for date of birth (contact details and photo remain uncollected).
2. THE child's date of birth SHALL be visible only to that team's Coach(es), Manager(s), and Admin — matching the already-drafted privacy policy's "How we use date of birth" section — and SHALL NOT be visible to other roles.
3. WHEN Add_Player_Flow routes to the Junior path AND no `users` row exists for the supplied caregiver email, THE system SHALL generate a Caregiver invite (`intended_role = 'caregiver'`, `subject_user_id` set to the new child's id) instead of creating the caregiver's account directly, and SHALL send it to the supplied email via the Send_Email_Function. This replaces the direct `create-auth-user` call the prior spec's Requirement 5.4 used.
4. WHEN Add_Player_Flow routes to the Junior path AND a `users` row already exists for the supplied caregiver email, THE system SHALL reuse that existing account and SHALL NOT generate a Caregiver invite for it (`post-registration-welcome-and-team-page` Requirement 5.5 continues to apply unchanged).
5. THE system SHALL create the `player_caregivers` link and the `caregiver_approvals` row exactly as `post-registration-welcome-and-team-page` Requirement 5.7 and 5.8 already describe, regardless of whether the caregiver's account already existed (Requirement 4.4) or was just invited (Requirement 4.3).
6. WHEN the invited caregiver redeems the Caregiver invite, THE Redeem_Invite_Function SHALL create their account using their own chosen password, set `users.role` to `caregiver`, and complete the `player_caregivers` link referenced by the invite's `subject_user_id` — and SHALL NOT create a `team_members` row for them (Requirement 6).
7. Redeeming a Caregiver invite (Requirement 4.6) SHALL NOT, by itself, approve the pending `caregiver_approvals` request — the caregiver must still take the explicit Approve/Deny action described in `post-registration-welcome-and-team-page` Requirement 5.11/5.12 after their account exists (decided 2026-08-20: double opt-in stays two genuinely separate acts — creating an account is not the same act as consenting to a specific child). This is exactly why Requirement 8 exists: with consent kept separate, getting the caregiver to that second, explicit step reliably is load-bearing, not optional polish.

### Requirement 5: Caregiver invite is a real invite, not a bypass

**User Story:** As the app, I want a Caregiver invite to behave like every other invite in the security-relevant ways, so that this new path doesn't quietly create a weaker way to mint an account.

#### Acceptance Criteria

1. THE `invite_codes.intended_role` valid set SHALL be extended from `player`, `coach`, `manager` to also include `caregiver`, superseding `post-registration-welcome-and-team-page` Requirement 6.1's valid set.
2. A Caregiver invite SHALL expire on the same schedule as any other invite code and SHALL be single-use, consistent with existing invite behaviour.
3. THE Redeem_Invite_Function SHALL decide role, `subject_user_id` handling, and whether a `team_members` row is created server-side from the invite's own stored `intended_role` and `subject_user_id`, and SHALL ignore any of these values supplied in the redemption request body — mirroring `post-registration-welcome-and-team-page` Requirement 6.6's existing rule for every other invite type.
4. IF a Caregiver invite's `subject_user_id` no longer resolves to a Junior `users` row at redemption time (for example, the child record was somehow removed), THEN THE Redeem_Invite_Function SHALL reject the redemption and SHALL NOT create a caregiver account through this path.

### Requirement 6: Caregiver-team affiliation is derived, not stored

**User Story:** As someone who is, say, Admin, Coach of one team, Caregiver of their own child on that same team, and Manager of a second team all at once, I want every one of those to be recognised correctly without the data model having to invent a row for each combination.

#### Acceptance Criteria

1. THE system SHALL NOT add `caregiver` as a `team_members.role` value, and SHALL NOT create a `team_members` row to represent a caregiver's connection to a team. A caregiver's connection to a team is established solely by their `player_caregivers` link to a child who holds their own `team_members` row on that team.
2. `team_members` SHALL continue to hold at most one row per `(team_id, user_id)` pair (its existing constraint, unchanged), and that row's `role` SHALL continue to be one of `player`, `coach`, `manager` only.
3. WHEN resolving "whole team" message recipients for a team (`messaging-api.ts` `resolveRecipients`, `'whole_team'` targeting), THE system SHALL include every caregiver linked, via `player_caregivers`, to a child who holds an active `team_members` row on that team — in addition to the team's own `team_members` rows. This is a confirmed live gap today (caregivers are silently excluded from "message the whole team") and this requirement closes it.
4. WHERE the Team_Page displays a roster entry for a Junior with a linked caregiver, THE Team_Page MAY continue to show that caregiver only as contact information on the child's row (as it does today) — Requirement 6.3 does not require giving the caregiver their own separate roster row.
5. THE system SHALL correctly represent a person holding any combination of: club-wide Admin (`users.role`), a stored `team_members` role on one or more teams, and a derived caregiver affiliation to one or more (possibly different) teams — with no conflict between the stored and derived facts, since they are read from different tables and a `team_members` row is never contested by a derived caregiver affiliation to the same team.
6. IF a future feature needs to enumerate "every adult connected to team X" (beyond the two known cases in Requirement 6.3), THEN THAT feature's design SHALL explicitly state whether it means stored `team_members` rows only, derived caregiver affiliations only, or both — rather than assuming `team_members` alone is the complete answer, which Requirement 6.1 makes no longer true.

### Requirement 7: Data model changes

**User Story:** As a developer implementing this feature, I want the schema changes this document requires enumerated in one place, so that design/tasks work from a fixed list rather than discovering them mid-build.

#### Acceptance Criteria

1. THE `users` table SHALL gain a nullable `date_of_birth` column, absent (`NULL`) for every existing row until an Adult redeems an invite with self-declared DOB (Requirement 3.4) or a Manager adds a Junior (Requirement 4.1).
2. THE `invite_codes` table SHALL gain a nullable `subject_user_id` column, referencing `users(id)`, populated only for a Caregiver invite (Requirement 4.3) and left `NULL` for every other invite type.
3. THE `invite_codes.intended_role` CHECK constraint SHALL be updated per Requirement 5.1.
4. No change is required to `team_members`, `player_caregivers`, or `caregiver_approvals` — all three already support everything this document describes (confirmed during the Introduction's investigation and Requirement 6's resolution).

### Requirement 8: Caregiver Approvals must be reachable and visible, not just linked by URL

**User Story:** As a caregiver who has just created an account specifically to respond to a consent request, I want that request to be impossible to miss, so that the flow doesn't quietly die because nothing in the app points me to it.

This closes a gap found live-testing Task 1: `CaregiverApprovalPage.tsx` exists at `/caregiver-approvals`, but nothing in the app — no nav item, no button, no notification — links to it; it only worked during testing because the URL was typed in by hand. Under the prior spec's direct-create flow that was a minor inconvenience for someone who already had app access for other reasons. Under this feature it is not survivable: a caregiver's entire reason for creating an account via a Caregiver invite (Requirement 4.6) is to act on one specific request, and if nothing shows them where it is, the flow ends at the exact point it's meant to complete.

#### Acceptance Criteria

1. THE app SHALL provide a reachable nav entry (or equivalent always-available UI element) to Caregiver Approvals — the bare route is not sufficient.
2. WHEN a user completes redemption of a Caregiver invite (Requirement 4.6) and has at least one pending `caregiver_approvals` row, THE app SHALL take that user's first authenticated screen to Caregiver Approvals rather than the normal Home/landing screen.
3. WHILE a logged-in user has one or more pending `caregiver_approvals` rows — regardless of how they arrived: first login via Requirement 8.2, a later login, or a second child's request added after the first was resolved — THE app SHALL display a visible indicator (for example, a badge count on the nav entry from Requirement 8.1) directing them to Caregiver Approvals, persisting across sessions until every pending request is acted on.
4. Requirement 8.2 and 8.3 apply to any user with a pending `caregiver_approvals` row, not only users who registered through a Caregiver invite — for example, an existing caregiver account gaining a second pending request for a different child, or (today, before this feature ships) an existing direct-created caregiver account.

### Requirement 9: Explicitly out of scope

Recorded so a future reader doesn't assume these were forgotten rather than deliberately deferred.

1. Backfilling `date_of_birth` for existing users is not part of this document (Requirement 2.4).
2. The age-boundary transition (a Junior's DOB indicating they've turned 16 mid-season) is not part of this document — flagged as newly answerable once DOB is tracked, not as something this document answers.
3. Whether the club's actual grading rules track a strict "16th birthday" line, versus something closer to the current U17-grade convention, has not been checked against the club/competition's own rules — the 16-year threshold here is carried over from the already-drafted privacy policy language, not independently verified. Confirm before this ships.
4. Updating `docs/privacy-policy-draft.md` and reconciling it with the uploaded `privacypolicydraft_2.md` draft is not part of this document, but per the Introduction, should not be allowed to drift far behind it.
5. Any UI/UX decision beyond what's stated as an acceptance criterion above (exact wording, screen layout, error copy) is design-time work, not specified here.
