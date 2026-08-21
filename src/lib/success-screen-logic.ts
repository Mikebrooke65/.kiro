// Pure logic for the post-registration Success Screen.
//
// Spec: `.kiro/specs/post-registration-welcome-and-team-page/` (task 2.1)
//
// These helpers are deliberately free of React and Supabase so the Success
// Screen's branching, greeting, and team-label rules can be unit- and
// property-tested in isolation (design "Success Screen" component interface).
//
// CLUB-AGNOSTIC: nothing here hardcodes a club name, colour, logo, or URL.
// Branding is supplied to the component from `useClubBranding()`; this module
// only shapes the copy that surrounds it.

import type { Team, User } from '../types/database';

/**
 * The shape the Success Screen consumes from `invites-api` — a thin echo of the
 * `redeem-invite` Edge Function response. Every field is optional because the
 * two registration paths (and the generic fallback) each populate a different
 * subset, and the helpers below must cope with any of them.
 *
 * - `email_confirmed` — matching-address path: the account is live, log in now.
 * - `email_confirmation_required` — non-matching path: check email to confirm.
 * - Neither present — generic "registration complete, please log in" fallback.
 */
export interface RedeemInviteResult {
  success?: boolean;
  user?: User | null;
  team?: Team | null;
  email_confirmed?: boolean;
  email_confirmation_required?: boolean;
  /**
   * Non-matching path only: whether the confirmation email could actually be
   * sent. `false` is the "confirmation required but not sent" signal (Req 2.9),
   * which the Success Screen surfaces as a "your email may be delayed" note.
   */
  confirmation_email_sent?: boolean;
  /** Optional competition name associated with the invite (Req 1.3 / 1.10). */
  competition_name?: string | null;
}

/** Which of the three Success Screen layouts to render. */
export type WelcomeVariant = 'matching' | 'confirmation_required' | 'generic';

/**
 * Decide which welcome layout the Success Screen should render from the
 * `redeem-invite` response (Req 1.1, 1.6, 1.8).
 *
 * Precedence matches the design flowchart: a confirmed account wins, then the
 * confirmation-required gate, then the generic fallback. `email_confirmed` is
 * checked first so a response that (unexpectedly) carries both flags still
 * resolves to the live-account experience rather than sending a confirmed user
 * to check their email.
 */
export function selectWelcomeVariant(result: RedeemInviteResult): WelcomeVariant {
  if (result?.email_confirmed === true) return 'matching';
  if (result?.email_confirmation_required === true) return 'confirmation_required';
  return 'generic';
}

/**
 * Build the welcome greeting, tolerating an absent first name (Req 1.9).
 *
 * A non-empty name (after trimming) is included: `Welcome, Sam!`. A null,
 * empty, or whitespace-only name falls back to a generic `Welcome!` with no
 * empty placeholder and no dangling comma or separator.
 */
export function buildGreeting(firstName: string | null | undefined): string {
  const trimmed = typeof firstName === 'string' ? firstName.trim() : '';
  return trimmed === '' ? 'Welcome!' : `Welcome, ${trimmed}!`;
}

/**
 * Format a team label as `{age_group} {name}` per the project standard
 * (Req 1.2), or return null when no team is available so the caller can omit
 * the element rather than render an empty label.
 */
export function formatTeamLabel(
  team: { age_group: string; name: string } | null,
): string | null {
  if (!team) return null;
  return `${team.age_group} ${team.name}`;
}

// ---------------------------------------------------------------------------
// Adult self-declaration at redemption
// `.kiro/specs/add-player-and-dob-age-model/` Requirement 3.4, task 11
// ---------------------------------------------------------------------------

/**
 * Whether the redemption form must collect the invitee's own date of birth
 * (Requirement 3.4). Every intended role except `caregiver` self-declares —
 * mirrors `requiresTeamMembership`/the DOB check in
 * `redeem-invite/logic.ts`'s step 2b: `effectiveRole !== 'caregiver'`. A
 * null/absent/unrecognized `intended_role` defaults to `player` server-side
 * (`resolveEffectiveRole`), which also needs it, so this treats anything
 * other than the literal `'caregiver'` string as needing the step — the same
 * outcome as importing that resolution, without a client importing Edge
 * Function code across the `supabase/functions/` boundary.
 */
export function needsAdultSelfDeclaration(intendedRole: string | null | undefined): boolean {
  return intendedRole !== 'caregiver';
}

/**
 * True when `value` is a real `yyyy-mm-dd` calendar date, not in the future
 * as of `asOf`. Client-side form hygiene only — whether it indicates 16 or
 * over is enforced server-side (Requirement 3.5), not duplicated here.
 */
export function isValidDateOfBirth(value: string, asOf: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return false;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  const check = new Date(year, month - 1, day);
  const isRealCalendarDate =
    check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day;

  return isRealCalendarDate && check.getTime() <= asOf.getTime();
}
