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
