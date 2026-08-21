/**
 * Property test for `resolveApprovalsTab`.
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

import { resolveApprovalsTab } from './main-layout-logic';

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
