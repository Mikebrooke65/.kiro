/**
 * Pure decision logic for the `redeem-invite` Edge Function.
 *
 * Spec: `.kiro/specs/lite-user-registration-fix/` (task 3.1)
 *
 * This module holds every decision the handler makes and **no I/O**. It imports
 * nothing — no Deno APIs, no supabase-js, no environment access — so it can be
 * imported directly by vitest (`npm test`, node environment) as well as by
 * `index.ts` running under Deno.
 *
 * Requirements covered here: 2.4 (no raw database text reaches the registrant),
 * 2.7 / 2.8 (pre-confirmation follows the email match), 3.3 (distinct
 * machine-readable invite statuses), 3.7 (client-side validation messages
 * preserved server-side).
 *
 * Club-agnostic: no club name, colour, logo, domain or URL appears in this file.
 *
 * Baseline note: the behaviour encoded below was recorded against the unfixed
 * code in tasks 1 and 2 (see "Exploration findings" and "Preservation findings"
 * in `tasks.md`). Where a baseline was observed — the message strings, the status
 * precedence order, the unparseable-`expires_at` edge case — it is reproduced
 * exactly rather than improved, so task 3.8 can prove nothing changed.
 */

// ---------------------------------------------------------------------------
// Email normalisation (2.7, 2.8)
// ---------------------------------------------------------------------------

/**
 * The single normalisation used for every lookup, insert and comparison in one
 * invocation: `lower(trim(email))`.
 *
 * Normalising in exactly one place is what makes the email-match rule (D2)
 * trustworthy — an auth lookup that used the raw value while the comparison used
 * the trimmed value could pre-confirm an account it should not.
 *
 * Non-string input (missing field, wrong JSON type) normalises to `''` rather
 * than throwing, so `validateRequest` can reject it as a missing field.
 */
export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * True only when the invite has a `recipient_email` AND the normalised values
 * are equal. This is the ownership proof that decides `email_confirm` (2.7 /
 * 2.8) and the only condition under which a pre-fix orphaned auth user may be
 * adopted.
 *
 * An invite with no `recipient_email` never matches, so a code with no intended
 * recipient can never produce a pre-confirmed account.
 */
export function emailMatchesInvite(submittedEmail: unknown, recipientEmail: unknown): boolean {
  if (typeof recipientEmail !== 'string') return false;
  const recipient = normalizeEmail(recipientEmail);
  if (recipient === '') return false;
  const submitted = normalizeEmail(submittedEmail);
  if (submitted === '') return false;
  return submitted === recipient;
}

// ---------------------------------------------------------------------------
// Request validation (3.7)
// ---------------------------------------------------------------------------

/**
 * Machine-readable rejection reasons. The handler returns the reason so a caller
 * can branch on it; the human-facing text comes from
 * {@link VALIDATION_MESSAGES}.
 *
 * `missing_date_of_birth` (`add-player-and-dob-age-model` Requirement 3.4) is
 * deliberately **not** enforced inside {@link validateRequest} below, unlike
 * every other reason here — whether a date of birth is required depends on
 * the invite's role, which is not known until after the invite is looked up
 * (step 2 of the handler). `validateRequest` only normalises the field; the
 * handler applies this reason once `effectiveRole` is resolved, before any
 * write. It is defined here anyway so the message lives in one place with
 * every other validation reason.
 */
export type ValidationReason =
  | 'missing_code'
  | 'consent_required'
  | 'missing_first_name'
  | 'missing_last_name'
  | 'missing_email'
  | 'missing_password'
  | 'password_too_short'
  | 'missing_date_of_birth';

/** Minimum password length enforced client-side today, and now server-side too. */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * The exact strings the browser already shows (`src/pages/LiteLandingPage.tsx`,
 * recorded as the 3.7 baseline in `src/lib/invites-api.preservation.test.ts`).
 * Four distinct machine-readable reasons share the "All fields are required."
 * message because that is the single message the current form produces for any
 * missing field — the reason is finer-grained than the copy on purpose.
 *
 * `missing_code` has no client-side counterpart: the code comes from the invite
 * URL, so the form can never submit without one. It reuses the landing page's
 * "Invalid Code" body text so a tampered or truncated link reads the same way as
 * an unknown code.
 */
export const VALIDATION_MESSAGES: Record<ValidationReason, string> = {
  missing_code: 'This invite code is not valid. Please check the link and try again.',
  consent_required: 'You must accept the privacy notice to continue.',
  missing_first_name: 'All fields are required.',
  missing_last_name: 'All fields are required.',
  missing_email: 'All fields are required.',
  missing_password: 'All fields are required.',
  password_too_short: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  missing_date_of_birth: 'Please enter your date of birth to complete registration.',
};

/** Raw request body as the function receives it — every field untrusted. */
export interface RedeemInviteRequestBody {
  code?: unknown;
  email?: unknown;
  password?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  privacy_consent?: unknown;
  /** ISO `yyyy-mm-dd`. Required only for a non-caregiver invite — see
   *  `ValidationReason`'s `missing_date_of_birth` doc comment. */
  date_of_birth?: unknown;
}

/**
 * An accepted request, normalised once. The handler uses these values for every
 * subsequent lookup, insert and comparison and never re-reads the raw body.
 *
 * Note what is absent: `role`, `user_type`, `team_id` and `active` are never
 * taken from the request. The handler sets them server-side, so a crafted body
 * cannot elevate a registrant or attach them to another team.
 */
export interface NormalizedRegistration {
  code: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  privacy_consent: true;
  /**
   * The self-declared date of birth (`add-player-and-dob-age-model`
   * Requirement 3.4), trimmed if a string was sent, or `null` if absent —
   * `null` is valid at this stage (a caregiver redemption never sends one);
   * whether it is *required* is decided by the handler once the invite's
   * role is known.
   */
  date_of_birth: string | null;
}

export type ValidationResult =
  | { ok: true; value: NormalizedRegistration }
  | { ok: false; reason: ValidationReason; message: string };

/**
 * Order the rejections are evaluated in. Consent, the four missing fields and
 * the password length follow the browser's existing branch order so a request
 * the client would also have caught produces the same message. `missing_code` is
 * checked first because it is a request-integrity problem rather than a form
 * field — the form cannot omit it.
 */
export const VALIDATION_PRECEDENCE: readonly ValidationReason[] = [
  'missing_code',
  'consent_required',
  'missing_first_name',
  'missing_last_name',
  'missing_email',
  'missing_password',
  'password_too_short',
];

/** Trim a value that should be a non-empty string; anything else becomes `''`. */
function requiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Total validation: every possible body yields either an explicit accept or one
 * specific rejection reason. Never throws, and has no fall-through — that
 * totality is what stops an unhandled input silently reclassifying a
 * preservation case (3.7).
 *
 * The code is trimmed but **not** case-folded: the lookup is an exact `eq('code',
 * …)` match today, and changing case handling would change which codes resolve.
 * Passwords are used verbatim (not trimmed) — leading or trailing spaces are
 * legitimate characters, and trimming would silently change the credential the
 * registrant chose.
 */
export function validateRequest(body: unknown): ValidationResult {
  const raw = (body ?? {}) as RedeemInviteRequestBody;

  const code = requiredString(raw.code);
  if (code === '') return reject('missing_code');

  if (raw.privacy_consent !== true) return reject('consent_required');

  const first_name = requiredString(raw.first_name);
  if (first_name === '') return reject('missing_first_name');

  const last_name = requiredString(raw.last_name);
  if (last_name === '') return reject('missing_last_name');

  const email = normalizeEmail(raw.email);
  if (email === '') return reject('missing_email');

  const password = typeof raw.password === 'string' ? raw.password : '';
  if (password === '') return reject('missing_password');
  if (password.length < MIN_PASSWORD_LENGTH) return reject('password_too_short');

  // Normalised but not required here — see NormalizedRegistration's doc
  // comment on date_of_birth and ValidationReason's on missing_date_of_birth.
  const trimmedDob = requiredString(raw.date_of_birth);
  const date_of_birth = trimmedDob === '' ? null : trimmedDob;

  return {
    ok: true,
    value: { code, email, password, first_name, last_name, privacy_consent: true, date_of_birth },
  };
}

function reject(reason: ValidationReason): ValidationResult {
  return { ok: false, reason, message: VALIDATION_MESSAGES[reason] };
}

// ---------------------------------------------------------------------------
// Invite status derivation (3.3)
// ---------------------------------------------------------------------------

/** Machine-readable statuses the landing page maps to its distinct messages. */
export type InviteStatus = 'valid' | 'invalid' | 'redeemed' | 'expired';

/** The fields of an `invite_codes` row this decision depends on. */
export interface InviteRecordLike {
  recipient_email?: string | null;
  redeemed_by?: string | null;
  expires_at?: string | null;
}

/**
 * Server-side re-derivation of the invite status, under `service_role`. The
 * client already validated, but that check is advisory — the code is the
 * authorization for an unauthenticated endpoint, so the server must derive this
 * itself.
 *
 * Precedence, preserved exactly from `validateInviteCode()` and recorded as the
 * 3.3 baseline in task 2:
 *   1. no row (`null` / `undefined`) → `invalid`
 *   2. `redeemed_by` set → `redeemed`
 *   3. `expires_at` in the past → `expired`
 *   4. otherwise → `valid`
 *
 * Recorded edge case, deliberately reproduced rather than fixed: an
 * **unparseable** `expires_at` is treated as `valid`. Today
 * `new Date('not-a-date') < now` is false, so the expiry branch is skipped and
 * no crash occurs. A missing `expires_at` is treated the same way, because
 * `new Date(null)` would otherwise collapse to the epoch and read as expired —
 * a difference in behaviour rather than a preservation of it.
 */
export function deriveInviteStatus(
  invite: InviteRecordLike | null | undefined,
  now: Date = new Date()
): InviteStatus {
  if (!invite) return 'invalid';
  if (invite.redeemed_by) return 'redeemed';

  const expiresAt = typeof invite.expires_at === 'string' ? Date.parse(invite.expires_at) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt < now.getTime()) return 'expired';

  return 'valid';
}

// ---------------------------------------------------------------------------
// Error mapping (2.4)
// ---------------------------------------------------------------------------

/**
 * The complete set of client-facing messages. `mapError` can return nothing
 * else, which is what makes 2.4 checkable: no raw Postgres policy or constraint
 * text can reach the person registering, whatever the underlying failure was.
 *
 * The three invite-status messages are the landing page's existing copy, kept
 * here so the server can answer with the same words when it re-derives a status
 * the client thought was valid.
 */
export const SAFE_ERROR_MESSAGES = {
  invalid_code: 'This invite code is not valid. Please check the link and try again.',
  redeemed_code: 'This invite code has already been used.',
  expired_code:
    'This code has expired. Your coach/manager has been notified and can send you a new one.',
  email_taken: 'An account already exists for this email. Try logging in instead.',
  invalid_email: 'That email address was not accepted. Please check it and try again.',
  weak_password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  rate_limited: 'Too many attempts just now. Please wait a few minutes and try again.',
  team_unavailable: "We couldn't add you to the team for this invite. Please ask for a new invite.",
  unavailable: "Registration isn't available right now. Please try again in a few minutes.",
  unknown: "Something went wrong and we couldn't complete your registration. Please try again.",
} as const;

export type SafeErrorKey = keyof typeof SAFE_ERROR_MESSAGES;

/** Every message `mapError` is allowed to return. Useful as a test oracle. */
export const SAFE_ERROR_MESSAGE_LIST: readonly string[] = Object.freeze(
  Object.values(SAFE_ERROR_MESSAGES)
);

/**
 * Fragments that must never appear in a client-facing message (2.4). `policy`
 * covers a named policy leaking through; the rest are the literal words the
 * observed RLS error is built from.
 */
export const FORBIDDEN_ERROR_FRAGMENTS: readonly string[] = Object.freeze([
  'row-level security',
  'row level security',
  'violates',
  'constraint',
  'policy',
  'permission denied',
  'sql',
]);

/** Map a machine-readable invite status to its client-facing message (3.3). */
export function messageForInviteStatus(status: InviteStatus): string {
  switch (status) {
    case 'redeemed':
      return SAFE_ERROR_MESSAGES.redeemed_code;
    case 'expired':
      return SAFE_ERROR_MESSAGES.expired_code;
    case 'invalid':
      return SAFE_ERROR_MESSAGES.invalid_code;
    case 'valid':
      // Not an error state. Returning the generic message rather than throwing
      // keeps this total, so a caller bug can't surface as a crash.
      return SAFE_ERROR_MESSAGES.unknown;
  }
}

/** Pull whatever text a thrown value carries, without trusting its shape. */
function rawErrorText(rawError: unknown): string {
  if (rawError == null) return '';
  if (typeof rawError === 'string') return rawError;
  if (typeof rawError !== 'object') return String(rawError);

  const e = rawError as Record<string, unknown>;
  const parts = [e.message, e.error_description, e.error, e.details, e.hint, e.code, e.msg]
    .filter((p): p is string | number => typeof p === 'string' || typeof p === 'number')
    .map(String);
  return parts.join(' ');
}

/**
 * Classify a raw failure into one of the known safe keys. Recognition is by
 * signature in the raw text — the text itself is never returned.
 */
export function classifyError(rawError: unknown): SafeErrorKey {
  const text = rawErrorText(rawError).toLowerCase();
  if (text === '') return 'unknown';

  // Order matters: the most specific, most actionable signatures first.
  if (/already (been )?registered|already exists|duplicate key|user_already_exists|email_exists/.test(text)) {
    return 'email_taken';
  }
  if (/rate limit|too many requests|429/.test(text)) return 'rate_limited';
  if (/password/.test(text) && /short|weak|least|6 characters|length/.test(text)) {
    return 'weak_password';
  }
  if (/email address.*invalid|invalid email|email_address_invalid|validation_failed.*email/.test(text)) {
    return 'invalid_email';
  }
  if (/already been used|already redeemed/.test(text)) return 'redeemed_code';
  if (/expired/.test(text)) return 'expired_code';
  if (/invalid.*(invite|code)|no such code|code not found/.test(text)) return 'invalid_code';
  if (/team_members|team_id|foreign key/.test(text)) return 'team_unavailable';
  // RLS, constraint, permission and configuration failures are all "we can't do
  // this right now" from the registrant's point of view. Nothing about the
  // policy or column that failed is useful to them, and 2.4 forbids echoing it.
  if (
    /row-level security|row level security|violates|constraint|permission denied|not authorized|unauthorized|jwt|service_role|env|secret|configuration|fetch failed|network|timeout|502|503|504/.test(
      text
    )
  ) {
    return 'unavailable';
  }
  return 'unknown';
}

/**
 * Plain-language message for any failure, drawn only from
 * {@link SAFE_ERROR_MESSAGES} (2.4).
 *
 * The caller is expected to `console.error` the raw detail for diagnosis before
 * calling this — the safe message is what goes back over the wire, the raw text
 * stays in the function logs.
 */
export function mapError(rawError: unknown): string {
  return SAFE_ERROR_MESSAGES[classifyError(rawError)];
}

// ---------------------------------------------------------------------------
// Compensating rollback bookkeeping (2.3, Property 4)
// ---------------------------------------------------------------------------

/**
 * A record this invocation touched. `createdByThisInvocation` is the whole point:
 * an adopted orphan auth user, an existing `public.users` row and an existing
 * membership are all recorded as `false` so rollback can never delete them.
 */
export interface LedgerEntry {
  createdByThisInvocation: boolean;
}

export interface AuthUserEntry extends LedgerEntry {
  userId: string;
}

export interface ProfileRowEntry extends LedgerEntry {
  userId: string;
}

export interface TeamMemberEntry extends LedgerEntry {
  teamId: string;
  userId: string;
}

/**
 * `player_caregivers` link created by redeeming a Caregiver invite
 * (`add-player-and-dob-age-model` Requirement 4.6). Mutually exclusive with
 * {@link TeamMemberEntry} in practice — `requiresTeamMembership` gates
 * exactly one of the two being written per invocation — but the ledger keeps
 * them as separate optional fields rather than a union, so a bug in that
 * gating would show up as two entries here instead of silently picking one.
 */
export interface CaregiverLinkEntry extends LedgerEntry {
  playerId: string;
  caregiverId: string;
}

/**
 * What this invocation created, in creation order: auth user → `users` row →
 * `team_members` row (or, for a Caregiver invite, a `player_caregivers` link
 * instead — never both). Invite redemption is deliberately absent: it is the
 * last write, so nothing can fail after it and there is nothing to undo.
 */
export interface CreationLedger {
  authUser?: AuthUserEntry | null;
  profileRow?: ProfileRowEntry | null;
  teamMember?: TeamMemberEntry | null;
  caregiverLink?: CaregiverLinkEntry | null;
}

export type Compensation =
  | { action: 'delete_team_member'; teamId: string; userId: string }
  | { action: 'delete_caregiver_link'; playerId: string; caregiverId: string }
  | { action: 'delete_profile_row'; userId: string }
  | { action: 'delete_auth_user'; userId: string };

/**
 * The rollback list: reverse creation order, containing only records this
 * invocation created.
 *
 * Reverse order matters because the profile row references the auth user and the
 * membership references the profile row — undoing forwards would fight foreign
 * keys. Filtering on `createdByThisInvocation` is what keeps an existing user's
 * account and memberships safe when a later step fails (2.3, and preservation of
 * 3.1 / 3.2). `caregiverLink` sits at the same position as `teamMember` — both
 * are "step 5" writes, undone before the profile row and auth user.
 */
export function plannedCompensations(created: CreationLedger | null | undefined): Compensation[] {
  const ledger = created ?? {};
  const compensations: Compensation[] = [];

  if (ledger.teamMember?.createdByThisInvocation) {
    compensations.push({
      action: 'delete_team_member',
      teamId: ledger.teamMember.teamId,
      userId: ledger.teamMember.userId,
    });
  }
  if (ledger.caregiverLink?.createdByThisInvocation) {
    compensations.push({
      action: 'delete_caregiver_link',
      playerId: ledger.caregiverLink.playerId,
      caregiverId: ledger.caregiverLink.caregiverId,
    });
  }
  if (ledger.profileRow?.createdByThisInvocation) {
    compensations.push({ action: 'delete_profile_row', userId: ledger.profileRow.userId });
  }
  if (ledger.authUser?.createdByThisInvocation) {
    compensations.push({ action: 'delete_auth_user', userId: ledger.authUser.userId });
  }

  return compensations;
}

// ---------------------------------------------------------------------------
// Intended-role resolution (6.2, 6.3, 6.4, 6.5; extended by
// add-player-and-dob-age-model Requirement 5.1)
// ---------------------------------------------------------------------------

/**
 * The only roles an invite is allowed to grant on redemption. `admin` is
 * deliberately absent: club-wide administrator authority is never conferred by
 * redeeming an invite, so an invite carrying `role: 'admin'` must not elevate
 * the registrant.
 *
 * `caregiver` was added by `.kiro/specs/add-player-and-dob-age-model/`
 * Requirement 5.1 (a Caregiver invite, generated by Add Player's Junior path).
 * It resolves through this same function for `users.role` exactly like the
 * other three — see `requiresTeamMembership` below for the one place a
 * caregiver is treated differently.
 */
export type IntendedRole = 'player' | 'coach' | 'manager' | 'caregiver';

/** The valid set, frozen so it can double as a test oracle. */
export const INTENDED_ROLES: readonly IntendedRole[] = Object.freeze([
  'player',
  'coach',
  'manager',
  'caregiver',
]);

/**
 * Resolve the effective role to apply to both the `users.role` profile column
 * (6.2) and — for `player`/`coach`/`manager` only, see `requiresTeamMembership`
 * — the `team_members.role` membership column (6.3) when a registrant redeems
 * an invite.
 *
 * Rules, preserved exactly from the design's "Redeem-invite role fix" section:
 *   - a value already in the valid set → that value (6.2 / 6.3)
 *   - `null` or absent (`undefined`) → `player`, without error (6.4)
 *   - anything else, including `'admin'` → `player` (6.5)
 *
 * The default-to-`player` behaviour is what makes 6.5 safe: an unrecognised or
 * privileged value can never grant an elevated role, it silently degrades to the
 * least-privileged role. This function's behaviour is otherwise unchanged by
 * the addition of `caregiver` to `INTENDED_ROLES` — it still degrades unknown
 * values to `player`, over the now four-member set.
 */
export function resolveEffectiveRole(inviteRole: string | null | undefined): IntendedRole {
  return (INTENDED_ROLES as readonly string[]).includes(inviteRole ?? '')
    ? (inviteRole as IntendedRole)
    : 'player';
}

// ---------------------------------------------------------------------------
// team_members gating (add-player-and-dob-age-model Requirement 6.1, 6.2)
// ---------------------------------------------------------------------------

/**
 * Does this effective role get a `team_members` row on redemption?
 *
 * Deliberately a separate decision from {@link resolveEffectiveRole}: that
 * function still decides `users.role` identically for all four roles (a
 * caregiver's `users.role` has always been `'caregiver'`, previously set by
 * the now-superseded direct `create-auth-user` call). This function decides
 * the one thing that must **not** be uniform — `team_members.role` stays
 * `CHECK (role IN ('player', 'coach', 'manager'))` (migration 048) and is
 * deliberately not widened to include `'caregiver'`
 * (`add-player-and-dob-age-model` Requirement 6.1/6.2). A caregiver's
 * connection to a team is established solely by their `player_caregivers`
 * link to a child who holds their own `team_members` row — never a
 * `team_members` row of the caregiver's own.
 */
export function requiresTeamMembership(role: IntendedRole): boolean {
  return role !== 'caregiver';
}

// ---------------------------------------------------------------------------
// Adult self-declaration (add-player-and-dob-age-model Requirement 3.4, 3.5)
// ---------------------------------------------------------------------------

/** The age, in whole years, at and above which a self-declared DOB is Adult. */
export const ADULT_AGE_THRESHOLD = 16;

/**
 * Is a self-declared date of birth 16 years or older as of `asOf`
 * (Requirement 2.1's threshold, applied here to the record-of-truth DOB an
 * Adult self-registration invitee confirms at redemption — Requirement 3.4)?
 *
 * An unparseable date of birth returns `false` (not-adult), so the handler's
 * caller rejects rather than silently accepting an unverifiable claim
 * (Requirement 3.5) — the safe direction to fail in, matching
 * `src/lib/add-player-logic.ts`'s `routeAddPlayer` treating an unparseable DOB
 * as the Junior route.
 */
export function isAdult(dateOfBirth: string, asOf: Date = new Date()): boolean {
  const dob = parseIsoDate(dateOfBirth);
  if (!dob) return false;
  return ageInWholeYears(dob, asOf) >= ADULT_AGE_THRESHOLD;
}

/** Parse a strict `yyyy-mm-dd` string into calendar-date parts, or `null`. */
function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  // Reject calendar-invalid dates (e.g. 2024-02-30) rather than letting them
  // silently roll over to a different date.
  const check = new Date(year, month - 1, day);
  const isValid =
    check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day;

  return isValid ? { year, month, day } : null;
}

/** Whole-years age as of `asOf`, using calendar-date (not elapsed-time) math. */
function ageInWholeYears(
  dob: { year: number; month: number; day: number },
  asOf: Date
): number {
  let age = asOf.getFullYear() - dob.year;
  const hasHadBirthdayThisYear =
    asOf.getMonth() + 1 > dob.month ||
    (asOf.getMonth() + 1 === dob.month && asOf.getDate() >= dob.day);
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// ---------------------------------------------------------------------------
// Known, structural rejections added by add-player-and-dob-age-model
// ---------------------------------------------------------------------------

/**
 * Client-facing messages for the two new rejections this feature's handler
 * changes introduce. Deliberately **not** part of {@link SAFE_ERROR_MESSAGES}:
 * that dictionary is the vocabulary `classifyError` maps *opaque* raw
 * database/auth failures onto by sniffing their text. These two are the
 * opposite — outcomes the handler understands precisely from its own state
 * (the resolved role; the subject lookup), never routed through
 * `classifyError`/`mapError` at all, so folding them into that dictionary
 * would require inventing text signatures for failures that never produce
 * raw error text in the first place.
 */
export const ADD_PLAYER_MESSAGES = {
  /** Requirement 3.5 — self-declared DOB at redemption indicates under 16. */
  underage_self_registration:
    'This invite is for an adult. Please ask your Manager to add you as a Junior instead.',
  /** Requirement 5.4 — a Caregiver invite's subject_user_id no longer
   *  resolves to a Junior users row (e.g. the child record was removed). */
  caregiver_subject_missing: 'This invite is no longer valid. Please ask for a new one.',
} as const;
