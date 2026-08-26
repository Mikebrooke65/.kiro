/**
 * Unit + property tests for the pure decision helpers of the `redeem-invite`
 * Edge Function.
 *
 * Spec: `.kiro/specs/lite-user-registration-fix/` (task 3.5)
 *
 * Property 3 (Bug Condition): Pre-Confirmation Follows The Email Match
 * Property 4 (Bug Condition): No Orphan Or Partial State On Failure
 * Property 2 (Preservation): Non-Buggy Inputs Behave Identically
 *
 * **Validates: Requirements 2.3, 2.4, 2.7, 2.8**
 *
 * These import the REAL helpers from `./logic.ts` — no mirrors, no
 * reimplementation. That is the point: tasks 1 and 2 had to mirror the decision
 * branches because `src/lib/invites-api.ts` loads `src/lib/supabase.ts`, which
 * reads `import.meta.env` at module load. `logic.ts` imports nothing at all, so
 * it is importable by vitest (node) and by Deno alike. No adjustment to
 * `logic.ts` was needed to run these.
 *
 * Scope: pure logic only. The database-touching halves of Properties 3 and 4
 * (pre-confirmation actually applied by GoTrue, rollback actually deleting rows)
 * are verified by the integration scripts in tasks 4.1 and 4.2 — real RLS and
 * real GoTrue behaviour cannot be meaningfully faked here.
 *
 * Run: npm test  (vitest --run, never watch mode)
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  ADULT_AGE_THRESHOLD,
  classifyError,
  classifySelfDeclaredDateOfBirth,
  deriveInviteStatus,
  emailMatchesInvite,
  FORBIDDEN_ERROR_FRAGMENTS,
  INTENDED_ROLES,
  isAdult,
  MIN_PASSWORD_LENGTH,
  mapError,
  messageForInviteStatus,
  normalizeEmail,
  plannedCompensations,
  requiresTeamMembership,
  resolveAgeTickOutcome,
  resolveEffectiveRole,
  SAFE_ERROR_MESSAGE_LIST,
  SAFE_ERROR_MESSAGES,
  VALIDATION_MESSAGES,
  VALIDATION_PRECEDENCE,
  validateRequest,
  type AgeTickOutcome,
  type Compensation,
  type CreationLedger,
  type IntendedRole,
  type InviteStatus,
  type SafeErrorKey,
  type SelfDeclaredAgeBand,
  type ValidationReason,
} from './logic.ts';

// ---------------------------------------------------------------------------
// Shared fixtures / generators
// ---------------------------------------------------------------------------

const VALID_BODY = {
  code: 'ABCD1234',
  email: 'invited.manager@wcr-test.dev',
  password: 'hunter2!',
  first_name: 'Ada',
  last_name: 'Lovelace',
  privacy_consent: true,
} as const;

const EMAIL_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-'.split('');

/** A small pool of base addresses, so generated pairs collide often enough to
 *  exercise the "matches" branch as well as the "does not match" branch. */
const BASE_EMAIL_POOL = [
  'manager@wcr-test.dev',
  'player.one@wcr-test.dev',
  'MANAGER@WCR-TEST.DEV',
  'someone-else@wcr-test.dev',
];

const generatedEmail = fc
  .tuple(
    fc.array(fc.constantFrom(...EMAIL_CHARS), { minLength: 1, maxLength: 12 }),
    fc.constantFrom('wcr-test.dev', 'Test.ORG', 'mail.co.uk')
  )
  .map(([local, domain]) => `${local.join('')}@${domain}`);

const baseEmail = fc.oneof(fc.constantFrom(...BASE_EMAIL_POOL), generatedEmail);

const surroundingWhitespace = fc.constantFrom('', ' ', '  ', '\t', '\n', ' \t ', '\r\n');

/** Re-case a string per a repeating flag pattern, so case differences are
 *  scattered through the address rather than applied wholesale. */
function recase(value: string, flags: readonly boolean[]): string {
  if (flags.length === 0) return value;
  return value
    .split('')
    .map((ch, i) => (flags[i % flags.length] ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');
}

/** An address with random case and random surrounding whitespace — exactly the
 *  input shape Property 3's comparison rule has to survive. */
const decoratedEmail = fc
  .tuple(
    baseEmail,
    fc.array(fc.boolean(), { maxLength: 6 }),
    surroundingWhitespace,
    surroundingWhitespace
  )
  .map(([email, flags, before, after]) => `${before}${recase(email, flags)}${after}`);

// ---------------------------------------------------------------------------
// Unit tests — emailMatchesInvite (2.7, 2.8)
// ---------------------------------------------------------------------------

describe('emailMatchesInvite — the ownership proof that decides pre-confirmation', () => {
  it('matches an identical address', () => {
    expect(emailMatchesInvite('manager@wcr-test.dev', 'manager@wcr-test.dev')).toBe(true);
  });

  it('matches across case differences', () => {
    expect(emailMatchesInvite('Manager@WCR-Test.Dev', 'manager@wcr-test.dev')).toBe(true);
    expect(emailMatchesInvite('manager@wcr-test.dev', 'MANAGER@WCR-TEST.DEV')).toBe(true);
  });

  it('matches across leading and trailing whitespace on either side', () => {
    expect(emailMatchesInvite('  manager@wcr-test.dev  ', 'manager@wcr-test.dev')).toBe(true);
    expect(emailMatchesInvite('manager@wcr-test.dev', '\tmanager@wcr-test.dev\n')).toBe(true);
    expect(emailMatchesInvite(' MANAGER@wcr-test.dev ', ' manager@WCR-TEST.dev ')).toBe(true);
  });

  it('never matches when the invite has no recipient_email (2.8)', () => {
    expect(emailMatchesInvite('manager@wcr-test.dev', null)).toBe(false);
    expect(emailMatchesInvite('manager@wcr-test.dev', undefined)).toBe(false);
    expect(emailMatchesInvite('manager@wcr-test.dev', '')).toBe(false);
    expect(emailMatchesInvite('manager@wcr-test.dev', '   ')).toBe(false);
  });

  it('does not match a different address (2.8)', () => {
    expect(emailMatchesInvite('someone-else@wcr-test.dev', 'manager@wcr-test.dev')).toBe(false);
    // Near-misses must not match: a substring is not an address.
    expect(emailMatchesInvite('manager@wcr-test.dev.au', 'manager@wcr-test.dev')).toBe(false);
    expect(emailMatchesInvite('manager+alias@wcr-test.dev', 'manager@wcr-test.dev')).toBe(false);
  });

  it('never matches an empty or non-string submitted email', () => {
    expect(emailMatchesInvite('', 'manager@wcr-test.dev')).toBe(false);
    expect(emailMatchesInvite('   ', 'manager@wcr-test.dev')).toBe(false);
    expect(emailMatchesInvite(undefined, 'manager@wcr-test.dev')).toBe(false);
    expect(emailMatchesInvite(42, 'manager@wcr-test.dev')).toBe(false);
  });
});

describe('normalizeEmail — the one normalisation used everywhere', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Manager@WCR-Test.Dev \t')).toBe('manager@wcr-test.dev');
  });

  it('collapses non-string input to the empty string rather than throwing', () => {
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail({ email: 'x' })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — validateRequest (3.7)
// ---------------------------------------------------------------------------

describe('validateRequest — explicit accept or one specific rejection (3.7)', () => {
  it('accepts a complete body and normalises it once', () => {
    const result = validateRequest({
      ...VALID_BODY,
      code: '  ABCD1234 ',
      email: '  Invited.Manager@WCR-Test.Dev ',
      first_name: ' Ada ',
      last_name: ' Lovelace ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      code: 'ABCD1234',
      email: 'invited.manager@wcr-test.dev',
      password: 'hunter2!',
      first_name: 'Ada',
      last_name: 'Lovelace',
      privacy_consent: true,
      date_of_birth: null,
      subject_first_name: null,
      subject_last_name: null,
      subject_date_of_birth: null,
    });
  });

  it('normalises the subject (child) fields when present, and to null when absent (streamlined-invites-and-child-access Requirement 5.2/5.3)', () => {
    const withSubject = validateRequest({
      ...VALID_BODY,
      subject_first_name: '  Sam ',
      subject_last_name: ' Jones ',
      subject_date_of_birth: '  2016-01-01 ',
    });
    expect(withSubject.ok && withSubject.value.subject_first_name).toBe('Sam');
    expect(withSubject.ok && withSubject.value.subject_last_name).toBe('Jones');
    expect(withSubject.ok && withSubject.value.subject_date_of_birth).toBe('2016-01-01');

    const withoutSubject = validateRequest(VALID_BODY);
    expect(withoutSubject.ok && withoutSubject.value.subject_first_name).toBeNull();
    expect(withoutSubject.ok && withoutSubject.value.subject_last_name).toBeNull();
    expect(withoutSubject.ok && withoutSubject.value.subject_date_of_birth).toBeNull();
  });

  it('normalises date_of_birth when present, and to null when absent (add-player-and-dob-age-model)', () => {
    const withDob = validateRequest({ ...VALID_BODY, date_of_birth: '  2009-06-15 ' });
    expect(withDob.ok && withDob.value.date_of_birth).toBe('2009-06-15');

    const withoutDob = validateRequest(VALID_BODY);
    expect(withoutDob.ok && withoutDob.value.date_of_birth).toBeNull();

    const nonStringDob = validateRequest({ ...VALID_BODY, date_of_birth: 12345 });
    expect(nonStringDob.ok && nonStringDob.value.date_of_birth).toBeNull();
  });

  it('never rejects on a missing date_of_birth — that check is role-aware and lives in the handler', () => {
    // Confirms date_of_birth is deliberately absent from VALIDATION_PRECEDENCE:
    // validateRequest cannot know the invite's role, so it must not reject here.
    expect(validateRequest(VALID_BODY).ok).toBe(true);
    expect(VALIDATION_PRECEDENCE).not.toContain('missing_date_of_birth');
  });

  it('trims the code but does not case-fold it (the lookup is an exact match)', () => {
    const result = validateRequest({ ...VALID_BODY, code: ' aBcD1234 ' });
    expect(result.ok && result.value.code).toBe('aBcD1234');
  });

  it('uses the password verbatim — surrounding spaces are legitimate characters', () => {
    const result = validateRequest({ ...VALID_BODY, password: '  spaced  ' });
    expect(result.ok && result.value.password).toBe('  spaced  ');
  });

  const rejections: ReadonlyArray<[string, unknown, ValidationReason]> = [
    ['missing code', { ...VALID_BODY, code: undefined }, 'missing_code'],
    ['blank code', { ...VALID_BODY, code: '   ' }, 'missing_code'],
    ['no body at all', undefined, 'missing_code'],
    ['null body', null, 'missing_code'],
    ['consent false', { ...VALID_BODY, privacy_consent: false }, 'consent_required'],
    ['consent missing', { ...VALID_BODY, privacy_consent: undefined }, 'consent_required'],
    ['consent as the string "true"', { ...VALID_BODY, privacy_consent: 'true' }, 'consent_required'],
    ['missing first_name', { ...VALID_BODY, first_name: undefined }, 'missing_first_name'],
    ['blank first_name', { ...VALID_BODY, first_name: '  ' }, 'missing_first_name'],
    ['missing last_name', { ...VALID_BODY, last_name: undefined }, 'missing_last_name'],
    ['blank last_name', { ...VALID_BODY, last_name: '\t' }, 'missing_last_name'],
    ['missing email', { ...VALID_BODY, email: undefined }, 'missing_email'],
    ['blank email', { ...VALID_BODY, email: '   ' }, 'missing_email'],
    ['non-string email', { ...VALID_BODY, email: 12345 }, 'missing_email'],
    ['missing password', { ...VALID_BODY, password: undefined }, 'missing_password'],
    ['empty password', { ...VALID_BODY, password: '' }, 'missing_password'],
    ['non-string password', { ...VALID_BODY, password: 123456 }, 'missing_password'],
    ['password of 5 characters', { ...VALID_BODY, password: '12345' }, 'password_too_short'],
  ];

  it.each(rejections)('rejects %s with the %s reason and its existing message', (_label, body, reason) => {
    const result = validateRequest(body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(reason);
    expect(result.message).toBe(VALIDATION_MESSAGES[reason]);
  });

  it('accepts a password of exactly the minimum length', () => {
    const password = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(validateRequest({ ...VALID_BODY, password }).ok).toBe(true);
    expect(validateRequest({ ...VALID_BODY, password: password.slice(1) }).ok).toBe(false);
  });

  it('covers every declared rejection reason with at least one case', () => {
    const covered = new Set(rejections.map(([, , reason]) => reason));
    expect([...VALIDATION_PRECEDENCE].every((reason) => covered.has(reason))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — deriveInviteStatus (3.3)
// ---------------------------------------------------------------------------

describe('deriveInviteStatus — distinct statuses, preserved precedence (3.3)', () => {
  const now = new Date('2026-08-14T12:00:00.000Z');
  const future = '2026-09-14T12:00:00.000Z';
  const past = '2026-07-14T12:00:00.000Z';

  it('derives valid for an unredeemed, unexpired invite', () => {
    expect(deriveInviteStatus({ redeemed_by: null, expires_at: future }, now)).toBe('valid');
  });

  it('derives invalid when there is no row', () => {
    expect(deriveInviteStatus(null, now)).toBe('invalid');
    expect(deriveInviteStatus(undefined, now)).toBe('invalid');
  });

  it('derives redeemed when redeemed_by is set', () => {
    expect(deriveInviteStatus({ redeemed_by: 'user-1', expires_at: future }, now)).toBe('redeemed');
  });

  it('derives expired when expires_at is in the past', () => {
    expect(deriveInviteStatus({ redeemed_by: null, expires_at: past }, now)).toBe('expired');
  });

  it('puts redeemed ahead of expired, as the current code does', () => {
    expect(deriveInviteStatus({ redeemed_by: 'user-1', expires_at: past }, now)).toBe('redeemed');
  });

  it('treats a missing or unparseable expires_at as valid (recorded task 2 edge case)', () => {
    expect(deriveInviteStatus({ redeemed_by: null }, now)).toBe('valid');
    expect(deriveInviteStatus({ redeemed_by: null, expires_at: null }, now)).toBe('valid');
    expect(deriveInviteStatus({ redeemed_by: null, expires_at: 'not-a-date' }, now)).toBe('valid');
  });

  it('maps each status to its distinct landing-page message', () => {
    expect(messageForInviteStatus('invalid')).toBe(SAFE_ERROR_MESSAGES.invalid_code);
    expect(messageForInviteStatus('redeemed')).toBe(SAFE_ERROR_MESSAGES.redeemed_code);
    expect(messageForInviteStatus('expired')).toBe(SAFE_ERROR_MESSAGES.expired_code);
    // 'valid' is not an error state; it stays total rather than throwing.
    expect(SAFE_ERROR_MESSAGE_LIST).toContain(messageForInviteStatus('valid'));
  });
});

// ---------------------------------------------------------------------------
// Unit tests — mapError (2.4)
// ---------------------------------------------------------------------------

describe('mapError — every internal failure becomes plain language (2.4)', () => {
  const failures: ReadonlyArray<[string, unknown, SafeErrorKey]> = [
    [
      'the RLS failure this bugfix exists for',
      { message: 'new row violates row-level security policy for table "users"', code: '42501' },
      'unavailable',
    ],
    ['a permission denied error', 'permission denied for table users', 'unavailable'],
    ['a missing service_role env var', new Error('SUPABASE_SERVICE_ROLE_KEY is not set'), 'unavailable'],
    ['a network failure', { message: 'fetch failed' }, 'unavailable'],
    ['a gateway timeout', { message: 'upstream returned 503' }, 'unavailable'],
    ['an already-registered auth user', { message: 'User already registered' }, 'email_taken'],
    [
      'a duplicate key on the profile row',
      { message: 'duplicate key value violates unique constraint "users_email_key"', code: '23505' },
      'email_taken',
    ],
    ['a GoTrue email_exists code', { code: 'email_exists', message: '' }, 'email_taken'],
    ['the auth email quota', { message: 'email rate limit exceeded' }, 'rate_limited'],
    ['an HTTP 429', { message: 'Too many requests', status: 429 }, 'rate_limited'],
    ['a weak password', { message: 'Password should be at least 6 characters' }, 'weak_password'],
    [
      'a rejected address (reserved domain)',
      { message: 'Email address "wcr@example.com" is invalid', code: 'email_address_invalid' },
      'invalid_email',
    ],
    ['an already-used code', { message: 'This invite code has already been used' }, 'redeemed_code'],
    ['an expired code', { message: 'This invite code has expired' }, 'expired_code'],
    ['an unknown code', { message: 'Invalid invite code' }, 'invalid_code'],
    [
      'a team_members foreign key failure',
      {
        message:
          'insert or update on table "team_members" violates foreign key constraint "team_members_team_id_fkey"',
        code: '23503',
      },
      'team_unavailable',
    ],
    ['nothing at all', null, 'unknown'],
    ['an empty object', {}, 'unknown'],
    ['an unrecognised message', { message: 'something strange happened' }, 'unknown'],
  ];

  it.each(failures)('maps %s to the %s message', (_label, raw, key) => {
    expect(classifyError(raw)).toBe(key);
    expect(mapError(raw)).toBe(SAFE_ERROR_MESSAGES[key]);
  });

  it('covers every safe message key with at least one failure case', () => {
    const covered = new Set(failures.map(([, , key]) => key));
    const keys = Object.keys(SAFE_ERROR_MESSAGES) as SafeErrorKey[];
    // invalid_code / redeemed_code / expired_code also arrive via
    // messageForInviteStatus, but each is exercised through mapError here too.
    expect(keys.filter((key) => !covered.has(key))).toEqual([]);
  });

  it('leaks no raw database text for any of the mapped failures', () => {
    for (const [, raw] of failures) {
      const message = mapError(raw).toLowerCase();
      for (const fragment of FORBIDDEN_ERROR_FRAGMENTS) {
        expect(message).not.toContain(fragment);
      }
    }
  });

  it('reads message text out of nested error shapes without returning it', () => {
    const message = mapError({ error: { message: 'ignored' }, details: 'User already registered' });
    expect(message).toBe(SAFE_ERROR_MESSAGES.email_taken);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — plannedCompensations (2.3)
// ---------------------------------------------------------------------------

describe('plannedCompensations — reverse order, only this invocation (2.3)', () => {
  const fullLedger: CreationLedger = {
    authUser: { userId: 'u1', createdByThisInvocation: true },
    profileRow: { userId: 'u1', createdByThisInvocation: true },
    teamMember: { teamId: 't1', userId: 'u1', createdByThisInvocation: true },
  };

  it('undoes all three writes in reverse creation order', () => {
    expect(plannedCompensations(fullLedger)).toEqual([
      { action: 'delete_team_member', teamId: 't1', userId: 'u1' },
      { action: 'delete_profile_row', userId: 'u1' },
      { action: 'delete_auth_user', userId: 'u1' },
    ]);
  });

  it('never deletes an adopted orphan auth user', () => {
    expect(
      plannedCompensations({
        ...fullLedger,
        authUser: { userId: 'u1', createdByThisInvocation: false },
      })
    ).toEqual([
      { action: 'delete_team_member', teamId: 't1', userId: 'u1' },
      { action: 'delete_profile_row', userId: 'u1' },
    ]);
  });

  it('never deletes an existing user or their pre-existing membership (3.1, 3.2)', () => {
    expect(
      plannedCompensations({
        authUser: { userId: 'u1', createdByThisInvocation: false },
        profileRow: { userId: 'u1', createdByThisInvocation: false },
        teamMember: { teamId: 't1', userId: 'u1', createdByThisInvocation: false },
      })
    ).toEqual([]);
  });

  it('undoes only the membership when that was the sole new write', () => {
    expect(
      plannedCompensations({
        authUser: { userId: 'u1', createdByThisInvocation: false },
        profileRow: { userId: 'u1', createdByThisInvocation: false },
        teamMember: { teamId: 't1', userId: 'u1', createdByThisInvocation: true },
      })
    ).toEqual([{ action: 'delete_team_member', teamId: 't1', userId: 'u1' }]);
  });

  it('handles a failure before anything was created', () => {
    expect(plannedCompensations({})).toEqual([]);
    expect(plannedCompensations(null)).toEqual([]);
    expect(plannedCompensations(undefined)).toEqual([]);
    expect(
      plannedCompensations({ authUser: { userId: 'u1', createdByThisInvocation: true } })
    ).toEqual([{ action: 'delete_auth_user', userId: 'u1' }]);
  });
});

// ---------------------------------------------------------------------------
// Property 3 — Pre-Confirmation Follows The Email Match
// ---------------------------------------------------------------------------

describe('Property 3 (Bug Condition): Pre-Confirmation Follows The Email Match', () => {
  /**
   * **Validates: Requirements 2.7, 2.8**
   *
   * The rule that decides `email_confirm` is exactly
   * `lower(trim(a)) === lower(trim(b))` with a non-null recipient — nothing
   * else. If the comparison ever disagreed with that oracle, an account could be
   * pre-confirmed for an address the registrant never proved control of.
   */
  it('agrees with normalizeEmail(a) === normalizeEmail(b) for any case and whitespace', () => {
    fc.assert(
      fc.property(decoratedEmail, decoratedEmail, (submitted, recipient) => {
        const normalizedSubmitted = normalizeEmail(submitted);
        const normalizedRecipient = normalizeEmail(recipient);
        const oracle =
          normalizedSubmitted !== '' &&
          normalizedRecipient !== '' &&
          normalizedSubmitted === normalizedRecipient;

        expect(emailMatchesInvite(submitted, recipient)).toBe(oracle);
      }),
      { numRuns: 500 }
    );
  });

  it('always matches two differently decorated forms of the same address (2.7)', () => {
    fc.assert(
      fc.property(
        baseEmail,
        fc.array(fc.boolean(), { maxLength: 6 }),
        fc.array(fc.boolean(), { maxLength: 6 }),
        surroundingWhitespace,
        surroundingWhitespace,
        (email, flagsA, flagsB, before, after) => {
          const submitted = `${before}${recase(email, flagsA)}${after}`;
          const recipient = `${after}${recase(email, flagsB)}${before}`;
          expect(emailMatchesInvite(submitted, recipient)).toBe(true);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('never matches when the invite has no recipient_email, whatever was submitted (2.8)', () => {
    fc.assert(
      fc.property(
        decoratedEmail,
        fc.constantFrom<unknown>(null, undefined, '', '   ', '\t\n', 0, false, {}),
        (submitted, recipient) => {
          expect(emailMatchesInvite(submitted, recipient)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('is symmetric and reflexive, so the match cannot depend on argument order', () => {
    fc.assert(
      fc.property(decoratedEmail, decoratedEmail, (a, b) => {
        expect(emailMatchesInvite(a, b)).toBe(emailMatchesInvite(b, a));
        expect(emailMatchesInvite(a, a)).toBe(true);
      }),
      { numRuns: 300 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 — validation and status derivation are total
// ---------------------------------------------------------------------------

describe('Property 2 (Preservation): validation and status derivation are total', () => {
  /** Bodies that are plausible-but-wrong far more often than fc.anything() alone. */
  const arbitraryBody = fc.oneof(
    fc.anything(),
    fc.record(
      {
        code: fc.oneof(fc.string(), fc.constant(undefined), fc.integer(), fc.constant(null)),
        email: fc.oneof(decoratedEmail, fc.string(), fc.constant(undefined), fc.constant(null)),
        password: fc.oneof(
          fc.string({ maxLength: 12 }),
          fc.constant(undefined),
          fc.integer(),
          fc.constant(null)
        ),
        first_name: fc.oneof(fc.string({ maxLength: 8 }), fc.constant(undefined), fc.constant(null)),
        last_name: fc.oneof(fc.string({ maxLength: 8 }), fc.constant(undefined), fc.constant(null)),
        privacy_consent: fc.oneof(
          fc.boolean(),
          fc.constant(undefined),
          fc.constantFrom('true', 'false', 1, 0)
        ),
      },
      { requiredKeys: [] }
    )
  );

  /**
   * **Validates: Requirements 2.4, 3.7**
   *
   * Totality is what stops an unhandled input silently reclassifying a
   * preservation case — a crash or an unmapped fall-through in validation would
   * turn a non-bug input into a different outcome than the current form gives.
   */
  it('validateRequest always returns an explicit accept or one known rejection', () => {
    fc.assert(
      fc.property(arbitraryBody, (body) => {
        const result = validateRequest(body);

        if (result.ok) {
          // An accept is fully normalised and self-consistent.
          expect(result.value.code).toBe(result.value.code.trim());
          expect(result.value.code.length).toBeGreaterThan(0);
          expect(result.value.email).toBe(normalizeEmail(result.value.email));
          expect(result.value.email.length).toBeGreaterThan(0);
          expect(result.value.first_name.length).toBeGreaterThan(0);
          expect(result.value.last_name.length).toBeGreaterThan(0);
          expect(result.value.password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
          expect(result.value.privacy_consent).toBe(true);
          return;
        }

        expect(VALIDATION_PRECEDENCE).toContain(result.reason);
        expect(result.message).toBe(VALIDATION_MESSAGES[result.reason]);
        expect(typeof result.message).toBe('string');
        expect(result.message.length).toBeGreaterThan(0);
      }),
      { numRuns: 500 }
    );
  });

  it('validateRequest is deterministic — the same body always gets the same verdict', () => {
    fc.assert(
      fc.property(arbitraryBody, (body) => {
        expect(validateRequest(body)).toEqual(validateRequest(body));
      }),
      { numRuns: 200 }
    );
  });

  const arbitraryInvite = fc.record(
    {
      recipient_email: fc.oneof(decoratedEmail, fc.constant(null), fc.constant(undefined)),
      redeemed_by: fc.oneof(fc.uuid(), fc.constant(null), fc.constant(undefined), fc.constant('')),
      expires_at: fc.oneof(
        // `noInvalidDate` matters: fast-check's `fc.date()` can emit `Invalid Date`,
        // and `.toISOString()` then throws inside the generator — a seed-dependent
        // RangeError that aborts the run before the property body ever executes.
        // Unparseable strings are still covered, deliberately, by `constantFrom` below.
        fc
          .date({
            min: new Date('2020-01-01T00:00:00.000Z'),
            max: new Date('2032-01-01T00:00:00.000Z'),
            noInvalidDate: true,
          })
          .map((d) => d.toISOString()),
        fc.constantFrom('not-a-date', '', 'tomorrow'),
        fc.constant(null),
        fc.constant(undefined)
      ),
    },
    { requiredKeys: [] }
  );

  const allStatuses: readonly InviteStatus[] = ['valid', 'invalid', 'redeemed', 'expired'];

  /** **Validates: Requirements 2.4, 3.7** — the 3.3 statuses stay specific. */
  it('deriveInviteStatus is total and specific for any invite record (3.3)', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbitraryInvite, fc.constant(null), fc.constant(undefined)),
        // `now` must be a real instant too — an `Invalid Date` here would make every
        // comparison in the expectation below false and assert the wrong branch.
        fc.date({
          min: new Date('2020-01-01T00:00:00.000Z'),
          max: new Date('2032-01-01T00:00:00.000Z'),
          noInvalidDate: true,
        }),
        (invite, now) => {
          const status = deriveInviteStatus(invite, now);
          expect(allStatuses).toContain(status);

          // The precedence recorded in task 2 must hold for every input.
          if (!invite) {
            expect(status).toBe('invalid');
          } else if (invite.redeemed_by) {
            expect(status).toBe('redeemed');
          } else if (
            typeof invite.expires_at === 'string' &&
            Number.isFinite(Date.parse(invite.expires_at)) &&
            Date.parse(invite.expires_at) < now.getTime()
          ) {
            expect(status).toBe('expired');
          } else {
            expect(status).toBe('valid');
          }

          // Every status still resolves to a safe, non-empty message.
          expect(SAFE_ERROR_MESSAGE_LIST).toContain(messageForInviteStatus(status));
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 — No Orphan Or Partial State On Failure
// ---------------------------------------------------------------------------

describe('Property 4 (Bug Condition): error mapping never leaks raw database text', () => {
  const rawDatabaseText = fc.constantFrom(
    'new row violates row-level security policy for table "users"',
    'new row violates row-level security policy for table "team_members"',
    'permission denied for table users',
    'null value in column "cellphone" violates not-null constraint',
    'duplicate key value violates unique constraint "users_email_key"',
    'insert or update on table "team_members" violates foreign key constraint "team_members_team_id_fkey"',
    'policy "users_insert_own" for table "users" already exists',
    'ERROR:  42501: row level security policy check failed',
    'SQLSTATE 23505'
  );

  const arbitraryError = fc.oneof(
    fc.anything(),
    rawDatabaseText,
    fc.string(),
    fc.record(
      {
        message: fc.oneof(rawDatabaseText, fc.string()),
        code: fc.oneof(fc.constantFrom('42501', '23505', '23503', 'email_exists'), fc.string()),
        details: fc.oneof(rawDatabaseText, fc.string()),
        hint: fc.oneof(rawDatabaseText, fc.string()),
        error_description: fc.oneof(rawDatabaseText, fc.string()),
      },
      { requiredKeys: [] }
    ),
    rawDatabaseText.map((text) => new Error(text))
  );

  /**
   * **Validates: Requirements 2.4**
   *
   * The message shown to a registrant after a failed transaction must be drawn
   * from the known safe set, whatever the underlying failure carried. This is
   * the half of Property 4 that is checkable without a database.
   */
  it('every mapped message comes from the safe set and contains no forbidden fragment', () => {
    fc.assert(
      fc.property(arbitraryError, (raw) => {
        const message = mapError(raw);

        expect(SAFE_ERROR_MESSAGE_LIST).toContain(message);
        const lowered = message.toLowerCase();
        for (const fragment of FORBIDDEN_ERROR_FRAGMENTS) {
          expect(lowered).not.toContain(fragment);
        }
      }),
      { numRuns: 500 }
    );
  });

  it('never echoes the raw database text or a policy name back to the caller', () => {
    fc.assert(
      fc.property(rawDatabaseText, fc.constantFrom('message', 'details', 'hint'), (text, field) => {
        const message = mapError({ [field]: text });
        expect(SAFE_ERROR_MESSAGE_LIST).toContain(message);
        expect(message).not.toContain(text);
        expect(message).not.toContain('users_insert_own');
        expect(message).not.toContain('team_members');
      }),
      { numRuns: 200 }
    );
  });

  it('classifies every failure into a declared safe key', () => {
    const keys = new Set(Object.keys(SAFE_ERROR_MESSAGES));
    fc.assert(
      fc.property(arbitraryError, (raw) => {
        expect(keys.has(classifyError(raw))).toBe(true);
      }),
      { numRuns: 300 }
    );
  });
});

describe('Property 4 (Bug Condition): rollback undoes exactly what this invocation created', () => {
  /** Outcome of one write step in the transaction. */
  type StepOutcome = 'created' | 'reused' | 'failed';

  const stepOutcome = fc.constantFrom<StepOutcome>('created', 'reused', 'failed');

  const CREATED_USER = 'user-created-by-this-call';
  const EXISTING_USER = 'user-that-already-existed';
  const TEAM = 'team-from-the-invite';

  /**
   * Build the ledger the handler would hold, given how each of the three write
   * steps turned out. The first failure truncates the sequence — nothing after
   * it ever runs. Invite redemption is absent by design: it is the last write,
   * so there is nothing after it to fail.
   */
  function ledgerFor(steps: readonly StepOutcome[]): {
    ledger: CreationLedger;
    expected: Compensation[];
  } {
    const [authStep, profileStep, memberStep] = steps;
    const ledger: CreationLedger = {};
    const created: Compensation[] = [];

    if (authStep === 'failed') return { ledger, expected: [] };
    const userId = authStep === 'created' ? CREATED_USER : EXISTING_USER;
    ledger.authUser = { userId, createdByThisInvocation: authStep === 'created' };
    if (authStep === 'created') created.push({ action: 'delete_auth_user', userId });

    if (profileStep === 'failed') return { ledger, expected: created.reverse() };
    ledger.profileRow = { userId, createdByThisInvocation: profileStep === 'created' };
    if (profileStep === 'created') created.push({ action: 'delete_profile_row', userId });

    if (memberStep === 'failed') return { ledger, expected: created.reverse() };
    ledger.teamMember = { teamId: TEAM, userId, createdByThisInvocation: memberStep === 'created' };
    if (memberStep === 'created') {
      created.push({ action: 'delete_team_member', teamId: TEAM, userId });
    }

    return { ledger, expected: created.reverse() };
  }

  /**
   * **Validates: Requirements 2.3**
   *
   * Rollback exactness is what makes a retry clean and what keeps an existing
   * user's account safe when a later step fails.
   */
  it('compensates exactly the created records, in reverse order, for any step sequence', () => {
    fc.assert(
      fc.property(fc.tuple(stepOutcome, stepOutcome, stepOutcome), (steps) => {
        const { ledger, expected } = ledgerFor(steps);
        const compensations = plannedCompensations(ledger);

        expect(compensations).toEqual(expected);

        // Nothing pre-existing is ever targeted.
        if (ledger.authUser && !ledger.authUser.createdByThisInvocation) {
          expect(compensations.some((c) => c.action === 'delete_auth_user')).toBe(false);
        }
        if (ledger.profileRow && !ledger.profileRow.createdByThisInvocation) {
          expect(compensations.some((c) => c.action === 'delete_profile_row')).toBe(false);
        }
        if (ledger.teamMember && !ledger.teamMember.createdByThisInvocation) {
          expect(compensations.some((c) => c.action === 'delete_team_member')).toBe(false);
        }
        // An auth user this call did not create is never deleted. Checked per
        // action rather than per id, because a reused auth user's id legitimately
        // appears on a profile row or membership that THIS call inserted — the
        // records belong to the same person, but only the new ones are undone.
        for (const compensation of compensations) {
          if (compensation.action === 'delete_auth_user') {
            expect(compensation.userId).toBe(CREATED_USER);
          }
        }

        // Reverse creation order: membership, then profile, then auth user.
        const order = ['delete_team_member', 'delete_profile_row', 'delete_auth_user'];
        const positions = compensations.map((c) => order.indexOf(c.action));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        // No duplicates — a record is never deleted twice.
        expect(new Set(positions).size).toBe(positions.length);
      }),
      { numRuns: 300 }
    );
  });

  it('is idempotent as a plan — recomputing it yields the same list', () => {
    fc.assert(
      fc.property(fc.tuple(stepOutcome, stepOutcome, stepOutcome), (steps) => {
        const { ledger } = ledgerFor(steps);
        expect(plannedCompensations(ledger)).toEqual(plannedCompensations(ledger));
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// add-player-and-dob-age-model additions
// ---------------------------------------------------------------------------

describe('resolveEffectiveRole — degrades unknown values safely, extended set', () => {
  it('accepts each of the four valid roles unchanged', () => {
    for (const role of INTENDED_ROLES) {
      expect(resolveEffectiveRole(role)).toBe(role);
    }
  });

  it('degrades null, undefined, admin and arbitrary strings to player', () => {
    expect(resolveEffectiveRole(null)).toBe('player');
    expect(resolveEffectiveRole(undefined)).toBe('player');
    expect(resolveEffectiveRole('admin')).toBe('player');
    expect(resolveEffectiveRole('superuser')).toBe('player');
    expect(resolveEffectiveRole('')).toBe('player');
  });

  it('INTENDED_ROLES is exactly the four-member set this feature extends to', () => {
    expect([...INTENDED_ROLES].sort()).toEqual(['caregiver', 'coach', 'manager', 'player']);
  });

  // Property 8: intended_role still degrades unknown values safely
  // Validates: Requirements 5.1 (implicitly, via INTENDED_ROLES), and the
  // prior spec's Requirement 6.2-6.5 (regression guard)
  it('Property 8: returns the value when valid, else player — over the four-member set', () => {
    const validRole = fc.constantFrom(...INTENDED_ROLES);
    const arbitraryInput = fc.oneof(
      validRole,
      fc.constant(null),
      fc.constant(undefined),
      fc.constant('admin'),
      fc.string()
    );

    fc.assert(
      fc.property(arbitraryInput, (input) => {
        const result = resolveEffectiveRole(input as string | null | undefined);
        expect(INTENDED_ROLES).toContain(result);
        if (
          (typeof input === 'string' && (INTENDED_ROLES as readonly string[]).includes(input))
        ) {
          expect(result).toBe(input);
        } else {
          expect(result).toBe('player');
        }
      }),
      { numRuns: 300 }
    );
  });
});

describe('requiresTeamMembership — the one place caregiver is treated differently', () => {
  it('is false for caregiver and true for the other three roles', () => {
    expect(requiresTeamMembership('caregiver')).toBe(false);
    expect(requiresTeamMembership('player')).toBe(true);
    expect(requiresTeamMembership('coach')).toBe(true);
    expect(requiresTeamMembership('manager')).toBe(true);
  });

  // Property 9: requiresTeamMembership is the single source of the branch
  // Validates: Requirements 6.1, 6.2
  it('Property 9: returns false if and only if the role is caregiver', () => {
    fc.assert(
      fc.property(fc.constantFrom(...INTENDED_ROLES), (role: IntendedRole) => {
        expect(requiresTeamMembership(role)).toBe(role !== 'caregiver');
      }),
      { numRuns: 100 }
    );
  });
});

describe('isAdult — self-declared date-of-birth threshold (Requirement 3.4, 3.5)', () => {
  const REFERENCE = new Date(2025, 5, 15); // 2025-06-15, fixed so tests are deterministic

  it('is true well over the threshold and false well under it', () => {
    expect(isAdult('2000-01-01', REFERENCE)).toBe(true);
    expect(isAdult('2020-01-01', REFERENCE)).toBe(false);
  });

  it('classifies exactly-16-today as adult (the boundary)', () => {
    expect(isAdult('2009-06-15', REFERENCE)).toBe(true);
  });

  it('classifies one day before the 16th birthday as not-adult', () => {
    expect(isAdult('2009-06-16', REFERENCE)).toBe(false);
  });

  it('classifies one day after the 16th birthday as adult', () => {
    expect(isAdult('2009-06-14', REFERENCE)).toBe(true);
  });

  it('treats an unparseable or malformed date of birth as not-adult, not a throw', () => {
    expect(isAdult('not-a-date', REFERENCE)).toBe(false);
    expect(isAdult('', REFERENCE)).toBe(false);
    expect(isAdult('2009-13-40', REFERENCE)).toBe(false);
  });

  it('defaults asOf to now when omitted', () => {
    // A date of birth 100 years ago is adult under any real-world "now".
    expect(isAdult('1900-01-01')).toBe(true);
  });

  // Supports Property 3 (DOB mismatch is rejected, not reclassified) — this is
  // the pure-logic slice; the full rejection-with-no-writes behaviour is
  // covered by the redeem-invite integration tests (tasks.md 5.8).
  // Validates: Requirements 3.5
  it('boundary property: adult iff whole-years age >= ADULT_AGE_THRESHOLD', () => {
    const dobYear = fc.integer({ min: 1990, max: 2024 });
    const dobMonth = fc.integer({ min: 1, max: 12 });
    const dobDay = fc.integer({ min: 1, max: 28 }); // 28 avoids month-length edge cases

    fc.assert(
      fc.property(dobYear, dobMonth, dobDay, (year, month, day) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        const dob = `${year}-${pad(month)}-${pad(day)}`;

        let expectedAge = REFERENCE.getFullYear() - year;
        const hadBirthday =
          REFERENCE.getMonth() + 1 > month ||
          (REFERENCE.getMonth() + 1 === month && REFERENCE.getDate() >= day);
        if (!hadBirthday) expectedAge -= 1;

        expect(isAdult(dob, REFERENCE)).toBe(expectedAge >= ADULT_AGE_THRESHOLD);
      }),
      { numRuns: 300 }
    );
  });
});

describe('classifySelfDeclaredDateOfBirth — age band independent of any tick (streamlined-invites-and-child-access, task 3a)', () => {
  const REFERENCE = new Date(2025, 5, 15); // 2025-06-15, matches isAdult's fixtures above

  it('classifies well over 16 as adult and well under 16 as child', () => {
    expect(classifySelfDeclaredDateOfBirth('2000-01-01', REFERENCE)).toBe('adult');
    expect(classifySelfDeclaredDateOfBirth('2020-01-01', REFERENCE)).toBe('child');
  });

  it('classifies exactly-16-today as adult (the boundary)', () => {
    expect(classifySelfDeclaredDateOfBirth('2009-06-15', REFERENCE)).toBe('adult');
  });

  it('classifies one day before the 16th birthday as child', () => {
    expect(classifySelfDeclaredDateOfBirth('2009-06-16', REFERENCE)).toBe('child');
  });

  it('classifies an unparseable or malformed date as invalid, distinct from child', () => {
    const cases: string[] = ['not-a-date', '', '2009-13-40'];
    for (const dob of cases) {
      const band: SelfDeclaredAgeBand = classifySelfDeclaredDateOfBirth(dob, REFERENCE);
      expect(band).toBe('invalid');
    }
  });
});

describe('resolveAgeTickOutcome — symmetric validation + wrong-tick outcomes (streamlined-invites-and-child-access Requirement 5, 6, task 3a)', () => {
  const REFERENCE = new Date(2025, 5, 15);
  const ADULT_DOB = '2000-01-01'; // well over 16 as of REFERENCE
  const CHILD_DOB = '2015-01-01'; // well under 16 as of REFERENCE

  it('Adult-ticked role (player/coach/manager) + adult DOB → ok (Requirement 5.1)', () => {
    for (const role of ['player', 'coach', 'manager'] as const) {
      expect(resolveAgeTickOutcome(role, ADULT_DOB, REFERENCE)).toBe('ok');
    }
  });

  it('Adult-ticked role + child DOB → bounces to the Manager (Requirement 6.1, RESOLVED)', () => {
    const outcome: AgeTickOutcome = resolveAgeTickOutcome('player', CHILD_DOB, REFERENCE);
    expect(outcome).toBe('bounce_to_manager');
  });

  it('caregiver role (Child-ticked) + child DOB → ok (Requirement 5.2)', () => {
    expect(resolveAgeTickOutcome('caregiver', CHILD_DOB, REFERENCE)).toBe('ok');
  });

  it('caregiver role (Child-ticked) + adult DOB → converts in place to adult (Requirement 6.2, RESOLVED)', () => {
    expect(resolveAgeTickOutcome('caregiver', ADULT_DOB, REFERENCE)).toBe('convert_to_adult');
  });

  it('an unparseable DOB is always invalid_date_of_birth, regardless of role — never silently treated as a confirmed child', () => {
    for (const role of INTENDED_ROLES) {
      expect(resolveAgeTickOutcome(role, 'not-a-date', REFERENCE)).toBe('invalid_date_of_birth');
      expect(resolveAgeTickOutcome(role, '', REFERENCE)).toBe('invalid_date_of_birth');
    }
  });

  it('boundary property: matches classifySelfDeclaredDateOfBirth composed with the role direction', () => {
    const dobYear = fc.integer({ min: 1990, max: 2024 });
    const dobMonth = fc.integer({ min: 1, max: 12 });
    const dobDay = fc.integer({ min: 1, max: 28 });
    const role = fc.constantFrom(...INTENDED_ROLES);

    fc.assert(
      fc.property(dobYear, dobMonth, dobDay, role, (year, month, day, effectiveRole) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        const dob = `${year}-${pad(month)}-${pad(day)}`;
        const band = classifySelfDeclaredDateOfBirth(dob, REFERENCE);
        const outcome = resolveAgeTickOutcome(effectiveRole, dob, REFERENCE);

        if (effectiveRole === 'caregiver') {
          expect(outcome).toBe(band === 'child' ? 'ok' : 'convert_to_adult');
        } else {
          expect(outcome).toBe(band === 'adult' ? 'ok' : 'bounce_to_manager');
        }
      }),
      { numRuns: 300 }
    );
  });
});
