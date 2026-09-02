/**
 * Tests for `canAddCaregiver` (Requirement 7.5, `streamlined-invites-and-
 * child-access` Task 9).
 *
 * No test file existed for `permissions-logic.ts` before this — this file
 * covers only the function added for Task 9, not a retroactive pass over
 * `resolveCapabilities`/`canPromoteToManager`/`deactivateMember`/
 * `reactivateMember`, which is out of this task's scope.
 *
 * Run: npm test  (vitest --run, never watch mode)
 */

import { describe, expect, it } from 'vitest';

import {
  canAddCaregiver,
  canDemoteFromManager,
  canIssueDeviceAccess,
  canRemoveCoachFlag,
  canRemoveTeamMember,
} from './permissions-logic';

describe('canAddCaregiver — admin-only gate on a second-or-later caregiver (Requirement 7.5)', () => {
  it('lets a club Admin add a caregiver whether the child has none or several already', () => {
    expect(
      canAddCaregiver({
        isClubAdmin: true,
        teamRoles: [],
        teamType: 'club_tournament',
        existingCaregiverCount: 0,
      })
    ).toBe(true);

    expect(
      canAddCaregiver({
        isClubAdmin: true,
        teamRoles: [],
        teamType: 'club_tournament',
        existingCaregiverCount: 3,
      })
    ).toBe(true);
  });

  it("lets a Coach or Manager add the child's first caregiver", () => {
    expect(
      canAddCaregiver({
        isClubAdmin: false,
        teamRoles: ['coach'],
        teamType: 'club_tournament',
        existingCaregiverCount: 0,
      })
    ).toBe(true);

    expect(
      canAddCaregiver({
        isClubAdmin: false,
        teamRoles: ['manager'],
        teamType: 'club_tournament',
        existingCaregiverCount: 0,
      })
    ).toBe(true);
  });

  it('blocks a Coach or Manager from adding a second-or-later caregiver', () => {
    expect(
      canAddCaregiver({
        isClubAdmin: false,
        teamRoles: ['coach'],
        teamType: 'club_tournament',
        existingCaregiverCount: 1,
      })
    ).toBe(false);

    expect(
      canAddCaregiver({
        isClubAdmin: false,
        teamRoles: ['manager'],
        teamType: 'club_tournament',
        existingCaregiverCount: 2,
      })
    ).toBe(false);
  });

  it('blocks a Player or Caregiver regardless of existing caregiver count', () => {
    expect(
      canAddCaregiver({
        isClubAdmin: false,
        teamRoles: ['player'],
        teamType: 'club_tournament',
        existingCaregiverCount: 0,
      })
    ).toBe(false);

    expect(
      canAddCaregiver({
        isClubAdmin: false,
        teamRoles: ['caregiver'],
        teamType: 'club_tournament',
        existingCaregiverCount: 0,
      })
    ).toBe(false);
  });

  it('blocks everyone, including a club Admin, on an External League team (Req 4.3/5.17)', () => {
    expect(
      canAddCaregiver({
        isClubAdmin: true,
        teamRoles: [],
        teamType: 'external_league',
        existingCaregiverCount: 0,
      })
    ).toBe(false);

    expect(
      canAddCaregiver({
        isClubAdmin: false,
        teamRoles: ['coach', 'manager'],
        teamType: 'external_league',
        existingCaregiverCount: 0,
      })
    ).toBe(false);
  });

  it('treats a negative or non-finite existing count as "not zero" rather than throwing or defaulting to allowed', () => {
    expect(
      canAddCaregiver({
        isClubAdmin: false,
        teamRoles: ['manager'],
        teamType: 'club_tournament',
        existingCaregiverCount: -1,
      })
    ).toBe(false);

    expect(
      canAddCaregiver({
        isClubAdmin: false,
        teamRoles: ['manager'],
        teamType: 'club_tournament',
        existingCaregiverCount: NaN,
      })
    ).toBe(false);
  });

  it('a Coach who is also the club Admin is treated as Admin (order of checks does not matter here)', () => {
    expect(
      canAddCaregiver({
        isClubAdmin: true,
        teamRoles: ['coach'],
        teamType: 'club_tournament',
        existingCaregiverCount: 5,
      })
    ).toBe(true);
  });
});

describe('canIssueDeviceAccess — closes the caregiver-less-adult lockout gap (found 2026-08-31)', () => {
  it('lets a linked caregiver issue a device code, no other role needed', () => {
    expect(
      canIssueDeviceAccess({
        isClubAdmin: false,
        teamRoles: [],
        teamType: 'club_tournament',
        isLinkedCaregiver: true,
      })
    ).toBe(true);
  });

  it('lets a club Admin issue a device code even with no caregiver link', () => {
    expect(
      canIssueDeviceAccess({
        isClubAdmin: true,
        teamRoles: [],
        teamType: 'club_tournament',
        isLinkedCaregiver: false,
      })
    ).toBe(true);
  });

  it('lets a Coach or Manager on the team issue a device code even with no caregiver link', () => {
    expect(
      canIssueDeviceAccess({
        isClubAdmin: false,
        teamRoles: ['coach'],
        teamType: 'club_tournament',
        isLinkedCaregiver: false,
      })
    ).toBe(true);

    expect(
      canIssueDeviceAccess({
        isClubAdmin: false,
        teamRoles: ['manager'],
        teamType: 'club_tournament',
        isLinkedCaregiver: false,
      })
    ).toBe(true);
  });

  it('this is exactly the caregiver-less-adult case: no link, no role, no admin — blocked', () => {
    expect(
      canIssueDeviceAccess({
        isClubAdmin: false,
        teamRoles: ['player'],
        teamType: 'club_tournament',
        isLinkedCaregiver: false,
      })
    ).toBe(false);
  });

  it('External League teams stay read-only for everyone, even a linked caregiver or Admin', () => {
    expect(
      canIssueDeviceAccess({
        isClubAdmin: true,
        teamRoles: ['manager'],
        teamType: 'external_league',
        isLinkedCaregiver: true,
      })
    ).toBe(false);
  });
});

describe('canRemoveTeamMember — the "Remove" roster action (decided 2026-08-31, replacing Deactivate as the undo mechanism)', () => {
  it('lets anyone remove their own row, with no other authority required', () => {
    expect(
      canRemoveTeamMember({
        isOwnRow: true,
        hasEditAuthority: false,
        isFirstManager: false,
        teamType: 'club_tournament',
      })
    ).toBe(true);
  });

  it('lets a Coach/Manager/Admin (hasEditAuthority) remove someone else\'s row — no tiering between them', () => {
    expect(
      canRemoveTeamMember({
        isOwnRow: false,
        hasEditAuthority: true,
        isFirstManager: false,
        teamType: 'club_tournament',
      })
    ).toBe(true);
  });

  it('blocks a plain Player/Caregiver (no edit authority) from removing someone else', () => {
    expect(
      canRemoveTeamMember({
        isOwnRow: false,
        hasEditAuthority: false,
        isFirstManager: false,
        teamType: 'club_tournament',
      })
    ).toBe(false);
  });

  it("protects the team's first Manager from being removed by anyone else, even another Manager/Admin", () => {
    expect(
      canRemoveTeamMember({
        isOwnRow: false,
        hasEditAuthority: true,
        isFirstManager: true,
        teamType: 'club_tournament',
      })
    ).toBe(false);
  });

  it('still lets the first Manager remove themselves', () => {
    expect(
      canRemoveTeamMember({
        isOwnRow: true,
        hasEditAuthority: true,
        isFirstManager: true,
        teamType: 'club_tournament',
      })
    ).toBe(true);
  });

  it('blocks Remove entirely on External League teams, even self-removal or the combination that would otherwise allow it', () => {
    expect(
      canRemoveTeamMember({
        isOwnRow: true,
        hasEditAuthority: true,
        isFirstManager: false,
        teamType: 'external_league',
      })
    ).toBe(false);
  });
});

describe('canDemoteFromManager — V1.R Part 1 item B, deliberately mirrors canRemoveTeamMember', () => {
  it('lets anyone demote their own Manager/Coach row to Player, with no other authority required', () => {
    expect(
      canDemoteFromManager({
        isOwnRow: true,
        hasEditAuthority: false,
        isFirstManager: false,
        teamType: 'club_tournament',
      })
    ).toBe(true);
  });

  it('lets a Coach/Manager/Admin (hasEditAuthority) demote someone else — no tiering between them', () => {
    expect(
      canDemoteFromManager({
        isOwnRow: false,
        hasEditAuthority: true,
        isFirstManager: false,
        teamType: 'club_tournament',
      })
    ).toBe(true);
  });

  it('blocks a plain Player/Caregiver (no edit authority) from demoting someone else', () => {
    expect(
      canDemoteFromManager({
        isOwnRow: false,
        hasEditAuthority: false,
        isFirstManager: false,
        teamType: 'club_tournament',
      })
    ).toBe(false);
  });

  it("protects the team's first Manager from being demoted by anyone else, even another Manager/Admin — closes the Remove-protection loophole", () => {
    expect(
      canDemoteFromManager({
        isOwnRow: false,
        hasEditAuthority: true,
        isFirstManager: true,
        teamType: 'club_tournament',
      })
    ).toBe(false);
  });

  it('still lets the first Manager demote themselves', () => {
    expect(
      canDemoteFromManager({
        isOwnRow: true,
        hasEditAuthority: true,
        isFirstManager: true,
        teamType: 'club_tournament',
      })
    ).toBe(true);
  });

  it('blocks Demote entirely on External League teams', () => {
    expect(
      canDemoteFromManager({
        isOwnRow: true,
        hasEditAuthority: true,
        isFirstManager: false,
        teamType: 'external_league',
      })
    ).toBe(false);
  });
});

describe('canRemoveCoachFlag — V1.R Part 1 item C\'s inverse ("stop being Coach"), no first-Manager concept', () => {
  it('lets anyone turn off their own is_coach flag', () => {
    expect(
      canRemoveCoachFlag({
        isOwnRow: true,
        hasEditAuthority: false,
        teamType: 'club_tournament',
      })
    ).toBe(true);
  });

  it('lets a Coach/Manager/Admin (hasEditAuthority) turn off someone else\'s is_coach flag', () => {
    expect(
      canRemoveCoachFlag({
        isOwnRow: false,
        hasEditAuthority: true,
        teamType: 'club_tournament',
      })
    ).toBe(true);
  });

  it('blocks a plain Player/Caregiver (no edit authority) from removing someone else\'s Coach flag', () => {
    expect(
      canRemoveCoachFlag({
        isOwnRow: false,
        hasEditAuthority: false,
        teamType: 'club_tournament',
      })
    ).toBe(false);
  });

  it('blocks it entirely on External League teams, even self', () => {
    expect(
      canRemoveCoachFlag({
        isOwnRow: true,
        hasEditAuthority: true,
        teamType: 'external_league',
      })
    ).toBe(false);
  });
});
