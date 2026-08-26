// Pure routing and validation logic for the Add Player entry point.
//
// Spec: `.kiro/specs/add-player-and-dob-age-model/` (tasks 2, 10)
//
// Routing is a UI-only, provisional decision — it only picks which form
// fields to show next (Requirement 1.5/1.6). It never decides anyone's
// record-of-truth date of birth: an Adult's DOB is self-declared server-side
// at invite redemption (`supabase/functions/redeem-invite/logic.ts`'s
// `isAdult`), and a Junior's DOB is recorded as entered here only because Add
// Player is the one place a Junior's DOB is captured at all (Requirement 4.1).
//
// Kept free of React so the routing threshold and form validation can be
// unit- and property-tested in isolation.

import { validateAddJunior } from './add-junior-logic';

/** A routing date of birth as typed into the Add Player form. */
export interface AddPlayerRoutingInput {
  /** ISO `yyyy-mm-dd`, as typed by the Manager. */
  dateOfBirth: string;
  /** Reference "today". Defaults to `new Date()`; injectable for tests. */
  asOf?: Date;
}

/** Which half of Add Player a routing date of birth sends the flow down. */
export type AddPlayerRoute = 'adult' | 'junior';

/** The age, in whole years, that separates the Adult and Junior paths. */
export const ADULT_AGE_THRESHOLD = 16;

/**
 * Route an Add Player submission from its entered date of birth
 * (Requirement 1.5/1.6, Requirement 2.1's threshold).
 *
 * 16 years or older as of the reference date routes `'adult'`; under 16 routes
 * `'junior'`. The boundary — turning 16 exactly on the reference date —
 * classifies as `'adult'`.
 *
 * An unparseable date of birth is treated as `'junior'`, the privacy-protective
 * default: routing a person whose age can't be determined down the
 * caregiver-consent path is the safer failure than routing them into
 * self-registration.
 */
export function routeAddPlayer(input: AddPlayerRoutingInput): AddPlayerRoute {
  const asOf = input.asOf ?? new Date();
  const dob = parseIsoDate(input.dateOfBirth);
  if (!dob) return 'junior';

  return ageInWholeYears(dob, asOf) >= ADULT_AGE_THRESHOLD ? 'adult' : 'junior';
}

// ---------------------------------------------------------------------------
// Tick-based routing (`.kiro/specs/streamlined-invites-and-child-access/`
// Requirement 1.2, task 3a)
//
// Replaces the DOB-threshold routing above: a Manager rarely knows an exact
// birthdate for someone they're adding, so Add Player asks for an explicit
// Adult/Child judgement call instead of an exact date. The exact date of
// birth moves to invite redemption, collected from whoever actually knows it
// (see `supabase/functions/redeem-invite/logic.ts`'s `resolveAgeTickOutcome`,
// which also handles a tick that turns out not to match the self-declared
// DOB at redemption).
//
// Deliberately kept alongside `routeAddPlayer`/`AddPlayerForm` above rather
// than replacing them in this task: task 3a is pure-logic-only and must not
// change what's wired into `AddPlayerModal.tsx` yet (task 3e does that, per
// tasks.md's staged plan) — swapping the old exports out from under the
// still-live UI would break the build immediately. Task 3e removes
// `routeAddPlayer`, `AddPlayerForm`, and `validateAddPlayerForm` once nothing
// calls them.
// ---------------------------------------------------------------------------

/** The judgement call a Manager makes about who they're adding. */
export type AddPlayerTick = 'adult' | 'child';

/**
 * Route an Add Player submission from the Manager's Adult/Child tick
 * (Requirement 1.2). Unlike the DOB-threshold version above, there's no
 * invalid-input case to default away from — the tick is already one of
 * exactly two values.
 */
export function routeAddPlayerFromTick(tick: AddPlayerTick): AddPlayerRoute {
  return tick === 'adult' ? 'adult' : 'junior';
}

/**
 * The tick-based Add Player form (Requirement 1.2): first name, last name,
 * and the Adult/Child tick are always captured — no date of birth. `email`
 * is used only on the Adult path (1.4); `caregiverName`/`caregiverEmail`/
 * `caregiverPhone` only on the Child path (1.3).
 */
export interface AddPlayerFormWithTick {
  firstName: string;
  lastName: string;
  tick: AddPlayerTick;
  email: string;
  caregiverName: string;
  caregiverEmail: string;
  caregiverPhone: string;
}

export type AddPlayerTickFieldError =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'caregiverName'
  | 'caregiverEmail'
  | 'caregiverPhone';

export type ValidateAddPlayerTickResult =
  | { ok: true }
  | { ok: false; errors: AddPlayerTickFieldError[] };

const TICK_ADULT_FIELD_ORDER: AddPlayerTickFieldError[] = ['firstName', 'lastName', 'email'];
const TICK_JUNIOR_FIELD_ORDER: AddPlayerTickFieldError[] = [
  'firstName',
  'lastName',
  'caregiverName',
  'caregiverEmail',
  'caregiverPhone',
];

/**
 * Validate the tick-based Add Player form for the route its own tick
 * resolves to (Requirement 1.3/1.4: reject, report every invalid field).
 * No date-of-birth field exists on this form at all — that's the point of
 * Requirement 1 — so there's nothing to validate there.
 *
 * `route` is passed in (rather than re-derived) so the caller and this
 * function are guaranteed to agree on which field set applies — always
 * `routeAddPlayerFromTick(form.tick)`.
 */
export function validateAddPlayerFormWithTick(
  form: AddPlayerFormWithTick,
  route: AddPlayerRoute
): ValidateAddPlayerTickResult {
  const errors = new Set<AddPlayerTickFieldError>();

  if (!lengthInBounds(form.firstName, 1, 50)) errors.add('firstName');
  if (!lengthInBounds(form.lastName, 1, 50)) errors.add('lastName');

  if (route === 'adult') {
    if (!isValidEmail(form.email)) errors.add('email');
  } else {
    // Reuse the existing, tested caregiver/child validation unchanged —
    // firstName/lastName were already checked above; this call re-derives
    // the same two field results, mapped back onto the same keys rather
    // than duplicated.
    const juniorResult = validateAddJunior({
      caregiverName: form.caregiverName,
      caregiverEmail: form.caregiverEmail,
      caregiverPhone: form.caregiverPhone,
      childFirstName: form.firstName,
      childLastName: form.lastName,
    });
    if (!juniorResult.ok) {
      for (const field of juniorResult.errors) {
        if (field === 'childFirstName') errors.add('firstName');
        else if (field === 'childLastName') errors.add('lastName');
        else errors.add(field);
      }
    }
  }

  const fieldOrder = route === 'adult' ? TICK_ADULT_FIELD_ORDER : TICK_JUNIOR_FIELD_ORDER;
  const ordered = fieldOrder.filter((field) => errors.has(field));

  return ordered.length === 0 ? { ok: true } : { ok: false, errors: ordered };
}

/**
 * Parse a strict `yyyy-mm-dd` string into calendar-date parts, or `null`.
 * Exported so form validation (below) and any other caller share the exact
 * same notion of "a valid date of birth" that routing already uses.
 */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
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

/** True when `dateOfBirth` is a real calendar date, not in the future as of `asOf`. */
function isPlausibleDateOfBirth(dateOfBirth: string, asOf: Date): boolean {
  const parsed = parseIsoDate(dateOfBirth);
  if (!parsed) return false;
  const check = new Date(parsed.year, parsed.month - 1, parsed.day);
  return check.getTime() <= asOf.getTime();
}

// ---------------------------------------------------------------------------
// Add Player form validation (Requirement 1.2, 1.3, 1.4)
// ---------------------------------------------------------------------------

/** True when the trimmed length of `value` falls within [min, max] inclusive. */
function lengthInBounds(value: string, min: number, max: number): boolean {
  const length = value.trim().length;
  return length >= min && length <= max;
}

// Same pragmatic shape check `add-junior-logic.ts` uses for its email fields
// — duplicated rather than imported, matching this codebase's convention of
// small, independently-testable pure-logic files (see e.g. `isAdult` in
// `redeem-invite/logic.ts` vs. `routeAddPlayer` above).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed);
}

/**
 * The unified Add Player form (Requirement 1.2): first name, last name, and
 * a routing date of birth are always captured. `email` is used only on the
 * Adult path (Requirement 1.5); `caregiverName`/`caregiverEmail`/
 * `caregiverPhone` only on the Junior path (Requirement 1.6) — whichever
 * fields the current route doesn't use are ignored by `validateAddPlayerForm`.
 */
export interface AddPlayerForm {
  firstName: string;
  lastName: string;
  /** ISO `yyyy-mm-dd`, as typed by the Manager. */
  dateOfBirth: string;
  email: string;
  caregiverName: string;
  caregiverEmail: string;
  caregiverPhone: string;
}

export type AddPlayerFieldError =
  | 'firstName'
  | 'lastName'
  | 'dateOfBirth'
  | 'email'
  | 'caregiverName'
  | 'caregiverEmail'
  | 'caregiverPhone';

export type ValidateAddPlayerResult =
  | { ok: true }
  | { ok: false; errors: AddPlayerFieldError[] };

// Stable order fields are reported in, so the UI and tests see a predictable list.
const ADULT_FIELD_ORDER: AddPlayerFieldError[] = ['firstName', 'lastName', 'dateOfBirth', 'email'];
const JUNIOR_FIELD_ORDER: AddPlayerFieldError[] = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'caregiverName',
  'caregiverEmail',
  'caregiverPhone',
];

/**
 * Validate the Add Player form for the route its own date of birth resolves
 * to (Requirement 1.3: reject, report every invalid field, retain values —
 * the retaining itself is the caller's/component's job, this only decides
 * what's invalid).
 *
 * `route` is passed in (rather than re-derived) so the caller and this
 * function are guaranteed to agree on which field set applies — always
 * `routeAddPlayer({ dateOfBirth: form.dateOfBirth, asOf })`.
 */
export function validateAddPlayerForm(
  form: AddPlayerForm,
  route: AddPlayerRoute,
  asOf: Date = new Date()
): ValidateAddPlayerResult {
  const errors = new Set<AddPlayerFieldError>();

  if (!lengthInBounds(form.firstName, 1, 50)) errors.add('firstName');
  if (!lengthInBounds(form.lastName, 1, 50)) errors.add('lastName');
  if (!isPlausibleDateOfBirth(form.dateOfBirth, asOf)) errors.add('dateOfBirth');

  if (route === 'adult') {
    if (!isValidEmail(form.email)) errors.add('email');
  } else {
    // Reuse the existing, tested caregiver/child validation unchanged
    // (Requirement 1.6 — same fields the prior Add Junior form captured).
    // firstName/lastName were already checked above; this call re-derives
    // the same two field results, which is fine — they're mapped back onto
    // the same 'firstName'/'lastName' error keys, not duplicated.
    const juniorResult = validateAddJunior({
      caregiverName: form.caregiverName,
      caregiverEmail: form.caregiverEmail,
      caregiverPhone: form.caregiverPhone,
      childFirstName: form.firstName,
      childLastName: form.lastName,
    });
    if (!juniorResult.ok) {
      for (const field of juniorResult.errors) {
        if (field === 'childFirstName') errors.add('firstName');
        else if (field === 'childLastName') errors.add('lastName');
        else errors.add(field);
      }
    }
  }

  const fieldOrder = route === 'adult' ? ADULT_FIELD_ORDER : JUNIOR_FIELD_ORDER;
  const ordered = fieldOrder.filter((field) => errors.has(field));

  return ordered.length === 0 ? { ok: true } : { ok: false, errors: ordered };
}
