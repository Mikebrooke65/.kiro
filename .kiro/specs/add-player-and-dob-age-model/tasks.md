# Implementation Plan: Add Player and Date-of-Birth Age Model

## Overview

This plan lands the work in the same layered order the prior spec used: database migrations first (two nullable columns, one CHECK-constraint change — nothing else moves), then the pure logic helpers with their property-based tests (fast-check + Vitest, `numRuns: 100`), then the `redeem-invite` Edge Function changes that own every privileged decision, then the API wrappers, and finally the UI that wires it together. Pure logic lives in `src/lib/add-player-logic.ts`, extensions to `supabase/functions/redeem-invite/logic.ts`, `src/lib/roster-logic.ts`, and an extracted pure union function inside `src/lib/messaging-api.ts` — matching the existing discipline that the trickiest correctness (the `team_members`-vs-`caregiver` branch) has a property test that can't accidentally pass by mocking the database into agreeing with itself.

`link-player-caregiver` and `respond-junior-approval` (Task 1) are reused unchanged — no task below touches them.

Tasks marked with `*` are optional test tasks and are not required for a working build.

## Tasks

- [x] 1. Database migrations for schema foundation
  - [x] 1.1 Add `date_of_birth` column to `users` migration
    - Add nullable `date_of_birth date`, no default, so every existing row stays `NULL`
    - _Requirements: 2.3, 2.4, 7.1_
  - [x] 1.2 Extend `invite_codes` for caregiver invites migration
    - Add nullable `subject_user_id uuid REFERENCES users(id)`
    - Replace `invite_codes_intended_role_check` to allow `('player','coach','manager','caregiver')`
    - _Requirements: 5.1, 7.2, 7.3_

- [ ] 2. Add Player routing pure logic (`src/lib/add-player-logic.ts`)
  - [ ] 2.1 Implement `routeAddPlayer`
    - Implement `AddPlayerRoutingInput`/`AddPlayerRoute` and `routeAddPlayer` per the design interface — 16-or-over as of the reference date routes `'adult'`, under 16 routes `'junior'`, boundary (exactly 16 today) is `'adult'`
    - _Requirements: 1.5, 1.6, 2.1_
  - [ ]* 2.2 Write property test for Add Player routing threshold
    - **Property 1: Add Player routing threshold**
    - **Validates: Requirements 1.5, 1.6, 2.1**

- [ ] 3. redeem-invite pure logic extensions (`supabase/functions/redeem-invite/logic.ts`)
  - [ ] 3.1 Extend `resolveEffectiveRole`'s valid set to include `caregiver`
    - Add `IntendedRole` type and `INTENDED_ROLES` (`player`, `coach`, `manager`, `caregiver`); widen `resolveEffectiveRole`'s valid-input set to match — behaviour otherwise unchanged (unknown/absent/`admin` still degrade to `player`)
    - _Requirements: 5.1_
  - [ ] 3.2 Implement `requiresTeamMembership`
    - Implement `requiresTeamMembership(role: IntendedRole): boolean`, returning `false` only for `'caregiver'` — kept deliberately separate from `resolveEffectiveRole`
    - _Requirements: 6.1, 6.2_
  - [ ] 3.3 Implement `isAdult`
    - Implement `isAdult(dateOfBirth: string, asOf?: Date): boolean` using the same 16-year threshold as `routeAddPlayer`
    - _Requirements: 3.4, 3.5_
  - [ ]* 3.4 Write property test for effective role resolution over the extended set
    - **Property 8: intended_role still degrades unknown values safely**
    - **Validates: Requirements 5.1 (implicitly, via `INTENDED_ROLES`), and the prior spec's Requirement 6.2-6.5 (regression guard)**
  - [ ]* 3.5 Write property test for requiresTeamMembership
    - **Property 9: requiresTeamMembership is the single source of the branch**
    - **Validates: Requirements 6.1, 6.2**
  - [ ]* 3.6 Write property test for the isAdult boundary
    - Covers the pure-logic slice of Property 3 (well-under-16, just-under-16, exactly-16-today, just-over-16, well-over-16)
    - **Validates: Requirements 3.5**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. redeem-invite handler changes (`supabase/functions/redeem-invite/index.ts`)
  - [ ] 5.1 Add `date_of_birth` to registration normalization and validation
    - Add `date_of_birth` to `NormalizedRegistration`/`validateRequest`; add `ValidationReason` value `missing_date_of_birth`; require it only when `effectiveRole !== 'caregiver'`
    - _Requirements: 3.4_
  - [ ] 5.2 Reject an under-16 self-declared DOB before any write
    - Before step 4, call `isAdult(reg.date_of_birth)`; on `false`, return a new safe `RedeemError` (Requirement 3.5's rejection, no compensations needed since nothing has been written yet) directing the Manager to redo the addition as a Junior
    - _Requirements: 3.5_
  - [ ] 5.3 Persist the self-declared date of birth on the Adult profile row
    - `profilePayload` gains `date_of_birth: reg.date_of_birth` for the Adult path; the Caregiver path never sets it
    - _Requirements: 3.4, 4.2_
  - [ ] 5.4 Gate the team_members insert behind requiresTeamMembership
    - Wrap existing step 5 in `if (requiresTeamMembership(effectiveRole))`
    - _Requirements: 6.1, 6.2_
  - [ ] 5.5 Validate subject_user_id and add step 5b (caregiver link)
    - When `effectiveRole === 'caregiver'`: validate `invite.subject_user_id` still resolves to a Junior `users` row (reject via `RedeemError` if not); upsert `player_caregivers` (`onConflict: 'player_id,caregiver_id', ignoreDuplicates: true`) so redeeming twice, or after an admin already linked the pair another way, is a no-op
    - _Requirements: 4.6, 5.1, 5.4_
  - [ ] 5.6 Extend the compensating-transaction ledger for the caregiver link
    - Add an optional `caregiverLink` entry to `CreationLedger` and a `delete_caregiver_link` case to `plannedCompensations()`, undone in the same reverse-order, created-by-this-invocation-only discipline as every other step
    - _Requirements: 4.6_
  - [ ] 5.7 Add has_pending_approval to the response payload
    - When redemption succeeds for a Caregiver invite and a pending `caregiver_approvals` row exists for `subject_user_id`, set `has_pending_approval: true` on the response; omit/false otherwise
    - _Requirements: 8.2_
  - [ ]* 5.8 Write integration test for DOB-mismatch rejection with no writes
    - **Property 3: DOB mismatch is rejected, not reclassified**
    - **Validates: Requirements 3.5**
  - [ ]* 5.9 Write integration test confirming a Caregiver invite never creates a team_members row
    - **Property 4: A Caregiver-intended invite never produces a team_members row**
    - **Validates: Requirements 4.6, 6.1, 6.2**
  - [ ]* 5.10 Write integration test for idempotent caregiver-link redemption
    - **Property 5: Caregiver redemption completes the correct link**
    - **Validates: Requirements 4.6, 5.1**
  - [ ]* 5.11 Write integration test for a vanished subject_user_id
    - **Property 6: A vanished subject is rejected**
    - **Validates: Requirements 5.4**
  - [ ]* 5.12 Write integration test confirming redemption never changes approval status
    - **Property 7: Redeeming a Caregiver invite never changes approval status**
    - **Validates: Requirements 4.7**
  - [ ]* 5.13 Write integration test for the has_pending_approval signal
    - **Property 13: Successful Caregiver redemption signals the redirect**
    - **Validates: Requirements 8.2**
  - [ ]* 5.14 Write integration test for Adult self-declaration overriding the routing guess
    - **Property 2: Adult self-declaration overrides the routing guess**
    - **Validates: Requirements 3.4**
  - [ ]* 5.15 Write integration test for compensation unwinding a freshly-created caregiver link
    - Cover a later-step failure (e.g. step 6) rolling back a `player_caregivers` row created earlier in the same invocation, while leaving a pre-existing link untouched
    - _Requirements: 4.6_

- [ ] 6. Roster age-band pure logic and DOB visibility (`src/lib/roster-logic.ts`, roster/team queries)
  - [ ] 6.1 Implement deriveAgeBandForPerson
    - Implement per the design interface: prefer a person's own DOB via `isAdult`-equivalent logic, fall back to `deriveAgeBand(ageGroup)` when absent
    - _Requirements: 2.2, 2.3, 2.5_
  - [ ] 6.2 Wire TeamPage's contact resolution to the per-person band
    - `TeamPage.tsx`'s `contactFor` call site switches from `deriveAgeBand(team.age_group)` to `deriveAgeBandForPerson(member.date_of_birth, team.age_group)`
    - _Requirements: 2.2, 2.5_
  - [ ] 6.3 Scope date_of_birth exposure to Coach/Manager/Admin of the team
    - Roster/team queries that select `date_of_birth` do so only for callers who are Coach, Manager, or Admin of that team, matching the existing scoping pattern for other roster contact fields
    - _Requirements: 4.2_
  - [ ]* 6.4 Write property test for age band preferring a personal date of birth
    - **Property 11: Age band prefers a personal date of birth**
    - **Validates: Requirements 2.2, 2.3, 2.5**

- [ ] 7. Derived caregiver affiliation for messaging (`src/lib/messaging-api.ts`)
  - [ ] 7.1 Extract a pure recipient-union function and wire it into resolveRecipients
    - Extract the `team_members` id set ∪ `player_caregivers`-derived caregiver id set (for caregivers whose child is a `team_members` row on that team) into a pure, testable function; call it from the `'whole_team'` case
    - _Requirements: 6.3_
  - [ ] 7.2 Fall back gracefully when the caregiver-link query fails
    - On failure of the new `player_caregivers` query, return the `team_members`-only result rather than failing the send; log, don't surface to the sender
    - _Requirements: 6.3_
  - [ ]* 7.3 Write property test for whole-team messaging including affiliated caregivers
    - **Property 10: Whole-team messaging includes affiliated caregivers**
    - **Validates: Requirements 6.3**

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. API wrappers (`src/lib/`)
  - [ ] 9.1 Extend invites-api.generateInviteCode with subjectUserId
    - Add an optional trailing `subjectUserId` parameter, confirm `intendedRole` accepts `'caregiver'`; passed through to the `invite_codes` insert unchanged otherwise
    - _Requirements: 4.3, 5.1_
  - [ ] 9.2 Replace direct caregiver account creation in caregivers-api.addJunior
    - When no `users` row exists for the supplied caregiver email, call `generateInviteCode(..., 'caregiver', childId)` instead of `createAuthUser`; when one already exists, keep the existing immediate-link path (Requirement 4.4) unchanged
    - _Requirements: 4.3, 4.4, 4.5_
  - [ ] 9.3 Implement getPendingApprovalCount
    - Thin wrapper over the existing `getMyPendingApprovals` (Task 1), returning just the count
    - _Requirements: 8.3_
  - [ ]* 9.4 Write property test for pending-approval count driving nav visibility
    - **Property 12: Pending-approval count drives nav visibility**
    - **Validates: Requirements 8.1, 8.3, 8.4**
  - [ ]* 9.5 Write unit tests for invite-generation call shape
    - Cover the Adult path (`intended_role: 'player'`, no `subjectUserId`) and the Caregiver path (`intended_role: 'caregiver'`, `subjectUserId` set)
    - _Requirements: 3.1, 4.3_

- [ ] 10. Add Player modal UI (`src/components/team/AddPlayerModal.tsx`, replaces `AddJuniorModal.tsx`)
  - [ ] 10.1 Build the routed Add Player form
    - Capture first name, last name, date of birth; use `routeAddPlayer` to reveal the email field (Adult) or the existing caregiver name/email/phone fields (Junior); no contact details or photo captured on either path
    - _Requirements: 1.2, 1.4, 1.5, 1.6_
  - [ ] 10.2 Add per-field validation with retained values
    - Reject submission on any invalid field, retain entered values, indicate which field failed
    - _Requirements: 1.3_
  - [ ] 10.3 Add the routing confirmation step
    - Before either submit fires, show a plain confirmation restating the entered DOB and which path (Adult invite vs. Junior/caregiver) it will take
    - _Requirements: 1.7_
  - [ ] 10.4 Wire submit to the Adult and Junior paths
    - Adult: call `invitesApi.generateInviteCode(teamId, email, ..., 'player')` and send via the existing invite email pattern. Junior: call `caregivers-api.addJunior` (now routing through Task 9.2's invite-based caregiver creation)
    - _Requirements: 3.1, 3.2, 4.1_
  - [ ] 10.5 Replace "Add Junior" with "Add Player" on the Team Page
    - Same permitted roles (Coach, Manager, Admin) and same Club-Tournament-only team-type restriction as the action it replaces
    - _Requirements: 1.1_
  - [ ]* 10.6 Write unit tests for routed-field visibility and gating
    - Cover Adult vs. Junior field sets, and that the action is hidden outside the permitted roles/team type
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

- [ ] 11. Adult self-declaration at invite redemption (registration/redemption screen)
  - [ ] 11.1 Add a DOB self-declaration step for player/coach/manager-intended invites
    - Prompt the invitee to confirm their own date of birth is 16 or over before completing registration; send it as `date_of_birth` in the redemption request
    - _Requirements: 3.4_
  - [ ] 11.2 Handle the DOB-mismatch rejection response
    - On the new `RedeemError` from Task 5.2, show a message explaining this invite is for an adult and directing the Manager to redo the addition as a Junior; do not auto-redirect into the Junior flow
    - _Requirements: 3.5_
  - [ ]* 11.3 Write unit test for DOB step visibility by intended role
    - Assert the DOB self-declaration step renders for player/coach/manager-intended redemption and not for a caregiver-intended one
    - _Requirements: 3.4, 4.6_

- [ ] 12. Caregiver Approvals visibility (`src/layouts/MainLayout.tsx`, redemption success screen)
  - [ ] 12.1 Add a pending-approval-gated nav tab with badge
    - Extend `tabsForRole` to accept `pendingApprovalCount` and conditionally include an Approvals tab with a badge equal to that count; fetched alongside the existing `useAuth()` profile read
    - _Requirements: 8.1, 8.3, 8.4_
  - [ ] 12.2 Render without the tab on a failed pending-count fetch
    - If `getPendingApprovalCount` fails, render the rest of navigation without the Approvals tab rather than blocking
    - _Requirements: 8.1_
  - [ ] 12.3 Route first-authenticated-screen to Caregiver Approvals when signalled
    - When the redemption response's `has_pending_approval` is `true` (Task 5.7), the Success Screen's primary action links to `/caregiver-approvals` instead of the app root
    - _Requirements: 8.2_
  - [ ]* 12.4 Write unit tests for the badge and redirect branch
    - Cover badge count/colour rendering and the redirect-vs-normal branch
    - _Requirements: 8.2, 8.3_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each of the 13 correctness properties from `design.md` is implemented as a single fast-check property test (`numRuns: 100`), tagged `// Feature: add-player-and-dob-age-model, Property {number}: {property_text}`.
- Properties 2, 3 (full rejection path), 4, 5, 6, 7, and 13 are exercised as integration tests against the `redeem-invite` handler rather than pure-function property tests, since they depend on the compensating-transaction/write behaviour of the handler itself — the pure-logic slices they build on (`isAdult`, `requiresTeamMembership`, `resolveEffectiveRole`) each still get their own property test in Task 3.
- `link-player-caregiver` and `respond-junior-approval` (Task 1) are unmodified by this feature — no task above touches them.
- No hard deletes; team names still render as `{age_group} {name}`; no club name, colour, logo, domain, or URL is hardcoded anywhere added here.
- Requirement 9's out-of-scope items (DOB backfill, age-boundary transition, reconciling the 16-year vs. U17-grade threshold, updating the privacy policy draft) have no corresponding tasks by design — they are deliberately deferred, not forgotten.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "3.1", "3.2", "3.3"] },
    { "id": 1, "tasks": ["2.2", "3.4", "3.5", "3.6", "5.1", "5.2", "5.3", "5.4", "5.5", "6.1", "7.1", "9.1"] },
    { "id": 2, "tasks": ["5.6", "5.7", "6.2", "6.3", "7.2", "9.2", "9.3"] },
    { "id": 3, "tasks": ["5.8", "5.9", "5.10", "5.11", "5.12", "5.13", "5.14", "5.15", "6.4", "7.3", "9.4", "9.5", "10.1"] },
    { "id": 4, "tasks": ["10.2", "10.3", "10.4", "10.5", "11.1", "12.1"] },
    { "id": 5, "tasks": ["10.6", "11.2", "12.2", "12.3"] },
    { "id": 6, "tasks": ["11.3", "12.4"] }
  ]
}
```
