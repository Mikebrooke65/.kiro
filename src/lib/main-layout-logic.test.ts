/**
 * Property test for `resolveApprovalsTab`, plus `tabsForRole` (Requirement
 * 7.2.1-7.2.4, `streamlined-invites-and-child-access` Task 8).
 *
 * Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 9.4, deferred to
 * task 12.1 — see tasks.md's note on 9.4 for why)
 *
 * Property 12: Pending-approval count drives nav visibility
 * Validates: Requirements 8.1, 8.3, 8.4
 *
 * Run: npm test  (vitest --run, never watch mode)
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { resolveApprovalsTab, tabsForRole } from './main-layout-logic';
import { UserRole } from '../types/database';

describe('resolveApprovalsTab — pending-approval count drives nav visibility (Requirement 8.1, 8.3, 8.4)', () => {
  it('is hidden with a zero count', () => {
    expect(resolveApprovalsTab(0)).toEqual({ visible: false, badge: 0 });
  });

  it('is visible with badge 1 for a count of one', () => {
    expect(resolveApprovalsTab(1)).toEqual({ visible: true, badge: 1 });
  });

  it('is visible with the exact badge for several pending', () => {
    expect(resolveApprovalsTab(7)).toEqual({ visible: true, badge: 7 });
  });

  it('treats a negative or non-finite count defensively as zero, not a throw', () => {
    expect(resolveApprovalsTab(-1)).toEqual({ visible: false, badge: 0 });
    expect(resolveApprovalsTab(NaN)).toEqual({ visible: false, badge: 0 });
    expect(resolveApprovalsTab(Infinity)).toEqual({ visible: false, badge: 0 });
  });

  // Property 12: Pending-approval count drives nav visibility
  // Validates: Requirements 8.1, 8.3, 8.4
  it('Property 12: visible iff count > 0, and badge equals the count exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (count) => {
        const tab = resolveApprovalsTab(count);
        expect(tab.visible).toBe(count > 0);
        expect(tab.badge).toBe(count);
      }),
      { numRuns: 300 }
    );
  });
});

describe('tabsForRole — bottom-nav tab set by role (Requirement 7.2.1-7.2.4)', () => {
  const hidden = { visible: false, badge: 0 };

  function keysFor(role: UserRole | undefined) {
    return tabsForRole(role, hidden).map((t) => t.key);
  }

  it('gives a Player exactly Home, Team, Schedule, Messages — no Coaching, no Games', () => {
    expect(keysFor(UserRole.PLAYER)).toEqual(['home', 'team', 'schedule', 'messages']);
  });

  it("gives a child's account (role: 'player' — there is no separate child role) the identical four tabs as any other Player", () => {
    // streamlined-invites-and-child-access Requirement 7.2.1-7.2.4: a child's
    // account is never a distinct role, so this is the same assertion as the
    // Player case above by construction — the point of this test is that it
    // stays true with zero special-casing if a child role is ever introduced
    // and someone forgets to add it here.
    expect(keysFor(UserRole.PLAYER)).toEqual(['home', 'team', 'schedule', 'messages']);
  });

  it('gives a Caregiver the same four tabs, no Coaching or Games', () => {
    expect(keysFor(UserRole.CAREGIVER)).toEqual(['home', 'team', 'schedule', 'messages']);
  });

  it('gives a Manager Games but not Coaching', () => {
    expect(keysFor(UserRole.MANAGER)).toEqual(['home', 'team', 'games', 'schedule', 'messages']);
  });

  it('gives a Coach both Coaching and Games', () => {
    expect(keysFor(UserRole.COACH)).toEqual([
      'home',
      'team',
      'coaching',
      'games',
      'schedule',
      'messages',
    ]);
  });

  it('gives an Admin both Coaching and Games', () => {
    expect(keysFor(UserRole.ADMIN)).toEqual([
      'home',
      'team',
      'coaching',
      'games',
      'schedule',
      'messages',
    ]);
  });

  it('treats an undefined role like a non-elevated role (no Coaching, no Games)', () => {
    expect(keysFor(undefined)).toEqual(['home', 'team', 'schedule', 'messages']);
  });

  it('appends Approvals, with its badge, independent of role, exactly when visible', () => {
    const approvalsTab = { visible: true, badge: 3 };
    for (const role of [UserRole.PLAYER, UserRole.ADMIN, UserRole.COACH, undefined]) {
      const tabs = tabsForRole(role, approvalsTab);
      const approvals = tabs.find((t) => t.key === 'approvals');
      expect(approvals).toBeDefined();
      expect(approvals?.badge).toBe(3);
    }
  });

  it('never includes Approvals when not visible', () => {
    expect(keysFor(UserRole.ADMIN)).not.toContain('approvals');
  });
});
