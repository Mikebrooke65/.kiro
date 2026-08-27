# Requirements Document

## Introduction

This feature (V1.4 of the WCR / clubfootball.app coaching app) bundles the post-invite onboarding experience with the first build of a mobile **Team** page and the foundational **add-a-junior** consent flow. It also corrects two defects that block the intended experience.

The work has five outward-facing parts and two fixes:

1. **Improved success screen** shown after a person redeems an invite, rendered differently for the two registration paths the `redeem-invite` Edge Function already signals.
2. **Welcome / confirmation email** sent through the existing Resend `send-email` Edge Function, including a server-generated confirmation link that rescues the current non-matching-address dead-end.
3. **Mobile Team page** — a roster view (grouped Coach → Manager → Player) with contact display by age band and a role-driven permissions/actions model.
4. **Add-a-junior flow** — a two-path consent model (Model A) for adding children to a team, with double opt-in for self-service teams and upstream-consent recording for club-managed teams.
5. **Manager-role fix (Finding B)** — `redeem-invite` hardcodes `role: 'player'`, so manager invitees currently land as players.
6. **Player home dashboard fix (Finding A)** — the home "Teams" stat shows `0` for player-role users because it counts club-wide `teams` rows under RLS that a player cannot read.

All work honours the club-agnostic rule: no club name, colour, logo, domain, or URL is hardcoded. Client branding comes from `useClubBranding()` / `club_settings`; Edge Function branding comes from env vars (`CLUB_NAME`, `CLUB_COLOR`, `APP_URL`, `EMAIL_FROM`, `EMAIL_REPLY_TO`). Team names display everywhere as `{age_group} {name}`. Rosters use `team_members` as source of truth. There are no hard deletes; deactivation is via "mark inactive".

The core data model is not expected to change, with two possible exceptions surfaced here: invite codes may need an intended-role field (Requirement 6), and child records may need a provenance/consent marker (Requirement 5).

## Glossary

- **Adult**: A user in the U17 or Open age band. Owns and uses their own login. Their own cellphone is the contact of record.
- **Child**: A user in the U16-and-below age band. Under **Model A**, a child has a real `users` row but never logs in; the linked caregiver's account is the active one and the caregiver's contact is displayed.
- **Model A**: The chosen data model for children — the child gets a real `users` row with a **synthetic email** and never authenticates; a **caregiver** user (real email) is the active account; the two are linked via `player_caregivers`. Every child must be linked to at least one caregiver.
- **Synthetic email**: A system-generated, non-deliverable email address assigned to a child `users` row so the row satisfies the schema without implying the child can receive mail or sign in.
- **Caregiver**: An adult linked to one or more children via `player_caregivers`. Receives notifications and, for self-service teams, provides consent for the child's record.
- **Two-path consent**: The rule that consent is captured differently depending on team type. **Club Tournament** teams capture consent in-app via `caregiver_approvals` (double opt-in). **External League** teams rely on consent handled upstream by the club at import time.
- **Club Tournament team**: An in-app-managed team. Rosters are editable in the app by Coach/Manager/Admin. Junior additions use in-app double opt-in consent.
- **External League team**: A club-managed team whose roster originates from an external source (e.g., Friendly Manager import). Read-only in the app. Consent is asserted upstream by the club.
- **Team type**: The classification of a team as either Club Tournament or External League. Drives editability and the consent path.
- **Lite user**: A `users` row with `user_type = 'lite'` (minimal profile). 
- **Full user**: A `users` row with `user_type = 'full'`.
- **Age band**: The contact-display and login category derived from `teams.age_group` (NOT from a per-player date of birth — no DOB is collected). U17/Open = adult band; U16-and-below = child band.
- **Redeem_Invite_Function**: The existing `redeem-invite` Supabase Edge Function.
- **Send_Email_Function**: The existing Resend-backed `send-email` Supabase Edge Function.
- **Success_Screen**: The screen shown to a registrant immediately after invite redemption.
- **Team_Page**: The new mobile page under `src/pages/` presenting a team roster and role-appropriate actions.
- **Player_Caregiver_Link**: A row in `player_caregivers` (player_id, caregiver_id, unique) linking a child to a caregiver.
- **Caregiver_Approval**: A row in `caregiver_approvals` recording a consent request and its outcome (status pending/approved/denied/escalated, plus `responded_by`, `responded_at`).
- **Matching-address path**: Registration where the address used matches the invited `recipient_email`; the account is confirmed immediately (`email_confirmed = true`).
- **Non-matching-address path**: Registration where the address used differs from the invited `recipient_email`; the account is held behind an email-confirmation gate (`email_confirmation_required = true`).

## Requirements

### Requirement 1: Improved post-registration success screen

**User Story:** As a person who has just redeemed an invite, I want a clear, personalised welcome screen, so that I understand my account status and know what I can do next.

#### Acceptance Criteria

1. WHEN the Redeem_Invite_Function returns a response with `email_confirmed = true` and a non-empty first name, THE Success_Screen SHALL render the matching-address welcome and SHALL display a welcome message that includes the registrant's first name.
2. WHEN the Success_Screen renders the matching-address welcome, THE Success_Screen SHALL display the team name formatted as `{age_group} {name}`.
3. WHEN the Success_Screen renders the matching-address welcome and the invite has an associated non-empty competition name, THE Success_Screen SHALL display the competition name.
4. WHEN the Success_Screen renders the matching-address welcome and a non-empty application link is available from `useClubBranding()` `app_url`, THE Success_Screen SHALL display a link to open the application.
5. WHEN the Success_Screen renders the matching-address welcome, THE Success_Screen SHALL display guidance text that states all of the following: that on the Team_Page the registrant will see the team(s) they belong to and the people on that team with their roles; that if the registrant is a Manager, they can add players (needing the player's email, or for under-16s the caregiver's email) and can promote one additional player to Manager up to a maximum of two Managers per team; that the registrant can message people on their team; and that the registrant can see upcoming team events and record their attendance for them. **CORRECTED 2026-08-27**: the original wording here ("the registrant will see teams they can manage... can add players... can promote") assumed every registrant redeeming an invite is a Manager. Found wrong during Task 12 live-testing of the streamlined-invites-and-child-access spec — this same Success_Screen renders for a Player, Coach, or Caregiver redeeming an invite too, none of whom manage anything. The corrected wording above is role-agnostic, with the Manager-only actions explicitly scoped behind "if you are a Manager."
6. WHEN the Redeem_Invite_Function returns a response with `email_confirmation_required = true`, THE Success_Screen SHALL display a message instructing the registrant to check their email to confirm their account.
7. WHERE the client displays club branding on the Success_Screen, THE Success_Screen SHALL obtain that branding from `useClubBranding()` / `club_settings` and SHALL NOT use a hardcoded club name, colour, logo, or URL.
8. IF the Redeem_Invite_Function response contains neither `email_confirmed` nor `email_confirmation_required`, THEN THE Success_Screen SHALL display a generic confirmation that registration completed and instruct the registrant to log in.
9. IF the Success_Screen renders the matching-address welcome and the first name is absent or empty, THEN THE Success_Screen SHALL display the welcome message without a name placeholder, using a generic greeting in place of the first name.
10. IF the Success_Screen renders the matching-address welcome and no competition name is associated with the invite, THEN THE Success_Screen SHALL omit the competition name element without displaying an empty label or error.
11. IF the Success_Screen renders the matching-address welcome and no application link is available from `useClubBranding()` `app_url`, THEN THE Success_Screen SHALL omit the application link without displaying a broken or empty link.

### Requirement 2: Welcome and confirmation email

**User Story:** As a person who has just registered through an invite, I want to receive an email appropriate to my registration path, so that I am welcomed or can complete confirmation when my address differs from the invited one.

#### Acceptance Criteria

1. WHEN a registration completes on the matching-address path, THE Send_Email_Function SHALL send a welcome email addressed to the exact email address the registrant submitted during registration, within 30 seconds of the registration transaction committing.
2. WHEN a registration completes on the non-matching-address path, THE Redeem_Invite_Function SHALL generate a confirmation link server-side using `admin.auth.admin.generateLink`.
3. WHEN a confirmation link has been generated for the non-matching-address path, THE Send_Email_Function SHALL send an email containing that confirmation link to the exact email address the registrant used during registration, within 30 seconds of the link being generated.
4. WHEN the non-matching-address confirmation email is composed, THE email SHALL include one explanatory sentence stating that the address used differs from the invited address, that confirming completes registration if intentional, and that the registrant may ignore the email and re-register with the invited address if the difference was a mistake.
5. THE application SHALL send all onboarding emails through the Send_Email_Function (Resend) and SHALL NOT rely on GoTrue built-in SMTP.
6. WHERE an onboarding email includes club branding, THE Send_Email_Function SHALL source that branding from its environment variables and SHALL NOT accept branding from the client.
7. WHERE an onboarding email includes a team name, THE Send_Email_Function SHALL render it in the format `{age_group} {name}` sourced from server-side data only, and SHALL NOT accept team name or branding values from the client.
8. THE matching-address welcome email and the non-matching-address confirmation email SHALL share one link-generation and Resend-sending implementation, differing only in copy.
9. IF confirmation-link generation fails on the non-matching-address path, THEN THE Redeem_Invite_Function SHALL record the failure in server logs and return a response indicating that the account requires confirmation but the email could not be sent, and SHALL preserve the created account record.
10. IF the welcome email send fails on the matching-address path, THEN THE Send_Email_Function SHALL record the failure in server logs and THE registration transaction SHALL still complete successfully without rollback.

### Requirement 3: Team page roster view

**User Story:** As any member of a team, I want to view the team roster on a mobile Team page, so that I can see who is on the team and how to contact them.

#### Acceptance Criteria

1. WHEN an authenticated user associated with one or more teams opens the Team_Page, THE Team_Page SHALL display a team selector dropdown at the top of the page populated with every team the user is associated with according to `team_members`.
2. WHERE the user is associated with exactly one team, THE Team_Page SHALL auto-select that team in the team selector dropdown and display its roster without requiring further input.
3. THE Team_Page SHALL display each team name formatted as `{age_group} {name}`.
4. WHILE the roster for a selected team is being retrieved, THE Team_Page SHALL display a loading indication, and WHEN retrieval completes successfully, THE Team_Page SHALL display the roster grouped in the order Coach, then Manager, then Player.
5. WHERE a user holds more than one role on the selected team, THE Team_Page SHALL display that user once with all held roles listed together.
6. WHERE a roster member is inactive, THE Team_Page SHALL display that member with a greyed appearance and SHALL sort that member below all active members.
7. WHERE the selected team's age band is U17 or Open, THE Team_Page SHALL display each player's own cellphone as the contact.
8. WHERE the selected team's age band is U16-and-below, THE Team_Page SHALL display, as the contact, the name and cellphone of the child's linked caregiver, selecting the caregiver marked primary or, where no caregiver is marked primary, the most recently linked caregiver.
9. THE Team_Page SHALL determine the age band from the selected team's `age_group` value and SHALL NOT require a per-player date of birth.
10. THE Team_Page SHALL read roster membership from `team_members`.
11. WHERE the selected team's age band is U16-and-below AND a player has no linked caregiver, THE Team_Page SHALL display an indication that caregiver contact details are missing.
12. THE Team_Page SHALL include bottom padding of `pb-20` for mobile navigation clearance.
13. WHERE the user is associated with two or more teams, THE Team_Page SHALL leave the team selector with no team pre-selected, SHALL display a prompt to select a team, and SHALL display no roster until the user selects a team.
14. WHEN an authenticated user associated with no teams opens the Team_Page, THE Team_Page SHALL display an empty-state message indicating the user is not currently a member of any team and SHALL display no roster.
15. IF retrieval of the roster does not complete successfully within 10 seconds of a team being selected, THEN THE Team_Page SHALL display an error indication that the roster could not be loaded and SHALL provide a retry action that re-attempts retrieval while preserving the current team selection.

### Requirement 4: Team page permissions and actions

**User Story:** As a Coach, Manager, or Admin of a team, I want role-appropriate roster actions on the Team page, so that I can manage editable teams while club-managed teams stay protected.

#### Acceptance Criteria

1. THE Team_Page SHALL determine a user's Admin authority from a club-wide administrator attribute (`users.role` equal to `admin`) and SHALL determine a user's Coach or Manager authority from that user's role record for the selected team in `team_members`.
2. WHERE the current user holds a Coach, Manager, or Admin role on the selected team AND the team is a Club Tournament team, THE Team_Page SHALL enable editing of a member's name details, changing a member's role, marking a member inactive, reactivating an inactive member, and adding a user.
3. WHERE the selected team is an External League team, THE Team_Page SHALL present the roster as read-only for all users, exposing no roster-modifying action.
4. WHERE the current user holds only a Player or Caregiver role on the selected team AND does not hold club-wide Admin authority, THE Team_Page SHALL present the roster as read-only, exposing no roster-modifying action.
5. THE Team_Page SHALL NOT provide any action that permanently deletes a roster member; the only supported removal action SHALL be marking a member inactive.
6. WHEN a permitted user marks an active member inactive, THE Team_Page SHALL set the member's status to inactive, SHALL retain the member's record so the change can be reversed, and SHALL display confirmation that the member is now inactive.
7. WHEN a permitted user reactivates an inactive member, THE Team_Page SHALL set the member's status to active, SHALL retain the member's existing record, and SHALL display confirmation that the member is now active.
8. WHILE the selected team has fewer than two members holding the Manager role, THE Team_Page SHALL allow a permitted user to promote an eligible member to Manager.
9. IF a permitted user attempts to promote a member to Manager while the selected team already has two members holding the Manager role, THEN THE Team_Page SHALL prevent the promotion, SHALL leave the member's current role unchanged, and SHALL display a message indicating that the maximum of two Managers per team has been reached.
10. THE Team_Page SHALL enforce the maximum of two Managers per team at the data layer (database constraint or row-level security rule) so that a promotion request exceeding two Managers is rejected and the member's role is left unchanged even when the request bypasses the user interface.
11. WHEN any role opens the Team_Page, THE Team_Page SHALL present the roster view to that role, restricting only the available actions according to the user's role and the team type.

### Requirement 5: Add-a-junior consent flow

**User Story:** As a Manager of a Club Tournament team, I want to add a child to the team with the caregiver's consent captured, so that children are added lawfully and are linked to a responsible adult.

#### Acceptance Criteria

1. WHEN a permitted user adds a junior on a Club Tournament team, THE Team_Page SHALL present a form capturing the caregiver's name (1-100 characters), email (a valid email format of 1-254 characters), and phone (7-20 characters), and the child's first name (1-50 characters) and last name (1-50 characters) only.
2. THE add-a-junior form SHALL NOT capture the child's contact details, date of birth, or photo.
3. IF the add-a-junior form is submitted with any field failing its validation bounds, THEN THE Team_Page SHALL reject the submission, SHALL retain the entered values, and SHALL display an indication of which field is invalid.
4. WHEN a junior is added on a Club Tournament team AND no `users` row exists for the supplied caregiver email, THE system SHALL create a caregiver `users` row with the supplied real email that can sign in.
5. WHEN a junior is added on a Club Tournament team AND a `users` row already exists for the supplied caregiver email, THE system SHALL reuse the existing caregiver `users` row and SHALL NOT create a duplicate.
6. WHEN a junior is added on a Club Tournament team, THE system SHALL create a child `users` row with a synthetic email that cannot sign in.
7. WHEN a junior is added on a Club Tournament team, THE system SHALL create a `player_caregivers` link between the child record and the caregiver record, and SHALL NOT create a duplicate link where one already exists.
8. WHEN a junior is added on a Club Tournament team, THE system SHALL create a `caregiver_approvals` row with status `pending`.
9. WHEN a `caregiver_approvals` row is created with status `pending`, THE system SHALL send an approval-request notification to the caregiver via the Send_Email_Function.
10. WHILE a child's `caregiver_approvals` row has status `pending`, THE system SHALL keep the child `users` row inactive, and THE Team_Page SHALL display the child on the roster with a greyed appearance, a pending indicator, and as non-selectable.
11. WHEN a caregiver approves a pending request, THE system SHALL set the `caregiver_approvals` status to `approved`, record `responded_at`, and activate the child `users` row.
12. IF a caregiver denies or escalates a pending request, THEN THE system SHALL set the `caregiver_approvals` status to `denied` or `escalated` respectively, record `responded_at`, and keep the child `users` row inactive.
13. THE `caregiver_approvals` row with status `approved` and a recorded `responded_at` SHALL serve as the auditable consent record for a Club Tournament child.
14. WHERE a child record originates from an External League team, THE system SHALL record the club's upstream assertion of consent at import time and SHALL NOT require a `caregiver_approvals` step.
15. THE system SHALL link every External League child record to at least one caregiver contact for notification purposes.
16. THE system SHALL record the provenance of each child record indicating whether it originated from a Club Tournament self-service addition or an External League import.
17. THE Team_Page read side SHALL display External League club-managed rosters, including imported child records, as read-only.

### Requirement 6: Honour intended role on invite redemption (Finding B fix)

**User Story:** As a person who accepts a Manager invite, I want to be granted the Manager role, so that I have the permissions the invite was intended to give me.

#### Acceptance Criteria

1. THE invite code SHALL carry an intended role for the invited person constrained to the valid set `player`, `coach`, or `manager`.
2. WHEN the Redeem_Invite_Function creates a `users` profile row for a new registrant, THE Redeem_Invite_Function SHALL set the profile role consistent with the invite's intended role.
3. WHEN the Redeem_Invite_Function creates a `team_members` row for a registrant, THE Redeem_Invite_Function SHALL set the membership role to the invite's intended role.
4. IF an invite has no intended role recorded, THEN THE Redeem_Invite_Function SHALL default both the profile role and the membership role to `player` and complete without error.
5. IF an invite's intended role is absent from the valid set (including a value of `admin`), THEN THE Redeem_Invite_Function SHALL reject that value, default the role to `player`, and SHALL NOT grant an elevated role.
6. THE Redeem_Invite_Function SHALL decide role, `user_type`, `team_id`, and `active` server-side, and SHALL ignore any of these values supplied in the request body.
7. WHEN a Manager invite is created (for example via the Add Tournament Team modal's "Manager invite code"), THE invite-creation flow SHALL set the invite's intended role to `manager`.

### Requirement 7: Correct the player home dashboard teams count (Finding A fix)

**User Story:** As a player, I want my home dashboard to show the teams I belong to, so that the count is accurate and meaningful to me.

#### Acceptance Criteria

1. WHEN a player-role user views the home dashboard, THE home dashboard "Teams" stat SHALL display the number of distinct teams for which the user has a matching `team_members` record and SHALL NOT display a club-wide count of all teams.
2. THE home dashboard SHALL derive the player's team membership from `team_members` rather than from a `teams` table count that RLS restricts.
3. WHEN a player-role user belongs to one or more teams, THE home dashboard "Teams" stat SHALL display a count equal to the number of distinct teams the user belongs to.
4. THE application SHALL read team data on the Games and Coaching pages through a join keyed on the current user's id from `team_members` to `teams`, so that the result set equals the user's `team_members` membership and is not reduced to zero by the `teams` SELECT policy for a player-role user.
5. WHEN a user belongs to no teams, THE home dashboard "Teams" stat SHALL display `0`.
6. WHERE the current user holds club-wide Admin authority, THE home dashboard MAY display a club-wide count, WHILE for a player-role user THE home dashboard SHALL display the personal team count derived from `team_members`.
7. IF the team-membership query for the home dashboard fails, THEN THE home dashboard SHALL display an error indication for the "Teams" stat rather than a misleading number, and SHALL leave the other stats unaffected.

## Open Decisions (to be resolved during design)

The following were explicitly deferred and must be resolved before or during design; do not assume answers:

1. **Unapproved child record retention** — what happens to a child record whose `caregiver_approvals` request is never approved, and after how long. Ties to the privacy policy and data-minimisation obligations.
2. **Multiple / separated caregivers** — the rights and precedence when a child is linked to more than one caregiver (e.g., who can approve, who receives notifications, conflicting instructions).
3. **Age-boundary transition** — how a child record transitions to its own login when the child moves from U16-and-below to U17/Open, including whether the synthetic email is replaced with a real one.
4. **GoTrue SMTP configuration** — assumed not configured; onboarding email uses Resend. Confirm before relying on any GoTrue-sent mail.
