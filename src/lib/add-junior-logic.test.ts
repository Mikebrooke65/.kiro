/**
 * Tests for `validateCaregiverContactFields` (Requirement 7.5,
 * `streamlined-invites-and-child-access` Task 9).
 *
 * No test file existed for `add-junior-logic.ts` before this — this file
 * covers only the function added for Task 9, not a retroactive pass over
 * `validateAddJunior`/`resolveCaregiver`/`resolveCaregiverLink`/
 * `assignChildProvenance`, which is out of this task's scope.
 *
 * Run: npm test  (vitest --run, never watch mode)
 */

import { describe, expect, it } from 'vitest';

import { validateCaregiverContactFields } from './add-junior-logic';

describe('validateCaregiverContactFields', () => {
  it('accepts a well-formed name, email, and phone', () => {
    expect(
      validateCaregiverContactFields({
        name: 'Pat Caregiver',
        email: 'pat@example.com',
        phone: '0400000000',
      })
    ).toEqual({ ok: true });
  });

  it('rejects an empty name', () => {
    const result = validateCaregiverContactFields({
      name: '',
      email: 'pat@example.com',
      phone: '0400000000',
    });
    expect(result).toEqual({ ok: false, errors: ['name'] });
  });

  it('rejects a name over 100 characters', () => {
    const result = validateCaregiverContactFields({
      name: 'a'.repeat(101),
      email: 'pat@example.com',
      phone: '0400000000',
    });
    expect(result).toEqual({ ok: false, errors: ['name'] });
  });

  it('rejects a malformed email', () => {
    const result = validateCaregiverContactFields({
      name: 'Pat Caregiver',
      email: 'not-an-email',
      phone: '0400000000',
    });
    expect(result).toEqual({ ok: false, errors: ['email'] });
  });

  it('rejects a phone shorter than 7 characters', () => {
    const result = validateCaregiverContactFields({
      name: 'Pat Caregiver',
      email: 'pat@example.com',
      phone: '12345',
    });
    expect(result).toEqual({ ok: false, errors: ['phone'] });
  });

  it('rejects a phone longer than 20 characters', () => {
    const result = validateCaregiverContactFields({
      name: 'Pat Caregiver',
      email: 'pat@example.com',
      phone: '1'.repeat(21),
    });
    expect(result).toEqual({ ok: false, errors: ['phone'] });
  });

  it('reports every invalid field at once, in stable order', () => {
    const result = validateCaregiverContactFields({ name: '', email: 'bad', phone: '1' });
    expect(result).toEqual({ ok: false, errors: ['name', 'email', 'phone'] });
  });

  it('trims whitespace before checking length bounds', () => {
    expect(
      validateCaregiverContactFields({
        name: '  Pat Caregiver  ',
        email: 'pat@example.com',
        phone: '  0400000000  ',
      })
    ).toEqual({ ok: true });
  });
});
