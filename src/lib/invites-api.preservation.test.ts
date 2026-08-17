/**
 * Preservation tests — lite user registration RLS fix
 * Spec: .kiro/specs/lite-user-registration-fix/ (task 2)
 *
 * Property 2 (Preservation): Non-Buggy Inputs Behave Identically
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.7, 3.8**
 *
 * These tests capture the behaviour of the CURRENT (unfixed) code for inputs
 * where `isBugCondition(X)` is false, so that task 3.8 can prove the Edge
 * Function fix changed none of it. They MUST pass on unfixed code.
 *
 * Method: observation first. Every assertion below was run against the unfixed
 * implementation before being written down, and the database-touching cases live
 * in `scripts/preserve-lite-registration.ts` because their outcome depends on
 * real RLS and real GoTrue behaviour.
 *
 * Why some logic is still mirrored rather than imported: `src/lib/invites-api.ts`
 * imports `src/lib/supabase.ts`, which reads `import.meta.env` and performs I/O
 * on module load, so those decision branches cannot be exercised in isolation.
 * The mirrors below reproduce the current branches statement for statement (see
 * the line references in each comment).
 *
 * ── TASK 3.8 UPDATE — mirrors replaced where a real helper now exists ───────
 * Task 3.1 extracted `supabase/functions/redeem-invite/logic.ts`, so the invite
 * status mirror is gone: `baselineInviteStatus()` is now a one-line adapter over
 * the real `deriveInviteStatus()`. Every assertion below is unchanged — the
 * point of the swap is that the shipped helper, not a copy of it, has to satisfy
 * the recorded baseline.
 *
 * Still mirrored, because there is no importable counterpart:
 *   - `baselineClientValidation` / `BASELINE_VALIDATION_MESSAGES` and
 *     `BASELINE_ERROR_COPY` — client-side code in `src/pages/LiteLandingPage.tsx`
 *     (the form's branch order and the error card titles). `validateRequest` and
 *     `messageForInviteStatus` in `logic.ts` are the server-side counterparts
 *     with a different shape, not the same function.
 *   - `baselineUsersInsertPayload`, `baselineUserResolution`,
 *     `baselineShouldInsertTeamMember` — these decisions live inline in
 *     `supabase/functions/redeem-invite/index.ts`, which imports Deno APIs and
 *     `npm:@supabase/supabase-js`, so it cannot be imported here. They are
 *     covered end-to-end instead by the live tests at the bottom of this file.
 *   - `baselineTeamLabel` — a render-time expression in `LiteLandingPage`.
 *
 * ── BASELINE DEVIATION (recorded deliberately, not an accident) ─────────────
 * Task 1 exploration confirmed the design's baseline caveat: a raw `anon` SELECT
 * on `public.users` for an email that definitely has a row returns
 * `rows=0, error=none`. No policy grants `anon` SELECT on that table and RLS
 * filters silently instead of erroring. So in the live anon flow
 * `existingUser` is ALWAYS null and requirements 3.1 and 3.2 are NOT behaviour
 * the current code gets right — they are a second latent defect that moving the
 * lookup server-side under `service_role` will fix.
 *
 * Consequence for this file:
 *   - The pure decision logic for 3.1 / 3.2 is asserted as DOCUMENTED INTENT
 *     (`describe('3.1 / 3.2 — documented intent ...')`). It passes today because
 *     the branches themselves are correct.
 *   - A further deviation from the same root cause turned up while recording
 *     this baseline: nothing grants `anon` SELECT on `teams`, so the
 *     `team:teams(*)` embed in `validateInviteCode()` comes back null and the
 *     invite page heading and success screen render "undefined undefined" for an
 *     anonymous visitor. The 3.8 tests below therefore assert the format
 *     expression itself (which is correct and must not change); the visibility
 *     problem is recorded by scripts/preserve-lite-registration.ts and is NOT
 *     addressed by the designed fix, since `validateInviteCode()` stays
 *     client-side and anonymous.
 *   - The end-to-end claims of 3.1 / 3.2 were marked `it.skip` with
 *     `DOCUMENTED INTENT (deviation on unfixed code)` in the name. **Task 3.8
 *     re-enabled them**: they now run live against the deployed `redeem-invite`
 *     Edge Function, where the lookups happen under `service_role`. Deviation 5
 *     (the `teams` embed) was closed by migration 045, which
 *     `scripts/verify-anon-team-embed.ts` and the 3.6 check in
 *     `scripts/preserve-lite-registration.ts` both confirm.
 *
 * Run: npm test
 *
 * NOTE: the final describe block touches the real project (throwaway addresses,
 * cleaned up on every exit path, auth-user deletion guarded to the fixture
 * pattern). It skips itself if the Supabase env vars are absent.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The real shipped helper, imported instead of mirrored (task 3.8).
import {
  deriveInviteStatus,
  type InviteStatus,
} from '../../supabase/functions/redeem-invite/logic.ts';

// ---------------------------------------------------------------------------
// Mirrors of the current implementation's pure decision logic
// ---------------------------------------------------------------------------

/** Shape of an `invite_codes` row as `validateInviteCode()` reads it. */
interface InviteRecord {
  id: string;
  code: string;
  team_id: string;
  created_by: string;
  recipient_email: string | null;
  redeemed_by: string | null;
  expires_at: string;
}

/**
 * The status derivation `validateInviteCode()` performs client-side and
 * `redeem-invite` re-derives server-side: row missing → 'invalid';
 * `redeemed_by` set → 'redeemed'; `expires_at` in the past → 'expired';
 * otherwise 'valid'. `row === null` stands for the `error || !data` branch
 * (no such code).
 *
 * Task 3.8: this was a mirror of `src/lib/invites-api.ts`. It now delegates to
 * the real `deriveInviteStatus()` from
 * `supabase/functions/redeem-invite/logic.ts`, so the assertions below hold the
 * shipped helper to the baseline recorded in task 2 rather than a copy of it.
 * The adapter exists only to keep the call sites — and therefore the
 * assertions — byte-identical.
 */
function baselineInviteStatus(row: InviteRecord | null, now: Date): InviteStatus {
  return deriveInviteStatus(row, now);
}

/**
 * Mirror of the `errorMessages` lookup in `LiteLandingPage`
 * (src/pages/LiteLandingPage.tsx): the distinct message shown for each
 * non-valid status. Returns `undefined` for anything not in the map, exactly as
 * the current index access does.
 */
const BASELINE_ERROR_COPY: Record<string, { title: string; message: string }> = {
  expired: {
    title: 'Code Expired',
    message: 'This code has expired. Your coach/manager has been notified and can send you a new one.',
  },
  redeemed: {
    title: 'Already Used',
    message: 'This invite code has already been used.',
  },
  invalid: {
    title: 'Invalid Code',
    message: 'This invite code is not valid. Please check the link and try again.',
  },
};

function baselineErrorCopy(error?: string | null): { title: string; message: string } | undefined {
  return BASELINE_ERROR_COPY[error || 'invalid'];
}

/** Form state as `LiteLandingPage` holds it. */
interface RegistrationForm {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  consent: boolean;
}

type ClientValidation =
  | { ok: true }
  | { ok: false; message: string; networkCallMade: false };

/**
 * Mirror of `handleSubmit()`'s client-side validation in `LiteLandingPage`,
 * including branch order. Each rejection returns before `redeemInviteCode()` is
 * called, which is what "blocked before any network call" (3.7) means.
 */
function baselineClientValidation(form: RegistrationForm): ClientValidation {
  if (!form.consent) {
    return { ok: false, message: 'You must accept the privacy notice to continue.', networkCallMade: false };
  }
  if (!form.first_name || !form.last_name || !form.email || !form.password) {
    return { ok: false, message: 'All fields are required.', networkCallMade: false };
  }
  if (form.password.length < 6) {
    return { ok: false, message: 'Password must be at least 6 characters.', networkCallMade: false };
  }
  return { ok: true };
}

const BASELINE_VALIDATION_MESSAGES = [
  'You must accept the privacy notice to continue.',
  'All fields are required.',
  'Password must be at least 6 characters.',
];

/**
 * Mirror of the `users` insert payload built by `redeemInviteCode()`. The only
 * part that is a decision is `privacy_consent_at` (3.5); the rest are the fixed
 * values that must survive the move server-side.
 */
function baselineUsersInsertPayload(
  userId: string,
  userData: { email: string; first_name: string; last_name: string; privacy_consent: boolean },
  now: Date
) {
  return {
    id: userId,
    email: userData.email,
    first_name: userData.first_name,
    last_name: userData.last_name,
    cellphone: '',
    role: 'player',
    user_type: 'lite',
    active: true,
    privacy_consent_at: userData.privacy_consent ? now.toISOString() : null,
  };
}

/**
 * Mirror of the user-resolution branch in `redeemInviteCode()`: an existing
 * `public.users` row is used as-is and no account is created (3.1).
 */
function baselineUserResolution(existingUser: { id: string } | null): 'use_existing' | 'create_auth_user' {
  return existingUser ? 'use_existing' : 'create_auth_user';
}

/**
 * Mirror of the membership branch in `redeemInviteCode()`: the insert is skipped
 * when a `team_members` row already exists, so no duplicate is created (3.2).
 */
function baselineShouldInsertTeamMember(existingMember: { id: string } | null): boolean {
  return !existingMember;
}

/** Project standard team display format (3.8). */
function baselineTeamLabel(team: { age_group?: string | null; name?: string | null }): string {
  return `${team.age_group} ${team.name}`;
}

// ---------------------------------------------------------------------------
// Generators — constrained to the input space that actually reaches this logic
// ---------------------------------------------------------------------------

const uuidish = fc.uuid();

/** Dates within ±2 years of now, so `expires_at` is always parseable. */
const nearDate = fc
  .integer({ min: -730 * 24 * 60, max: 730 * 24 * 60 })
  .map((minutes) => new Date(Date.now() + minutes * 60_000));

const inviteRecordArb = fc
  .record({
    id: uuidish,
    code: fc.stringMatching(/^[A-Z2-9]{8}$/),
    team_id: uuidish,
    created_by: uuidish,
    recipient_email: fc.option(fc.emailAddress(), { nil: null }),
    redeemed_by: fc.option(uuidish, { nil: null }),
    expires: nearDate,
  })
  .map(({ expires, ...rest }): InviteRecord => ({ ...rest, expires_at: expires.toISOString() }));

const formArb = fc.record({
  first_name: fc.oneof(fc.constant(''), fc.string({ maxLength: 20 })),
  last_name: fc.oneof(fc.constant(''), fc.string({ maxLength: 20 })),
  email: fc.oneof(fc.constant(''), fc.emailAddress()),
  password: fc.oneof(fc.constant(''), fc.string({ maxLength: 12 })),
  consent: fc.boolean(),
});

// ---------------------------------------------------------------------------
// 3.3 — invite status derivation is total and specific
// ---------------------------------------------------------------------------

describe('3.3 invite code status derivation (baseline, must not change)', () => {
  it('derives valid for an unredeemed, unexpired code', () => {
    const now = new Date('2026-08-14T00:00:00.000Z');
    const status = baselineInviteStatus(
      {
        id: 'i1',
        code: 'ABCD2345',
        team_id: 't1',
        created_by: 'u1',
        recipient_email: 'invitee@example.test',
        redeemed_by: null,
        expires_at: '2026-09-04T00:00:00.000Z',
      },
      now
    );
    expect(status).toBe('valid');
  });

  it('derives redeemed when redeemed_by is set', () => {
    const now = new Date('2026-08-14T00:00:00.000Z');
    expect(
      baselineInviteStatus(
        {
          id: 'i2',
          code: 'ABCD2346',
          team_id: 't1',
          created_by: 'u1',
          recipient_email: null,
          redeemed_by: 'u9',
          expires_at: '2026-09-04T00:00:00.000Z',
        },
        now
      )
    ).toBe('redeemed');
  });

  it('derives expired when expires_at is in the past', () => {
    const now = new Date('2026-08-14T00:00:00.000Z');
    expect(
      baselineInviteStatus(
        {
          id: 'i3',
          code: 'ABCD2347',
          team_id: 't1',
          created_by: 'u1',
          recipient_email: null,
          redeemed_by: null,
          expires_at: '2026-08-13T00:00:00.000Z',
        },
        now
      )
    ).toBe('expired');
  });

  it('derives invalid when no row exists for the code', () => {
    expect(baselineInviteStatus(null, new Date())).toBe('invalid');
  });

  it('records the baseline for an unparseable expires_at: treated as valid, never a crash', () => {
    // Observed on unfixed code: `new Date('not-a-date') < now` is false, so the
    // expiry branch is skipped and the code is treated as valid. Recorded so a
    // change in this edge behaviour shows up as a test failure rather than a
    // silent difference.
    expect(
      baselineInviteStatus(
        {
          id: 'i4',
          code: 'ABCD2348',
          team_id: 't1',
          created_by: 'u1',
          recipient_email: null,
          redeemed_by: null,
          expires_at: 'not-a-date',
        },
        new Date()
      )
    ).toBe('valid');
  });

  it('PROPERTY: status derivation is total and specific for any invite record', () => {
    fc.assert(
      fc.property(fc.option(inviteRecordArb, { nil: null }), nearDate, (row, now) => {
        const status = baselineInviteStatus(row, now);

        // Total: always one of the four known statuses, never a crash and never
        // an unmapped fall-through.
        expect(['valid', 'invalid', 'redeemed', 'expired']).toContain(status);

        // Specific: each status is exactly the documented condition, in the
        // documented precedence order.
        if (row === null) {
          expect(status).toBe('invalid');
        } else if (row.redeemed_by) {
          expect(status).toBe('redeemed');
        } else if (new Date(row.expires_at) < now) {
          expect(status).toBe('expired');
        } else {
          expect(status).toBe('valid');
        }
      }),
      { numRuns: 500 }
    );
  });

  it('PROPERTY: every non-valid status maps to its own distinct landing-page message', () => {
    fc.assert(
      fc.property(fc.option(inviteRecordArb, { nil: null }), nearDate, (row, now) => {
        const status = baselineInviteStatus(row, now);
        if (status === 'valid') return;

        const copy = baselineErrorCopy(status);
        expect(copy).toBeDefined();
        expect(copy!.title).toBe(
          status === 'expired' ? 'Code Expired' : status === 'redeemed' ? 'Already Used' : 'Invalid Code'
        );
        // Distinct: no two statuses share a title.
        const titles = new Set(Object.values(BASELINE_ERROR_COPY).map((c) => c.title));
        expect(titles.size).toBe(3);
      }),
      { numRuns: 500 }
    );
  });

  it('falls back to the Invalid Code copy when no status is set', () => {
    expect(baselineErrorCopy(undefined)?.title).toBe('Invalid Code');
    expect(baselineErrorCopy(null)?.title).toBe('Invalid Code');
    expect(baselineErrorCopy('')?.title).toBe('Invalid Code');
  });
});

// ---------------------------------------------------------------------------
// 3.5 — privacy consent capture
// ---------------------------------------------------------------------------

describe('3.5 privacy_consent_at capture (baseline, must not change)', () => {
  it('PROPERTY: consent decides privacy_consent_at, and the rest of the payload is fixed', () => {
    fc.assert(
      fc.property(
        uuidish,
        fc.record({
          email: fc.emailAddress(),
          first_name: fc.string({ minLength: 1, maxLength: 20 }),
          last_name: fc.string({ minLength: 1, maxLength: 20 }),
          privacy_consent: fc.boolean(),
        }),
        nearDate,
        (userId, userData, now) => {
          const payload = baselineUsersInsertPayload(userId, userData, now);

          if (userData.privacy_consent) {
            expect(payload.privacy_consent_at).toBe(now.toISOString());
            expect(Number.isNaN(Date.parse(payload.privacy_consent_at!))).toBe(false);
          } else {
            expect(payload.privacy_consent_at).toBeNull();
          }

          expect(payload.user_type).toBe('lite');
          expect(payload.role).toBe('player');
          expect(payload.active).toBe(true);
          expect(payload.cellphone).toBe('');
          expect(payload.email).toBe(userData.email);
        }
      ),
      { numRuns: 300 }
    );
  });
});

// ---------------------------------------------------------------------------
// 3.7 — client-side validation
// ---------------------------------------------------------------------------

describe('3.7 client-side form validation (baseline, must not change)', () => {
  it('blocks an unticked consent box with the existing message', () => {
    const r = baselineClientValidation({
      first_name: 'A',
      last_name: 'B',
      email: 'a@b.test',
      password: 'secret1',
      consent: false,
    });
    expect(r).toEqual({
      ok: false,
      message: 'You must accept the privacy notice to continue.',
      networkCallMade: false,
    });
  });

  it('blocks missing fields with the existing message', () => {
    for (const missing of ['first_name', 'last_name', 'email', 'password'] as const) {
      const form: RegistrationForm = {
        first_name: 'A',
        last_name: 'B',
        email: 'a@b.test',
        password: 'secret1',
        consent: true,
      };
      (form as any)[missing] = '';
      const r = baselineClientValidation(form);
      expect(r.ok).toBe(false);
      expect((r as any).message).toBe('All fields are required.');
    }
  });

  it('blocks a password shorter than 6 characters with the existing message', () => {
    const r = baselineClientValidation({
      first_name: 'A',
      last_name: 'B',
      email: 'a@b.test',
      password: '12345',
      consent: true,
    });
    expect(r.ok).toBe(false);
    expect((r as any).message).toBe('Password must be at least 6 characters.');
  });

  it('accepts a complete form with consent and a 6+ character password', () => {
    expect(
      baselineClientValidation({
        first_name: 'A',
        last_name: 'B',
        email: 'a@b.test',
        password: '123456',
        consent: true,
      })
    ).toEqual({ ok: true });
  });

  it('PROPERTY: validation is total, uses only the existing messages, and rejects before any network call', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const r = baselineClientValidation(form);

        if (!r.ok) {
          expect(BASELINE_VALIDATION_MESSAGES).toContain(r.message);
          expect(r.networkCallMade).toBe(false);
        }

        // Specific: acceptance holds exactly when every documented condition is met.
        const shouldAccept =
          form.consent &&
          !!form.first_name &&
          !!form.last_name &&
          !!form.email &&
          !!form.password &&
          form.password.length >= 6;
        expect(r.ok).toBe(shouldAccept);
      }),
      { numRuns: 500 }
    );
  });

  it('PROPERTY: consent is checked before missing fields (branch order preserved)', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const r = baselineClientValidation({ ...form, consent: false });
        expect(r.ok).toBe(false);
        expect((r as any).message).toBe('You must accept the privacy notice to continue.');
      }),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// 3.8 — team name format
// ---------------------------------------------------------------------------

describe('3.8 team name format (baseline, must not change)', () => {
  it('renders a team as "{age_group} {name}"', () => {
    expect(baselineTeamLabel({ age_group: 'Open', name: 'Bozos' })).toBe('Open Bozos');
    expect(baselineTeamLabel({ age_group: 'U9', name: 'Lithium' })).toBe('U9 Lithium');
  });

  it('PROPERTY: the label is always the age group, a space, then the name', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim() === s && s.length > 0),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() === s && s.length > 0),
        (ageGroup, name) => {
          const label = baselineTeamLabel({ age_group: ageGroup, name });
          expect(label).toBe(`${ageGroup} ${name}`);
          expect(label.startsWith(ageGroup)).toBe(true);
          expect(label).not.toBe(name);
        }
      ),
      { numRuns: 300 }
    );
  });
});

// ---------------------------------------------------------------------------
// 3.1 / 3.2 — documented intent, with the baseline deviation recorded
// ---------------------------------------------------------------------------

describe('3.1 / 3.2 — documented intent (see BASELINE DEVIATION at the top of this file)', () => {
  it('resolves an existing users row without creating an account (3.1, decision level)', () => {
    expect(baselineUserResolution({ id: 'existing-1' })).toBe('use_existing');
  });

  it('creates an auth user only when there is no existing users row (3.1, decision level)', () => {
    expect(baselineUserResolution(null)).toBe('create_auth_user');
  });

  it('skips the team_members insert when a membership already exists (3.2, decision level)', () => {
    expect(baselineShouldInsertTeamMember({ id: 'tm-1' })).toBe(false);
  });

  it('inserts a team_members row only when no membership exists (3.2, decision level)', () => {
    expect(baselineShouldInsertTeamMember(null)).toBe(true);
  });

  it('PROPERTY: resolution and membership decisions are total for any lookup outcome', () => {
    fc.assert(
      fc.property(
        fc.option(fc.record({ id: uuidish }), { nil: null }),
        fc.option(fc.record({ id: uuidish }), { nil: null }),
        (existingUser, existingMember) => {
          expect(['use_existing', 'create_auth_user']).toContain(baselineUserResolution(existingUser));
          expect(typeof baselineShouldInsertTeamMember(existingMember)).toBe('boolean');
          // No account creation whenever a user row was found.
          if (existingUser) expect(baselineUserResolution(existingUser)).toBe('use_existing');
          // No duplicate membership whenever a membership was found.
          if (existingMember) expect(baselineShouldInsertTeamMember(existingMember)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  // The two end-to-end claims of 3.1 and 3.2 used to sit here as `it.skip`
  // named `DOCUMENTED INTENT (deviation on unfixed code)`. Task 3.8 re-enabled
  // them; they now live in the final describe block, driven through the deployed
  // `redeem-invite` Edge Function where both lookups run under `service_role`.
});

// ---------------------------------------------------------------------------
// 3.1 / 3.2 live — the two DOCUMENTED INTENT skips, re-enabled in task 3.8
// ---------------------------------------------------------------------------
//
// These are the end-to-end claims task 2 could not assert: on unfixed code the
// `anon` existing-user and membership lookups returned rows=0 even when the rows
// existed, so `existingUser` was always null. The fix moved both lookups into
// `redeem-invite` under `service_role`, so they are now real behaviour and are
// driven through the deployed function exactly as the browser drives it — anon
// key, no user session.
//
// Deviation 3 (`privacy_consent_at` could never be persisted by the anon client)
// is re-checked inside the 3.1 test: the registrant created in its first step is
// created by the Edge Function, so the consent timestamp on that row is the
// evidence. No separate test was added for it.
//
// Throwaway address only; every fixture is removed in `afterAll`; auth-user
// deletion is guarded to the `wcr-preserve-` + `@mailinator.com` pattern so it
// cannot touch a real account. `email_confirm` is true for these invites (the
// submitted email matches `recipient_email`), so no confirmation email is sent
// and the project's auth email quota is not touched.

const PROJECT_ROOT = resolve(process.cwd());

/** Same loader the tsx scripts use — vitest does not read .env files itself. */
function loadEnvFile(file: string): void {
  const path = resolve(PROJECT_ROOT, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.development');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const LIVE_READY = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

const TEST_EMAIL_PREFIX = 'wcr-preserve-';
const TEST_EMAIL_DOMAIN = '@mailinator.com'; // Supabase Auth rejects RFC-2606 domains
const FIXTURE_PASSWORD = 'PreserveTask38!2026';

function isThrowawayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e.startsWith(TEST_EMAIL_PREFIX) && e.endsWith(TEST_EMAIL_DOMAIN);
}

function throwawayCode(label: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rest = '';
  for (let i = 0; i < 5; i++) rest += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${label}${rest}`.slice(0, 8);
}

interface TeamRow {
  id: string;
  name: string;
  age_group: string;
}

describe.skipIf(!LIVE_READY)(
  '3.1 / 3.2 live through redeem-invite (re-enabled in task 3.8)',
  () => {
    /** The role a real invite-link visitor has: anon key, no session. */
    let anon: SupabaseClient;
    /** Fixtures, inspection and cleanup only. Never the behaviour under test. */
    let admin: SupabaseClient;

    const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const registrantEmail = `${TEST_EMAIL_PREFIX}38-${runId}@mailinator.com`;

    let teamA: TeamRow;
    let teamB: TeamRow;
    let codeA = '';
    let codeB = '';
    let codeC = '';
    const createdInviteIds: string[] = [];

    /** Set by the 3.1 test's first step; the 3.2 test reuses it. */
    let registrantId: string | null = null;
    let consentAtAfterRegistration: string | null = null;

    async function invokeRedeem(code: string) {
      return anon.functions.invoke('redeem-invite', {
        body: {
          code,
          email: registrantEmail,
          password: FIXTURE_PASSWORD,
          first_name: 'Preserve',
          last_name: 'Task38',
          privacy_consent: true,
        },
      });
    }

    async function authUsersForFixtureEmail(): Promise<Array<{ id: string; email: string }>> {
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(registrantEmail)}`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      if (!res.ok) return [];
      const body = await res.json();
      return (body.users ?? []).filter(
        (u: { email?: string }) => (u.email ?? '').toLowerCase() === registrantEmail.toLowerCase()
      );
    }

    async function membershipsFor(userId: string): Promise<string[]> {
      const { data } = await admin.from('team_members').select('team_id').eq('user_id', userId);
      return (data ?? []).map((r) => r.team_id as string);
    }

    beforeAll(async () => {
      anon = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      admin = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: teams, error: teamErr } = await admin
        .from('teams')
        .select('id, name, age_group')
        .not('age_group', 'is', null)
        .limit(5);
      if (teamErr || !teams || teams.length < 2) {
        throw new Error(`Need two teams for fixtures: ${teamErr?.message ?? `got ${teams?.length ?? 0}`}`);
      }
      teamA = teams[0] as TeamRow;
      teamB = teams[1] as TeamRow;

      const { data: creator, error: creatorErr } = await admin
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();
      if (creatorErr || !creator) {
        throw new Error(`No admin user for invite.created_by: ${creatorErr?.message ?? 'none found'}`);
      }

      codeA = throwawayCode('P');
      codeB = throwawayCode('Q');
      codeC = throwawayCode('R');
      const inFuture = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

      const { data: invites, error: inviteErr } = await admin
        .from('invite_codes')
        .insert(
          [
            { code: codeA, team_id: teamA.id },
            { code: codeB, team_id: teamB.id },
            { code: codeC, team_id: teamB.id },
          ].map((r) => ({
            ...r,
            created_by: creator.id,
            recipient_email: registrantEmail,
            expires_at: inFuture,
            redeemed_by: null,
            redeemed_at: null,
          }))
        )
        .select('id');
      if (inviteErr || !invites) throw new Error(`Could not create fixture invites: ${inviteErr?.message}`);
      for (const i of invites) createdInviteIds.push(i.id as string);
    }, 120_000);

    afterAll(async () => {
      if (!admin) return;
      const { data: rows } = await admin
        .from('users')
        .select('id, email')
        .eq('email', registrantEmail);
      for (const row of rows ?? []) {
        if (!isThrowawayEmail(row.email)) continue;
        await admin.from('team_members').delete().eq('user_id', row.id);
        await admin.from('invite_codes').update({ redeemed_by: null, redeemed_at: null }).eq('redeemed_by', row.id);
        await admin.from('users').delete().eq('id', row.id);
      }
      if (createdInviteIds.length) {
        await admin.from('invite_codes').delete().in('id', createdInviteIds);
      }
      for (const authUser of await authUsersForFixtureEmail()) {
        // Guard: nothing is deleted unless it is unmistakably this run's fixture.
        if (!isThrowawayEmail(authUser.email)) continue;
        await admin.auth.admin.deleteUser(authUser.id);
      }
    }, 120_000);

    it(
      'RE-ENABLED (was DOCUMENTED INTENT): an existing user gains only a membership and is returned (3.1)',
      async () => {
        // Step 1 — become an existing user, server-side. This is also the
        // deviation-3 re-check: the consent timestamp is now persisted.
        const first = await invokeRedeem(codeA);
        expect(first.error).toBeNull();
        expect(first.data?.success).toBe(true);

        const { data: afterFirst } = await admin.from('users').select('*').eq('email', registrantEmail);
        expect(afterFirst?.length).toBe(1);
        registrantId = afterFirst![0].id as string;
        expect(afterFirst![0].user_type).toBe('lite');
        expect(afterFirst![0].role).toBe('player');
        expect(afterFirst![0].privacy_consent_at).not.toBeNull();
        consentAtAfterRegistration = afterFirst![0].privacy_consent_at as string;
        expect(await membershipsFor(registrantId)).toEqual([teamA.id]);

        // Step 2 — the same person redeems a code for a DIFFERENT team. This is
        // the 3.1 claim: the existing account is reused, nothing is created but
        // the membership, and the existing user is returned.
        const second = await invokeRedeem(codeB);
        expect(second.error).toBeNull();
        expect(second.data?.success).toBe(true);
        expect(second.data?.user?.id).toBe(registrantId);

        // No second account, of either kind.
        const authUsers = await authUsersForFixtureEmail();
        expect(authUsers.length).toBe(1);
        expect(authUsers[0].id).toBe(registrantId);

        const { data: afterSecond } = await admin.from('users').select('*').eq('email', registrantEmail);
        expect(afterSecond?.length).toBe(1);
        expect(afterSecond![0].id).toBe(registrantId);
        // The existing row is used as-is: consent timestamp not rewritten.
        expect(afterSecond![0].privacy_consent_at).toBe(consentAtAfterRegistration);

        // Membership gained, and only that.
        const memberships = await membershipsFor(registrantId!);
        expect(memberships.length).toBe(2);
        expect([...memberships].sort()).toEqual([teamA.id, teamB.id].sort());

        const { data: redeemedB } = await admin
          .from('invite_codes')
          .select('redeemed_by, redeemed_at')
          .eq('code', codeB)
          .single();
        expect(redeemedB?.redeemed_by).toBe(registrantId);
        expect(redeemedB?.redeemed_at).not.toBeNull();
      },
      180_000
    );

    it(
      'RE-ENABLED (was DOCUMENTED INTENT): a user already in the team gets no duplicate team_members row (3.2)',
      async () => {
        expect(registrantId, 'depends on the 3.1 test above having registered the fixture user').not.toBeNull();

        // A third code, for the team the user is ALREADY in after the 3.1 test.
        const third = await invokeRedeem(codeC);
        expect(third.error).toBeNull();
        expect(third.data?.success).toBe(true);
        expect(third.data?.user?.id).toBe(registrantId);

        const { data: dupCheck } = await admin
          .from('team_members')
          .select('id')
          .eq('team_id', teamB.id)
          .eq('user_id', registrantId!);
        expect(dupCheck?.length).toBe(1);

        // And nothing else grew either.
        expect((await membershipsFor(registrantId!)).length).toBe(2);
        const authUsers = await authUsersForFixtureEmail();
        expect(authUsers.length).toBe(1);

        const { data: redeemedC } = await admin
          .from('invite_codes')
          .select('redeemed_by')
          .eq('code', codeC)
          .single();
        expect(redeemedC?.redeemed_by).toBe(registrantId);
      },
      180_000
    );
  }
);
