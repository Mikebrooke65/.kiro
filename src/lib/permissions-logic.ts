// Feature: post-registration-welcome-and-team-page
// Pure permission logic for the Team Page. No React, no Supabase — deterministic
// functions so the correctness properties can be verified in isolation.

import type { TeamRole } from '../types/database';

/**
 * Team classification that governs which roster actions are ever available.
 * `club_tournament` teams are club-managed self-service teams (editable by
 * Coach/Manager/Admin); `external_league` teams are club-managed imports that
 * are always read-only (Req 4.3, 5.17).
 */
export type TeamType = 'club_tournament' | 'external_league';

/**
 * Roles that a user may hold on a team for permission purposes. This is a
 * superset of {@link TeamRole} that also includes `caregiver`, which is not a
 * membership role but is relevant to the read-only rule in Req 4.4.
 */
export type PermissionRole = TeamRole | 'caregiver';

/**
 * The set of roster-modifying actions the Team Page may expose to a user.
 * There is deliberately no permanent-delete capability (Req 4.5); removal is
 * only ever "mark inactive" via {@link deactivateMember}.
 */
export interface ActionCapabilities {
  canEditNames: boolean;
  canChangeRole: boolean;
  canDeactivate: boolean;
  canReactivate: boolean;
  canAddUser: boolean;
  /** false when the team already has the maximum of two Managers (Req 4.8/4.9). */
  canPromoteToManager: boolean;
}

/** Maximum number of Managers permitted per team (Req 4.8/4.9, mirrored at the data layer). */
export const MANAGER_CAP = 2;

/** A capability set with every roster-modifying action disabled (read-only). */
const READ_ONLY: Readonly<ActionCapabilities> = {
  canEditNames: false,
  canChangeRole: false,
  canDeactivate: false,
  canReactivate: false,
  canAddUser: false,
  canPromoteToManager: false,
};

/**
 * Whether a member may still be promoted to Manager.
 *
 * Allowed only while the selected team has fewer than {@link MANAGER_CAP}
 * members holding the Manager role (Req 4.8). A count at or above the cap
 * blocks further promotions (Req 4.9). Negative or non-finite counts are
 * treated conservatively as "not allowed".
 */
export function canPromoteToManager(managerCount: number): boolean {
  if (!Number.isFinite(managerCount) || managerCount < 0) {
    return false;
  }
  return managerCount < MANAGER_CAP;
}

/**
 * Resolve the roster-modifying capabilities for a user on the selected team.
 *
 * Rules encoded:
 * - External League ⇒ all read-only for every user regardless of role (Req 4.3, 5.17).
 * - Coach/Manager/Admin on a Club Tournament team ⇒ may edit names, change role,
 *   deactivate, reactivate, and add a user (Req 4.2), with promote-to-Manager
 *   gated by the two-Manager cap (Req 4.8/4.9).
 * - Player/Caregiver without club-wide Admin authority ⇒ read-only (Req 4.4).
 * - No permanent-delete capability is ever exposed (Req 4.5).
 *
 * The roster view itself is always shown; only actions are gated (Req 4.11).
 */
export function resolveCapabilities(input: {
  isClubAdmin: boolean;
  teamRoles: readonly PermissionRole[];
  teamType: TeamType;
  managerCount: number;
}): ActionCapabilities {
  // External League teams are read-only for everyone (Req 4.3, 5.17).
  if (input.teamType === 'external_league') {
    return { ...READ_ONLY };
  }

  // Edit authority comes from club-wide Admin, or a Coach/Manager membership
  // role on the selected team (Req 4.1/4.2). Player/Caregiver alone is not
  // sufficient (Req 4.4).
  const hasEditAuthority =
    input.isClubAdmin ||
    input.teamRoles.includes('coach') ||
    input.teamRoles.includes('manager');

  if (!hasEditAuthority) {
    return { ...READ_ONLY };
  }

  return {
    canEditNames: true,
    canChangeRole: true,
    canDeactivate: true,
    canReactivate: true,
    canAddUser: true,
    canPromoteToManager: canPromoteToManager(input.managerCount),
  };
}

/**
 * Whether the current viewer may add (or invite) a caregiver for a given
 * child (Requirement 7.5, `streamlined-invites-and-child-access` Task 9).
 *
 * - External League teams stay fully read-only for everyone (Req 4.3/5.17)
 *   — attaching a caregiver is a roster-modifying action like any other.
 * - Club-wide Admin can always add a caregiver, first or additional.
 * - A Coach/Manager on the team may only add the child's FIRST caregiver —
 *   once a child already has one or more linked caregivers, adding another
 *   requires club-wide Admin ("any additional caregiver beyond the first
 *   must be added by a club admin").
 * - Player/Caregiver alone is never sufficient (Req 4.4, same as every
 *   other roster-modifying action).
 *
 * This is a client-side convenience only — it decides whether to SHOW the
 * action, never the actual authority to perform it. The real gate lives at
 * the data layer in both places a caregiver can actually be attached (the
 * `invite_codes` RLS policy, and the `link-player-caregiver` Edge
 * Function — migration 056), so a stale or bypassed client check can never
 * let an unauthorized write through.
 *
 * A negative or non-finite `existingCaregiverCount` (a defensive default on
 * a failed count, mirroring `canPromoteToManager`'s own stance) is never
 * treated as zero — it simply never equals zero, so it falls through to
 * "not allowed" for a non-admin exactly like any other non-zero count.
 */
export function canAddCaregiver(input: {
  isClubAdmin: boolean;
  teamRoles: readonly PermissionRole[];
  teamType: TeamType;
  existingCaregiverCount: number;
}): boolean {
  if (input.teamType === 'external_league') {
    return false;
  }

  if (input.isClubAdmin) {
    return true;
  }

  const hasEditAuthority =
    input.teamRoles.includes('coach') || input.teamRoles.includes('manager');
  if (!hasEditAuthority) {
    return false;
  }

  return input.existingCaregiverCount === 0;
}

/**
 * Whether the current viewer may issue a child a fresh device-access code
 * (Requirement 7.4, `streamlined-invites-and-child-access` Task 6).
 *
 * Found 2026-08-31, testing the Section 6.2 self-service "Remove My
 * Caregiver" follow-up (migration 062): this used to be gated purely on
 * "is the viewer a linked caregiver of this child" (`myLinkedChildIds` in
 * `TeamPage.tsx`). That works fine right up until a 16+ player exercises
 * their new self-service removal and ends up with zero linked caregivers —
 * at which point NOBODY could issue them a new code any more, not even a
 * Coach, Manager, or club Admin. A caregiver-less adult who ever loses
 * their session (new device, cleared browser) would have had no way back
 * in at all.
 *
 * Fix: same authority model `canAddCaregiver` already uses for this exact
 * class of problem — club-wide Admin, or a Coach/Manager on this specific
 * team, can act here too, in addition to (not instead of) a linked
 * caregiver. External League teams stay fully read-only for everyone, same
 * as every other roster-modifying action.
 *
 * This is a client-side convenience only — it decides whether to SHOW the
 * button, never the actual authority to call the Edge Function. The real
 * gate lives server-side in `generate-device-code`, which independently
 * checks linked-caregiver / admin / team coach-manager status under
 * service role before minting a code.
 */
export function canIssueDeviceAccess(input: {
  isClubAdmin: boolean;
  teamRoles: readonly PermissionRole[];
  teamType: TeamType;
  isLinkedCaregiver: boolean;
}): boolean {
  if (input.teamType === 'external_league') {
    return false;
  }

  if (input.isLinkedCaregiver) {
    return true;
  }

  return (
    input.isClubAdmin || input.teamRoles.includes('coach') || input.teamRoles.includes('manager')
  );
}

/**
 * Whether the current viewer may permanently remove a specific
 * (person, role, team) association — one `team_members` row, or the
 * equivalent caregiver link — from the roster (product decision 2026-08-31,
 * surfaced testing Task 12 item 6's existing-user bypass and the resulting
 * question of how to undo a mistaken Add).
 *
 * This supersedes `Deactivate` as the roster page's "undo" mechanism.
 * `Deactivate`/`Reactivate` toggle `users.active` — the WHOLE account,
 * every team and role at once (confirmed by reading `handleDeactivate` /
 * `handleReactivate` in `TeamPage.tsx`) — which is too blunt for "I added
 * the wrong person" or "I want to leave this one team": it would also kill
 * any unrelated roles the same person holds elsewhere (e.g. removing a
 * mistaken Player-add for someone who is also a caregiver on another team
 * would kill their caregiver access too). `Remove` instead deletes exactly
 * one membership row, matching how caregiver self-removal already works
 * (migration 062) — this function is that same rule, generalized to every
 * team-membership role.
 *
 * Rules encoded (decided by the user 2026-08-31):
 * - External League teams stay fully read-only for everyone, same as every
 *   other roster-modifying action (Req 4.3/5.17) — nobody can Remove there,
 *   not even themselves. This also sidesteps the "bulk-imported league
 *   teams may have no clear first Manager" edge case, since the whole
 *   question never arises for a team type where Remove never shows at all.
 * - Any user may Remove their OWN row(s) — self-removal from a role they
 *   hold on that team — with exactly one exception below.
 * - A Coach/Manager/Admin may Remove ANY row on the roster. Deliberately NO
 *   TIERING between Coach/Manager/Admin for this action, unlike some other
 *   capabilities in this file — the user was explicit that any of the
 *   three should be able to remove any of the others.
 * - EXCEPT: the team's very first Manager (the earliest `team_members` row
 *   with `role = 'manager'` for that team, by `created_at` — derived by the
 *   caller and passed in as `isFirstManager`, since "first Manager" isn't
 *   stored anywhere as its own flag) can only ever be removed by
 *   themselves. This is the one case where `hasEditAuthority` alone is not
 *   enough — self-removal still works even for the first Manager, since a
 *   person must always be able to remove themselves from a team, but no one
 *   else, however senior, can remove the first Manager on their behalf.
 *
 * This is a client-side convenience only — it decides whether to SHOW the
 * Remove control, never the actual authority to call the Edge Function. The
 * real gate lives server-side in `remove-team-member`, which independently
 * re-derives self-removal, Admin/Coach/Manager status, and first-Manager
 * protection under service role before deleting anything — see that
 * function's own header comment for why this can't safely be enforced by
 * RLS alone (a pre-existing, overly-broad `team_members` policy from
 * migration 036 already grants blanket access that a new, narrower policy
 * cannot take back, since Postgres OR's every applicable policy together).
 */
export function canRemoveTeamMember(input: {
  isOwnRow: boolean;
  hasEditAuthority: boolean;
  isFirstManager: boolean;
  teamType: TeamType;
}): boolean {
  if (input.teamType === 'external_league') {
    return false;
  }

  if (input.isFirstManager) {
    return input.isOwnRow;
  }

  return input.isOwnRow || input.hasEditAuthority;
}

/**
 * The minimal shape required to perform an active/inactive transition. Any
 * record carrying an identity and an `active` flag qualifies; the generic
 * parameter ensures all other fields are preserved unchanged.
 */
export interface ActivatableRecord {
  id: string;
  active: boolean;
}

/**
 * Mark a member inactive without deleting it (Req 4.6).
 *
 * Returns a new record with `active: false` while preserving the record's
 * identity and every other field, so the change is fully reversible via
 * {@link reactivateMember}. This is a pure transition — no hard delete.
 */
export function deactivateMember<T extends ActivatableRecord>(record: T): T {
  return { ...record, active: false };
}

/**
 * Reactivate an inactive member (Req 4.7).
 *
 * Returns a new record with `active: true` while preserving the record's
 * identity and every other field. Pure inverse of {@link deactivateMember}.
 */
export function reactivateMember<T extends ActivatableRecord>(record: T): T {
  return { ...record, active: true };
}
