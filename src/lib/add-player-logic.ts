// Pure routing logic for the Add Player entry point.
//
// Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 2)
//
// This is a UI-only, provisional decision — it only picks which form fields to
// show next (Requirement 1.5/1.6). It never decides anyone's record-of-truth
// date of birth: an Adult's DOB is self-declared server-side at invite
// redemption (`supabase/functions/redeem-invite/logic.ts`'s `isAdult`), and a
// Junior's DOB is recorded as entered here only because Add Player is the one
// place a Junior's DOB is captured at all (Requirement 4.1).
//
// Kept free of React so the routing threshold can be unit- and
// property-tested in isolation.

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
