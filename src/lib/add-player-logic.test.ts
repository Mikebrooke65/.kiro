/**
 * Unit + property tests for `add-player-logic.ts`.
 *
 * Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 2.2)
 *
 * Property 1: Add Player routing threshold
 * Validates: Requirements 1.5, 1.6, 2.1
 *
 * Run: npm test  (vitest --run, never watch mode)
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { ADULT_AGE_THRESHOLD, routeAddPlayer } from './add-player-logic';

describe('routeAddPlayer — Add Player routing threshold (Requirement 1.5/1.6, 2.1)', () => {
  const REFERENCE = new Date(2025, 5, 15); // 2025-06-15, fixed so tests are deterministic

  it('routes well over 16 to adult and well under 16 to junior', () => {
    expect(routeAddPlayer({ dateOfBirth: '2000-01-01', asOf: REFERENCE })).toBe('adult');
    expect(routeAddPlayer({ dateOfBirth: '2020-01-01', asOf: REFERENCE })).toBe('junior');
  });

  it('routes exactly-16-today to adult (the boundary)', () => {
    expect(routeAddPlayer({ dateOfBirth: '2009-06-15', asOf: REFERENCE })).toBe('adult');
  });

  it('routes one day before the 16th birthday to junior', () => {
    expect(routeAddPlayer({ dateOfBirth: '2009-06-16', asOf: REFERENCE })).toBe('junior');
  });

  it('routes one day after the 16th birthday to adult', () => {
    expect(routeAddPlayer({ dateOfBirth: '2009-06-14', asOf: REFERENCE })).toBe('adult');
  });

  it('routes an unparseable or malformed date of birth to junior, not a throw', () => {
    expect(routeAddPlayer({ dateOfBirth: 'not-a-date', asOf: REFERENCE })).toBe('junior');
    expect(routeAddPlayer({ dateOfBirth: '', asOf: REFERENCE })).toBe('junior');
    expect(routeAddPlayer({ dateOfBirth: '2009-13-40', asOf: REFERENCE })).toBe('junior');
  });

  it('defaults asOf to now when omitted', () => {
    // A date of birth 100 years ago routes to adult under any real-world "now".
    expect(routeAddPlayer({ dateOfBirth: '1900-01-01' })).toBe('adult');
  });

  // Property 1: Add Player routing threshold
  // Validates: Requirements 1.5, 1.6, 2.1
  it('Property 1: routes adult iff whole-years age >= ADULT_AGE_THRESHOLD, boundary inclusive', () => {
    const dobYear = fc.integer({ min: 1990, max: 2024 });
    const dobMonth = fc.integer({ min: 1, max: 12 });
    const dobDay = fc.integer({ min: 1, max: 28 }); // 28 avoids month-length edge cases

    fc.assert(
      fc.property(dobYear, dobMonth, dobDay, (year, month, day) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateOfBirth = `${year}-${pad(month)}-${pad(day)}`;

        let expectedAge = REFERENCE.getFullYear() - year;
        const hadBirthday =
          REFERENCE.getMonth() + 1 > month ||
          (REFERENCE.getMonth() + 1 === month && REFERENCE.getDate() >= day);
        if (!hadBirthday) expectedAge -= 1;

        const expectedRoute = expectedAge >= ADULT_AGE_THRESHOLD ? 'adult' : 'junior';
        expect(routeAddPlayer({ dateOfBirth, asOf: REFERENCE })).toBe(expectedRoute);
      }),
      { numRuns: 300 }
    );
  });
});
