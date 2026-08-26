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
  /**
   * Set only for a Caregiver-invite redemption: whether a pending
   * `caregiver_approvals` row already exists for the invite's subject child.
   * Redeeming the invite never auto-approves it (Requirement 4.7) — this
   * flag is how the client knows to route the registrant straight to it
   * instead of the app root (Requirement 8.2).
   * `.kiro/specs/add-player-and-dob-age-model/` Requirement 8.2, Task 5.7.
   */
  has_pending_approval?: boolean;
  /**
   * `.kiro/specs/streamlined-invites-and-child-access/` Requirement 6.2 —
   * true only when this redemption converted in place from a Child-ticked
   * caregiver invite into a normal adult self-registration, because the
   * declared date of birth turned out to be 16 or older. `user.role`
   * already reflects the converted role; this is the explicit signal the
   * Success Screen uses to show "you were registered as yourself, not a
   * caregiver" rather than inferring it from role alone.
   */
  converted_from_caregiver?: boolean;
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
 * Whether the redemption form must collect the *child's* name and date of
 * birth instead (Requirement 5.2/5.3) — the exact opposite of
 * {@link needsAdultSelfDeclaration}, kept as its own named function rather
 * than a bare negation at each call site so the intent reads the same way
 * it did there, and so this can be unit-tested independently if the two
 * ever need to diverge (e.g. a future intended role that needs neither).
 * Mirrors `redeem-invite/index.ts`'s step 2b: only `'caregiver'` collects
 * `subject_first_name`/`subject_last_name`/`subject_date_of_birth`.
 */
export function needsCaregiverSubjectDetails(intendedRole: string | null | undefined): boolean {
  return intendedRole === 'caregiver';
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

// ---------------------------------------------------------------------------
// Post-redemption routing
// `.kiro/specs/add-player-and-dob-age-model/` Requirement 8.2, task 12.3
// ---------------------------------------------------------------------------

/**
 * Where the Success Screen's primary action should send the registrant
 * (Requirement 8.2). A pending Caregiver approval takes priority over the
 * normal destination (the club's app link, or `/login` as a fallback) — it
 * overrides even when a branded `appUrl` is present, since the approval
 * lives in this app specifically, not wherever the club's app link points.
 * Redeeming the invite never auto-approves it (Requirement 4.7), so this is
 * the one chance to make sure the registrant actually finds their way to
 * the still-pending request.
 */
export function resolvePrimaryActionHref(
  hasPendingApproval: boolean | undefined,
  appUrl: string | null
): string {
  if (hasPendingApproval) return '/caregiver-approvals';
  return appUrl || '/login';
}
