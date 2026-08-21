/**
 * Property test for `deriveAgeBandForPerson`.
 *
 * Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 6.4)
 *
 * Property 11: Age band prefers a personal date of birth
 * Validates: Requirements 2.2, 2.3, 2.5
 *
 * Run: npm test  (vitest --run, never watch mode)
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { deriveAgeBand, deriveAgeBandForPerson } from './roster-logic';

describe('deriveAgeBandForPerson — prefers a personal date of birth (Requirement 2.1-2.3, 2.5)', () => {
  it('uses the age_group fallback when no date of birth is recorded', () => {
    expect(deriveAgeBandForPerson(null, 'U17')).toBe(deriveAgeBand('U17'));
    expect(deriveAgeBandForPerson(undefined, 'U12')).toBe(deriveAgeBand('U12'));
    expect(deriveAgeBandForPerson('', 'Open')).toBe(deriveAgeBand('Open'));
  });

  it('uses the age_group fallback for an unparseable date of birth', () => {
    expect(deriveAgeBandForPerson('not-a-date', 'U17')).toBe(deriveAgeBand('U17'));
    expect(deriveAgeBandForPerson('2009-13-40', 'U9')).toBe(deriveAgeBand('U9'));
  });

  it('prefers the personal DOB even when it disagrees with age_group', () => {
    // A 20-year-old recorded on a U9 (child-band) team is adult by DOB.
    expect(deriveAgeBandForPerson('2000-01-01', 'U9')).toBe('adult');
    // A 10-year-old recorded on an Open (adult-band) team is child by DOB.
    expect(deriveAgeBandForPerson('2016-01-01', 'Open')).toBe('child');
  });

  it('mixes bands within the same roster, person by person (Req 2.5)', () => {
    const withDob = deriveAgeBandForPerson('2000-01-01', 'U9');
    const withoutDob = deriveAgeBandForPerson(null, 'U9');
    expect(withDob).toBe('adult');
    expect(withoutDob).toBe(deriveAgeBand('U9'));
    expect(withDob).not.toBe(withoutDob);
  });

  // Property 11: Age band prefers a personal date of birth
  // Validates: Requirements 2.2, 2.3, 2.5
  it('Property 11: returns the DOB-derived band when present, else exactly deriveAgeBand(ageGroup)', () => {
    const dobYear = fc.integer({ min: 1970, max: 2024 });
    const dobMonth = fc.integer({ min: 1, max: 12 });
    const dobDay = fc.integer({ min: 1, max: 28 });
    const ageGroup = fc.constantFrom('U9', 'U12', 'U16', 'U17', 'Open', '', 'not-a-grade');

    fc.assert(
      fc.property(
        fc.option(fc.tuple(dobYear, dobMonth, dobDay), { nil: null }),
        ageGroup,
        (dobParts, grp) => {
          if (dobParts === null) {
            expect(deriveAgeBandForPerson(null, grp)).toBe(deriveAgeBand(grp));
            return;
          }

          const [year, month, day] = dobParts;
          const pad = (n: number) => String(n).padStart(2, '0');
          const dob = `${year}-${pad(month)}-${pad(day)}`;

          const now = new Date();
          let expectedAge = now.getFullYear() - year;
          const hadBirthday =
            now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
          if (!hadBirthday) expectedAge -= 1;

          const expectedBand = expectedAge >= 16 ? 'adult' : 'child';
          expect(deriveAgeBandForPerson(dob, grp)).toBe(expectedBand);
        }
      ),
      { numRuns: 300 }
    );
  });
});
