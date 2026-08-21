/**
 * Property test for `unionTeamAndCaregiverRecipients`.
 *
 * Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 7.3)
 *
 * Property 10: Whole-team messaging includes affiliated caregivers
 * Validates: Requirements 6.3
 *
 * Run: npm test  (vitest --run, never watch mode)
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { unionTeamAndCaregiverRecipients } from './messaging-logic';

describe('unionTeamAndCaregiverRecipients — whole_team includes affiliated caregivers (Requirement 6.3)', () => {
  it('unions team members and caregivers with no duplicates', () => {
    expect(unionTeamAndCaregiverRecipients(['a', 'b'], ['c', 'd'])).toEqual(
      expect.arrayContaining(['a', 'b', 'c', 'd'])
    );
    expect(unionTeamAndCaregiverRecipients(['a', 'b'], ['c', 'd'])).toHaveLength(4);
  });

  it('does not double-count a caregiver who is also independently a team_members row', () => {
    const result = unionTeamAndCaregiverRecipients(['a', 'b'], ['b', 'c']);
    expect(new Set(result).size).toBe(result.length);
    expect(result).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(result).toHaveLength(3);
  });

  it('handles empty inputs', () => {
    expect(unionTeamAndCaregiverRecipients([], [])).toEqual([]);
    expect(unionTeamAndCaregiverRecipients(['a'], [])).toEqual(['a']);
    expect(unionTeamAndCaregiverRecipients([], ['a'])).toEqual(['a']);
  });

  // Property 10: Whole-team messaging includes affiliated caregivers
  // Validates: Requirements 6.3
  it('Property 10: result equals the set union of both inputs, with no duplicates', () => {
    const idArb = fc.uuid();

    fc.assert(
      fc.property(
        fc.array(idArb, { maxLength: 20 }),
        fc.array(idArb, { maxLength: 20 }),
        (teamMemberIds, caregiverIds) => {
          const result = unionTeamAndCaregiverRecipients(teamMemberIds, caregiverIds);
          const expected = new Set([...teamMemberIds, ...caregiverIds]);

          // Equal as sets.
          expect(new Set(result)).toEqual(expected);
          // No duplicates in the result itself.
          expect(new Set(result).size).toBe(result.length);
          // Every team member and every caregiver is present.
          for (const id of teamMemberIds) expect(result).toContain(id);
          for (const id of caregiverIds) expect(result).toContain(id);
        }
      ),
      { numRuns: 300 }
    );
  });
});
