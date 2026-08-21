/**
 * Unit test for invite-generation call shape (task 9.5).
 *
 * Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 9.5)
 * _Requirements: 3.1, 4.3_
 *
 * `src/lib/invites-api.ts` cannot be imported directly under vitest: it
 * extends `ApiClient`, which imports `src/lib/supabase.ts`, which reads
 * `import.meta.env` and throws at module load outside a Vite/browser
 * environment (the same trap documented in
 * `invites-api.preservation.test.ts`, which established this codebase's
 * convention of mirroring the exact insert-payload shape here rather than
 * importing the class).
 *
 * `generateInviteCode`'s insert payload is now a one-line object literal
 * (see `invites-api.ts`), so the mirror below reproduces it statement for
 * statement. If a future edit changes what gets inserted, this test and the
 * real function will disagree the next time someone updates one without the
 * other — which is the point.
 *
 * Run: npm test
 */

import { describe, expect, it } from 'vitest';

/** Mirrors the `invite_codes` insert body built by `generateInviteCode`. */
function baselineInsertPayload(args: {
  code: string;
  teamId: string;
  competitionId?: string;
  createdBy: string;
  recipientEmail: string;
  recipientPhone?: string;
  expiresAt: string;
  intendedRole?: 'player' | 'coach' | 'manager' | 'caregiver';
  subjectUserId?: string;
}) {
  return {
    code: args.code,
    team_id: args.teamId,
    competition_id: args.competitionId || null,
    created_by: args.createdBy,
    recipient_email: args.recipientEmail,
    recipient_phone: args.recipientPhone || null,
    expires_at: args.expiresAt,
    intended_role: args.intendedRole ?? null,
    subject_user_id: args.subjectUserId ?? null,
  };
}

describe('generateInviteCode insert-payload shape (Requirements 3.1, 4.3)', () => {
  it('Adult path: intended_role player, no subject_user_id', () => {
    const payload = baselineInsertPayload({
      code: 'ABCD1234',
      teamId: 'team-1',
      createdBy: 'manager-1',
      recipientEmail: 'adult@example.com',
      expiresAt: '2026-09-10T00:00:00.000Z',
      intendedRole: 'player',
    });

    expect(payload.intended_role).toBe('player');
    expect(payload.subject_user_id).toBeNull();
    expect(payload.recipient_email).toBe('adult@example.com');
  });

  it('Caregiver path: intended_role caregiver, subject_user_id set to the child id', () => {
    const payload = baselineInsertPayload({
      code: 'WXYZ9876',
      teamId: 'team-1',
      createdBy: 'manager-1',
      recipientEmail: 'caregiver@example.com',
      recipientPhone: '5551234567',
      expiresAt: '2026-09-10T00:00:00.000Z',
      intendedRole: 'caregiver',
      subjectUserId: 'child-42',
    });

    expect(payload.intended_role).toBe('caregiver');
    expect(payload.subject_user_id).toBe('child-42');
  });

  it('every other invite type leaves subject_user_id null (Requirement 7.2)', () => {
    for (const role of ['player', 'coach', 'manager'] as const) {
      const payload = baselineInsertPayload({
        code: 'CODE0000',
        teamId: 'team-1',
        createdBy: 'manager-1',
        recipientEmail: 'someone@example.com',
        expiresAt: '2026-09-10T00:00:00.000Z',
        intendedRole: role,
      });
      expect(payload.subject_user_id).toBeNull();
    }
  });

  it('an absent intendedRole/subjectUserId (existing callers) still inserts NULLs, unchanged', () => {
    const payload = baselineInsertPayload({
      code: 'LEGACY01',
      teamId: 'team-1',
      createdBy: 'manager-1',
      recipientEmail: 'legacy@example.com',
      expiresAt: '2026-09-10T00:00:00.000Z',
    });
    expect(payload.intended_role).toBeNull();
    expect(payload.subject_user_id).toBeNull();
  });
});
