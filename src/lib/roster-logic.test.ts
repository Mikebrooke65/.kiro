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

import { contactFor, deriveAgeBand, deriveAgeBandForPerson } from './roster-logic';
import type { CaregiverLink } from './roster-logic';

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

describe('contactFor — no viewer-role gate on contact details (Req 3.7, 3.8, 3.11; streamlined-invites-and-child-access Requirement 7.2)', () => {
  const CAREGIVER: CaregiverLink = {
    name: 'Pat Caregiver',
    cellphone: '0400000000',
    isPrimary: true,
    linkedAt: '2026-01-01T00:00:00Z',
  };

  it('shows an adult-band player their own cellphone', () => {
    expect(contactFor('adult', 'player', '0411111111', undefined)).toEqual({
      kind: 'self',
      cellphone: '0411111111',
    });
  });

  it("shows a child-band player — including a child's own account, which uses the identical 'player' team-role — their caregiver's contact, not their own", () => {
    expect(contactFor('child', 'player', '', [CAREGIVER])).toEqual({
      kind: 'caregiver',
      name: 'Pat Caregiver',
      cellphone: '0400000000',
    });
  });

  it('shows a child-band player with no linked caregiver a "missing" indication (Req 3.11)', () => {
    expect(contactFor('child', 'player', '', undefined)).toEqual({ kind: 'missing' });
  });

  it('shows a coach or manager their own cellphone even on a child-band team (adults, not routed through a caregiver)', () => {
    expect(contactFor('child', 'coach', '0422222222', undefined)).toEqual({
      kind: 'self',
      cellphone: '0422222222',
    });
    expect(contactFor('child', 'manager', '0433333333', [CAREGIVER])).toEqual({
      kind: 'self',
      cellphone: '0433333333',
    });
  });

  // This function takes no "viewer" parameter at all — deliberately. Every
  // team member who can load the roster already sees this exact same
  // contact for every row, regardless of their own role. There is no
  // "Manager/Coach-only" contact tier in this codebase to test the absence
  // of; this suite's own signature (no viewer argument, ever) is that
  // documentation. See the docstring on `contactFor` for the full context —
  // including why streamlined-invites-and-child-access/requirements.md
  // Section 7.2 describes a gate that doesn't exist, and why that doesn't
  // change what a child's account is allowed to see: it inherits exactly
  // this function's `'player'`-role behaviour, same as any adult Player.
});
