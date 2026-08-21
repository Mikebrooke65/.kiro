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

import {
  ADULT_AGE_THRESHOLD,
  routeAddPlayer,
  validateAddPlayerForm,
  type AddPlayerForm,
} from './add-player-logic';

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

describe('validateAddPlayerForm — per-field validation with route-specific fields (Requirement 1.2, 1.3, 1.6)', () => {
  const REFERENCE = new Date(2025, 5, 15); // 2025-06-15, matches the routing tests above

  const VALID_ADULT: AddPlayerForm = {
    firstName: 'Alex',
    lastName: 'Smith',
    dateOfBirth: '2000-01-01', // routes adult as of REFERENCE
    email: 'alex@example.com',
    caregiverName: '',
    caregiverEmail: '',
    caregiverPhone: '',
  };

  const VALID_JUNIOR: AddPlayerForm = {
    firstName: 'Sam',
    lastName: 'Jones',
    dateOfBirth: '2016-01-01', // routes junior as of REFERENCE
    email: '',
    caregiverName: 'Pat Jones',
    caregiverEmail: 'pat@example.com',
    caregiverPhone: '5551234567',
  };

  it('accepts a valid Adult-path submission', () => {
    expect(validateAddPlayerForm(VALID_ADULT, 'adult', REFERENCE)).toEqual({ ok: true });
  });

  it('accepts a valid Junior-path submission', () => {
    expect(validateAddPlayerForm(VALID_JUNIOR, 'junior', REFERENCE)).toEqual({ ok: true });
  });

  it('rejects a missing first/last name on either path', () => {
    const result = validateAddPlayerForm({ ...VALID_ADULT, firstName: '' }, 'adult', REFERENCE);
    expect(result).toEqual({ ok: false, errors: ['firstName'] });
  });

  it('rejects an empty, malformed, or future date of birth', () => {
    expect(
      validateAddPlayerForm({ ...VALID_ADULT, dateOfBirth: '' }, 'adult', REFERENCE)
    ).toEqual({ ok: false, errors: ['dateOfBirth'] });
    expect(
      validateAddPlayerForm({ ...VALID_ADULT, dateOfBirth: '2025-13-40' }, 'adult', REFERENCE)
    ).toEqual({ ok: false, errors: ['dateOfBirth'] });
    expect(
      validateAddPlayerForm({ ...VALID_ADULT, dateOfBirth: '2025-06-16' }, 'adult', REFERENCE)
    ).toEqual({ ok: false, errors: ['dateOfBirth'] });
  });

  it('accepts a date of birth of exactly today', () => {
    expect(
      validateAddPlayerForm({ ...VALID_ADULT, dateOfBirth: '2025-06-15' }, 'adult', REFERENCE)
    ).toEqual({ ok: true });
  });

  it('Adult path: requires a valid email and ignores caregiver fields (Req 1.4/1.5)', () => {
    expect(
      validateAddPlayerForm({ ...VALID_ADULT, email: 'not-an-email' }, 'adult', REFERENCE)
    ).toEqual({ ok: false, errors: ['email'] });
    // Caregiver fields left blank must not fail an Adult-path submission.
    expect(
      validateAddPlayerForm(
        { ...VALID_ADULT, caregiverName: '', caregiverEmail: '', caregiverPhone: '' },
        'adult',
        REFERENCE
      )
    ).toEqual({ ok: true });
  });

  it('Junior path: requires the caregiver fields and ignores email (Req 1.4/1.6)', () => {
    expect(
      validateAddPlayerForm({ ...VALID_JUNIOR, caregiverEmail: 'nope' }, 'junior', REFERENCE)
    ).toEqual({ ok: false, errors: ['caregiverEmail'] });
    // The unused Adult-path email field left blank must not fail a Junior submission.
    expect(
      validateAddPlayerForm({ ...VALID_JUNIOR, email: '' }, 'junior', REFERENCE)
    ).toEqual({ ok: true });
  });

  it('reports every invalid field at once, in the documented stable order', () => {
    const result = validateAddPlayerForm(
      { ...VALID_ADULT, firstName: '', lastName: '', dateOfBirth: '', email: '' },
      'adult',
      REFERENCE
    );
    expect(result).toEqual({
      ok: false,
      errors: ['firstName', 'lastName', 'dateOfBirth', 'email'],
    });
  });
});
