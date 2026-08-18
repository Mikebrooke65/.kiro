# Implementation Plan: Post-Registration Welcome and Team Page

## Overview

This plan implements V1.4 in TypeScript across three layers already enforced by the codebase: database migrations (source of truth + RLS), Edge Functions (`redeem-invite`, `send-email`), and the client (`src/`). The strategy is to land the schema first, then the pure logic helpers with their property-based tests (fast-check + Vitest, `numRuns: 100`), then the Edge Function and API-wrapper behavior, and finally the UI that wires everything together. Pure logic is extracted into `src/lib/*-logic.ts` (and `supabase/functions/redeem-invite/logic.ts`) so the 21 correctness properties can be verified without React or a live Supabase connection.

Tasks marked with `*` are optional test tasks and are not required for a working build.

## Tasks

- [x] 1. Database migrations for schema foundation
  - [x] 1.1 Add `club_settings` single-row table migration
    - Create `public.club_settings` with `club_name`, `primary_color`, `logo_url`, `app_url`, single-row `CHECK (id = true)`, and RLS (authenticated read, admin manage)
    - _Requirements: 1.7_
  - [x] 1.2 Add `team_type` column to `teams` migration
    - Add `team_type text NOT NULL DEFAULT 'club_tournament' CHECK (team_type IN ('club_tournament','external_league'))`
    - _Requirements: 4.3, 5.14, 5.17_
  - [x] 1.3 Allow `manager` role and enforce Manager cap on `team_members` migration
    - Replace `team_members_role_check` to allow `('player','coach','manager')`
    - Add `enforce_manager_cap()` function and `BEFORE INSERT OR UPDATE` trigger raising `manager_cap_reached` at 2 managers
    - _Requirements: 4.10, 6.1_
  - [x] 1.4 Add `intended_role` column to `invite_codes` migration
    - Add nullable `intended_role text CHECK (intended_role IN ('player','coach','manager'))` (excludes `admin` by design)
    - _Requirements: 6.1_
  - [x] 1.5 Add child provenance/sign-in columns to `users` migration
    - Add `is_child boolean NOT NULL DEFAULT false` and `child_provenance text CHECK (child_provenance IN ('club_tournament','external_league'))`
    - _Requirements: 5.6, 5.16_
  - [x] 1.6 Extend `caregiver_approvals` for add-child consent migration
    - Add `request_kind text NOT NULL DEFAULT 'add_caregiver' CHECK (request_kind IN ('add_caregiver','add_child'))` and `team_id uuid REFERENCES teams(id)`
    - _Requirements: 5.8, 5.13_

- [x] 2. Success screen pure logic (`src/lib/success-screen-logic.ts`)
  - [x] 2.1 Implement welcome-variant, greeting, and team-label helpers
    - Implement `selectWelcomeVariant`, `buildGreeting`, and `formatTeamLabel` per the design interfaces
    - Export `RedeemInviteResult`/`WelcomeVariant` types used by the Success Screen
    - _Requirements: 1.1, 1.2, 1.6, 1.8, 1.9_
  - [ ]* 2.2 Write property test for welcome variant selection
    - **Property 1: Welcome variant selection**
    - **Validates: Requirements 1.1, 1.6, 1.8**
  - [ ]* 2.3 Write property test for team name formatting
    - **Property 2: Team name formatting**
    - **Validates: Requirements 1.2, 2.7, 3.3**
  - [ ]* 2.4 Write property test for greeting with absent names
    - **Property 3: Greeting handles absent names**
    - **Validates: Requirements 1.9**

- [x] 3. Roster pure logic (`src/lib/roster-logic.ts`)
  - [x] 3.1 Implement roster derivation helpers
    - Implement `deriveAgeBand`, `selectCaregiverContact`, `groupAndSortRoster`, `mergeRoles`, and a team-selection helper that maps a `team_members` set to selector options + auto-selection state
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.13_
  - [ ]* 3.2 Write property test for team selector state
    - **Property 5: Team selector reflects membership and selection state**
    - **Validates: Requirements 3.1, 3.2, 3.13**
  - [ ]* 3.3 Write property test for roster grouping and active ordering
    - **Property 6: Roster grouping and active ordering**
    - **Validates: Requirements 3.4, 3.6**
  - [ ]* 3.4 Write property test for role merging
    - **Property 7: Roster merges multiple roles per user**
    - **Validates: Requirements 3.5**
  - [ ]* 3.5 Write property test for contact display by age band
    - **Property 8: Contact display by age band**
    - **Validates: Requirements 3.7, 3.8, 3.9, 3.11**

- [x] 4. Permissions pure logic (`src/lib/permissions-logic.ts`)
  - [x] 4.1 Implement capability resolution and activation helpers
    - Implement `resolveCapabilities`, a `canPromoteToManager(managerCount)` guard, and a pure deactivate/reactivate transition that preserves record identity
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11, 5.17_
  - [ ]* 4.2 Write property test for action capabilities
    - **Property 9: Action capabilities honour role and team type**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.11, 5.17**
  - [ ]* 4.3 Write property test for manager promotion cap
    - **Property 10: Manager promotion cap**
    - **Validates: Requirements 4.8, 4.9**
  - [ ]* 4.4 Write property test for deactivate/reactivate round trip
    - **Property 11: Deactivate/reactivate round trip preserves the record**
    - **Validates: Requirements 4.6, 4.7**

- [x] 5. Add-a-junior and consent pure logic (`src/lib/add-junior-logic.ts`)
  - [x] 5.1 Implement validation, idempotency, consent, and provenance helpers
    - Implement `validateAddJunior`; caregiver-reuse and link-dedupe resolution helpers; `deriveChildState(approvalStatus)`; `applyConsentDecision`; provenance assignment; and an external-league "child linked to ≥1 caregiver" check
    - _Requirements: 5.3, 5.5, 5.7, 5.10, 5.11, 5.12, 5.15, 5.16_
  - [ ]* 5.2 Write property test for add-junior validation
    - **Property 12: Add-junior validation rejects out-of-bounds fields**
    - **Validates: Requirements 5.3**
  - [ ]* 5.3 Write property test for idempotent add-junior writes
    - **Property 13: Add-junior writes are idempotent**
    - **Validates: Requirements 5.5, 5.7**
  - [ ]* 5.4 Write property test for pending-child state
    - **Property 14: Pending child is inactive and non-selectable**
    - **Validates: Requirements 5.10**
  - [ ]* 5.5 Write property test for consent decision transitions
    - **Property 15: Consent decision transitions**
    - **Validates: Requirements 5.11, 5.12**
  - [ ]* 5.6 Write property test for external-league caregiver linkage
    - **Property 16: Every external-league child is linked to a caregiver**
    - **Validates: Requirements 5.15**
  - [ ]* 5.7 Write property test for child provenance recording
    - **Property 17: Child provenance is recorded**
    - **Validates: Requirements 5.16**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Redeem-invite role fix (`supabase/functions/redeem-invite/`)
  - [x] 7.1 Add `resolveEffectiveRole` to `logic.ts`
    - Implement classifier: valid role passthrough; null/absent → `player`; anything else (incl. `admin`) → `player`
    - _Requirements: 6.2, 6.3, 6.4, 6.5_
  - [x] 7.2 Apply role resolution and server-side field ownership in the handler
    - Use `resolveEffectiveRole(invite.intended_role)` for both the `users` profile role and the `team_members` role
    - Continue ignoring client-supplied `role`/`user_type`/`team_id`/`active`
    - On the non-matching path, generate a confirmation link via `admin.auth.admin.generateLink` and, on failure, log, preserve the account, and return "confirmation required but not sent"
    - _Requirements: 6.2, 6.3, 6.6, 2.2, 2.9_
  - [ ]* 7.3 Write property test for effective role resolution
    - **Property 18: Effective role resolution**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**
  - [ ]* 7.4 Write property test for ignoring client-supplied privileged fields
    - **Property 19: Server ignores client-supplied privileged fields**
    - **Validates: Requirements 6.6**
  - [ ]* 7.5 Write integration test for confirmation-link generation and failure handling
    - Cover link generation on the non-matching path and the preserve-account/failure-response path (stubbed admin API)
    - _Requirements: 2.2, 2.9_

- [x] 8. Welcome and confirmation email types (`supabase/functions/send-email/`)
  - [x] 8.1 Add `welcome` and `confirm_registration` types on one shared send path
    - Extend `EmailRequest` with `WelcomeData` and `ConfirmRegistrationData`; share the link-generation/Resend-send implementation, differing only in copy
    - Source branding from env vars and render team names as `{age_group} {name}` from server data only
    - _Requirements: 2.6, 2.7, 2.8_
  - [ ]* 8.2 Write property test for the confirmation email explanatory sentence
    - **Property 4: Confirmation email includes the explanatory sentence**
    - **Validates: Requirements 2.4**
  - [ ]* 8.3 Write unit tests for shared send path and branding sourcing
    - Assert both email types reuse one send path and reject client-supplied branding/team-name values
    - _Requirements: 2.6, 2.7, 2.8_
  - [ ]* 8.4 Write integration/smoke tests for email delivery and routing
    - Cover 30-second send timing, matching-path welcome-send-failure non-rollback, and Resend (not GoTrue SMTP) routing (stubbed Resend)
    - _Requirements: 2.1, 2.3, 2.5, 2.10_

- [x] 9. Club branding hook (`src/hooks/useClubBranding.ts`)
  - [x] 9.1 Implement `useClubBranding` reading `club_settings`
    - Return `ClubBranding` (`club_name`, `primary_color`, `logo_url`, `app_url`), each nullable so consumers can omit absent elements
    - _Requirements: 1.7_
  - [ ]* 9.2 Write unit test for branding sourcing and omission
    - Assert values come from `club_settings` and absent values yield omission, never a hardcoded default
    - _Requirements: 1.7_

- [x] 10. API wrappers (`src/lib/`)
  - [x] 10.1 Implement `invites-api` result typing and matching-path welcome trigger
    - Type `RedeemInviteResult`; on matching-path success, trigger `send-email` type `welcome` to the submitted address (fire-and-forget)
    - _Requirements: 2.1, 2.10_
  - [x] 10.2 Implement `teams-api.getMyTeamCount` and roster join query
    - Add `getMyTeamCount(userId)` (distinct `team_id` from `team_members`) and a `team_members → teams` roster/team query keyed on the current user
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 3.10_
  - [x] 10.3 Implement `caregivers-api.addJunior` and consent-decision handlers
    - Orchestrate validate → resolve/create caregiver → create inactive child → upsert `player_caregivers` → insert pending `caregiver_approvals` → notify caregiver; add approve/deny/escalate handlers using the consent helpers
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.11, 5.12_
  - [ ]* 10.4 Write property test for personal teams count
    - **Property 20: Personal teams count from team_members**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.6**
  - [ ]* 10.5 Write property test for team-query-equals-membership
    - **Property 21: Team query result equals membership**
    - **Validates: Requirements 7.4**
  - [ ]* 10.6 Write integration tests for add-junior writes and data-layer enforcement
    - Cover caregiver/child auth-account creation and sign-in capability, approval-request notification, the manager-cap trigger, and External League read-only RLS (Supabase/Resend stubbed)
    - _Requirements: 5.4, 5.6, 5.9, 4.10, 5.17_

- [x] 11. Success Screen UI (`src/pages/LiteLandingPage.tsx`)
  - [x] 11.1 Replace the success branch with a branded, path-aware screen
    - Render matching / confirmation-required / generic variants using `success-screen-logic`, `useClubBranding`, and the `invites-api` result; include guidance text and conditional competition/app-link; preserve the safe-error render guard
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.10, 1.11_
  - [ ]* 11.2 Write unit tests for success-screen content
    - Cover guidance text, competition/app-link presence and omission
    - _Requirements: 1.3, 1.4, 1.5, 1.10, 1.11_

- [x] 12. Team Page UI (`src/pages/TeamPage.tsx`)
  - [x] 12.1 Create the Team Page and route it in `MainLayout`
    - Render the selector, grouped roster, contact display, action controls (gated via `permissions-logic`), loading/empty/multi-team/error states with retry, and `pb-20`; route at `/team` in the authenticated layout
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11, 3.12, 3.13, 3.14, 4.2, 4.6, 4.7, 4.9, 4.11, 5.10_
  - [ ]* 12.2 Write unit tests for Team Page states
    - Cover `pb-20` layout, multi-team prompt, and no-team empty state
    - _Requirements: 3.12, 3.13, 3.14_
  - [ ]* 12.3 Write integration test for roster-load timeout and retry
    - Cover the 10-second timeout error state and retry preserving the selection
    - _Requirements: 3.15_

- [x] 13. Add-a-Junior modal UI (`src/components/team/AddJuniorModal.tsx`)
  - [x] 13.1 Create the Add-a-Junior modal wired to `caregivers-api`
    - Present the caregiver + child fields only, surface per-field validation errors while retaining values, and submit via `addJunior`; shown only to permitted users on Club Tournament teams
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 13.2 Write unit tests for form field composition
    - Assert only the permitted fields are captured (no child contact/DOB/photo)
    - _Requirements: 5.1, 5.2_

- [x] 14. Home dashboard and page team-query fix
  - [x] 14.1 Update `Landing` stats and Games/Coaching team reads
    - Use `getMyTeamCount` for the player "Teams" stat with a per-stat error indicator; route Games/Coaching team reads through the `team_members → teams` join
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [ ]* 14.2 Write unit tests for the Teams stat
    - Cover player personal count, admin club-wide count, zero-team case, and isolated error indicator
    - _Requirements: 7.5, 7.6, 7.7_

- [x] 15. Manager-invite creation sets intended role
  - [x] 15.1 Set `intended_role = 'manager'` in the Add Tournament Team manager-invite flow
    - Update invite-creation to persist `intended_role` on the invite code
    - _Requirements: 6.7_
  - [ ]* 15.2 Write unit test for manager-invite creation
    - Assert a manager invite records `intended_role = 'manager'`
    - _Requirements: 6.7_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each of the 21 correctness properties is implemented as a single fast-check property test (`numRuns: 100`), tagged `// Feature: post-registration-welcome-and-team-page, Property {number}: {property_text}`.
- Pure-logic helpers are extracted so properties can be verified without React or a live Supabase connection; UI tasks consume those helpers and wire them together, leaving no orphaned code.
- Integration and smoke tests cover external/data-layer behavior (email delivery/timing, auth-account creation, manager-cap trigger, RLS, roster timeout) that is unsuited to property testing.
- No club branding is hardcoded; team names render everywhere as `{age_group} {name}`; there are no hard deletes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "2.1", "3.1", "4.1", "5.1", "7.1", "8.1", "9.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "3.5", "4.2", "4.3", "4.4", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "7.2", "8.2", "8.3", "9.2", "10.1", "10.2", "10.3", "15.1"] },
    { "id": 2, "tasks": ["7.3", "7.4", "7.5", "8.4", "10.4", "10.5", "10.6", "11.1", "12.1", "13.1", "14.1", "15.2"] },
    { "id": 3, "tasks": ["11.2", "12.2", "12.3", "13.2", "14.2"] }
  ]
}
```
