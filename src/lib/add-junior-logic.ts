// Feature: post-registration-welcome-and-team-page
//
// Pure logic for the Add-a-Junior consent flow. No React, no Supabase — every
// function here is deterministic and side-effect free so it can be exercised by
// property/unit tests without a live backend. The API layer
// (`caregivers-api.addJunior`) wires these helpers to Postgres and send-email.

import { isValidDateOfBirth } from './success-screen-logic';

// ---------------------------------------------------------------------------
// Add-a-junior form validation (Req 5.3)
// ---------------------------------------------------------------------------

export interface AddJuniorForm {
  caregiverName: string; // 1-100 characters
  caregiverEmail: string; // valid email format, 1-254 characters
  caregiverPhone: string; // 7-20 characters
  childFirstName: string; // 1-50 characters
  childLastName: string; // 1-50 characters
}

/** A field name that failed validation. */
export type FieldError = keyof AddJuniorForm;

export type ValidateAddJuniorResult =
  | { ok: true }
  | { ok: false; errors: FieldError[] };

// Stable order in which fields are reported so callers/tests see a predictable list.
const FIELD_ORDER: FieldError[] = [
  'caregiverName',
  'caregiverEmail',
  'caregiverPhone',
  'childFirstName',
  'childLastName',
];

// Pragmatic email shape check: exactly one "@", non-empty local part, and a
// dotted domain. Intentionally simple — full RFC 5322 validation is neither
// required nor desirable here.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the trimmed length of `value` falls within [min, max] inclusive. */
function lengthInBounds(value: string, min: number, max: number): boolean {
  const length = value.trim().length;
  return length >= min && length <= max;
}

/** True when `value` is a plausible email of 1-254 characters. */
function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 254) return false;
  return EMAIL_PATTERN.test(trimmed);
}

/**
 * Validate an add-a-junior form.
 *
 * Accepts the form only when every field satisfies its bounds:
 * caregiver name (1-100), caregiver email (valid format, 1-254),
 * caregiver phone (7-20), child first name (1-50), child last name (1-50).
 * Otherwise it rejects and reports EVERY field that is invalid, in a stable
 * order, so the UI can flag them all at once while retaining entered values.
 */
export function validateAddJunior(form: AddJuniorForm): ValidateAddJuniorResult {
  const invalid: Record<FieldError, boolean> = {
    caregiverName: !lengthInBounds(form.caregiverName, 1, 100),
    caregiverEmail: !isValidEmail(form.caregiverEmail),
    caregiverPhone: !lengthInBounds(form.caregiverPhone, 7, 20),
    childFirstName: !lengthInBounds(form.childFirstName, 1, 50),
    childLastName: !lengthInBounds(form.childLastName, 1, 50),
  };

  const errors = FIELD_ORDER.filter((field) => invalid[field]);

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Caregiver-only contact validation (Requirement 7.5,
// streamlined-invites-and-child-access Task 9)
// ---------------------------------------------------------------------------

/**
 * A caregiver's own contact details, with no accompanying child fields —
 * what `AddCaregiverModal.tsx` collects when an admin (or, for a child's
 * first caregiver, a Coach/Manager) adds an ADDITIONAL caregiver to a child
 * that already exists, as opposed to `AddJuniorForm` above, which always
 * pairs a caregiver with a brand-new child being created at the same time.
 */
export interface CaregiverContactFields {
  name: string; // 1-100 characters
  email: string; // valid email format, 1-254 characters
  phone: string; // 7-20 characters
}

export type CaregiverContactFieldError = keyof CaregiverContactFields;

export type ValidateCaregiverContactResult =
  | { ok: true }
  | { ok: false; errors: CaregiverContactFieldError[] };

const CAREGIVER_CONTACT_FIELD_ORDER: CaregiverContactFieldError[] = ['name', 'email', 'phone'];

/**
 * Validate a caregiver's contact fields in isolation, using the exact same
 * bounds `validateAddJunior` applies to its `caregiverName`/`caregiverEmail`/
 * `caregiverPhone` fields (same `lengthInBounds`/`isValidEmail` helpers,
 * same limits) — kept as a separate function rather than changing
 * `validateAddJunior` itself, since that function is an already-shipped,
 * untested flow this task has no reason to touch.
 */
export function validateCaregiverContactFields(
  form: CaregiverContactFields
): ValidateCaregiverContactResult {
  const invalid: Record<CaregiverContactFieldError, boolean> = {
    name: !lengthInBounds(form.name, 1, 100),
    email: !isValidEmail(form.email),
    phone: !lengthInBounds(form.phone, 7, 20),
  };

  const errors = CAREGIVER_CONTACT_FIELD_ORDER.filter((field) => invalid[field]);

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Caregiver reuse / idempotency (Req 5.5, 5.7)
// ---------------------------------------------------------------------------

/** Minimal view of an existing user row needed to resolve a caregiver. */
export interface ExistingUserRef {
  id: string;
  email: string;
}

export type CaregiverResolution =
  | { action: 'reuse'; caregiverId: string }
  | { action: 'create' };

/**
 * Resolve the caregiver `users` row for a submitted email.
 *
 * If a row already exists with a matching email (case-insensitive, trimmed),
 * reuse it rather than creating a duplicate (Req 5.5). Otherwise signal that a
 * new caregiver row must be created.
 */
export function resolveCaregiver(
  email: string,
  existingUsers: ExistingUserRef[]
): CaregiverResolution {
  const normalized = email.trim().toLowerCase();
  const match = existingUsers.find(
    (user) => user.email.trim().toLowerCase() === normalized
  );
  return match ? { action: 'reuse', caregiverId: match.id } : { action: 'create' };
}

/** Minimal view of an existing player_caregivers link. */
export interface CaregiverLinkRef {
  player_id: string;
  caregiver_id: string;
}

export type LinkResolution = { action: 'reuse' } | { action: 'create' };

/**
 * Decide whether a `player_caregivers` link needs creating.
 *
 * Returns `reuse` when a link between this child and caregiver already exists,
 * so no duplicate link is created (Req 5.7); otherwise `create`.
 */
export function resolveCaregiverLink(
  playerId: string,
  caregiverId: string,
  existingLinks: CaregiverLinkRef[]
): LinkResolution {
  const exists = existingLinks.some(
    (link) => link.player_id === playerId && link.caregiver_id === caregiverId
  );
  return exists ? { action: 'reuse' } : { action: 'create' };
}

// ---------------------------------------------------------------------------
// Confirm-or-correct a pending child's details before approving
// (streamlined-invites-and-child-access, Decision 1)
// ---------------------------------------------------------------------------

/**
 * A caregiver's editable confirm-or-correct copy of a pending child's
 * identifying details, seeded from whatever the Manager typed into Add
 * Player — a routing guess nobody who actually knows the child has
 * confirmed. Shared by `TeamPage.tsx`'s inline roster-row Accept action and
 * `respond-junior-approval`'s own request body shape (`first_name`/
 * `last_name`/`date_of_birth`), extracted here (2026-08-28) so the
 * validation these both need lives in one tested place instead of being
 * copied a third time — it previously existed only inline in
 * `CaregiverApprovalPage.tsx`, the dedicated Approvals page Decision 1
 * retires in favour of this roster-row flow.
 */
export interface ChildEdit {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

/** Per-field validation errors for one `ChildEdit`. */
export interface ChildEditErrors {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}

/**
 * Validate a child edit before it's sent to `respond-junior-approval`.
 *
 * Deliberately no age-threshold check here (e.g. rejecting a corrected DOB
 * that would make the child 16+) — that's a real question worth deciding
 * separately, not something to bake in silently. Today this only confirms
 * the caregiver typed *something plausible*, the same bar Add Player's own
 * form applies.
 */
export function validateChildEdit(edit: ChildEdit): ChildEditErrors {
  const errors: ChildEditErrors = {};
  if (!lengthInBounds(edit.firstName, 1, 50)) errors.firstName = 'Enter a first name.';
  if (!lengthInBounds(edit.lastName, 1, 50)) errors.lastName = 'Enter a last name.';
  if (!isValidDateOfBirth(edit.dateOfBirth)) {
    errors.dateOfBirth = "Enter a valid date of birth that isn't in the future.";
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Consent lifecycle (Req 5.10, 5.11, 5.12)
// ---------------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'escalated';

/** Derived UI/data state for a child based on its consent approval status. */
export interface ChildState {
  /** Whether the child `users` row is active. */
  active: boolean;
  /** Whether the child may be selected (e.g. for lineups). */
  selectable: boolean;
}

/**
 * Derive a child's activation/selectability from its approval status (Req 5.10):
 * - `pending`   => inactive & non-selectable (greyed, pending indicator)
 * - `approved`  => active & selectable
 * - `denied`    => inactive & non-selectable
 * - `escalated` => inactive & non-selectable
 */
export function deriveChildState(approvalStatus: ApprovalStatus): ChildState {
  const active = approvalStatus === 'approved';
  return { active, selectable: active };
}

export type ConsentDecision = 'approve' | 'deny' | 'escalate';

/** The persisted outcome of a caregiver's consent decision. */
export interface ConsentOutcome {
  /** New status for the caregiver_approvals row. */
  status: Extract<ApprovalStatus, 'approved' | 'denied' | 'escalated'>;
  /** ISO timestamp recorded on the approval row. */
  respondedAt: string;
  /** Whether the child `users` row should be active after this decision. */
  childActive: boolean;
}

/**
 * Apply a caregiver's consent decision to a pending request (Req 5.11, 5.12).
 *
 * - `approve` sets status `approved`, records `respondedAt`, and activates the child.
 * - `deny` sets status `denied`, records `respondedAt`, and keeps the child inactive.
 * - `escalate` sets status `escalated`, records `respondedAt`, and keeps the child inactive.
 */
export function applyConsentDecision(
  decision: ConsentDecision,
  respondedAt: string
): ConsentOutcome {
  switch (decision) {
    case 'approve':
      return { status: 'approved', respondedAt, childActive: true };
    case 'deny':
      return { status: 'denied', respondedAt, childActive: false };
    case 'escalate':
      return { status: 'escalated', respondedAt, childActive: false };
  }
}

// ---------------------------------------------------------------------------
// Provenance (Req 5.16)
// ---------------------------------------------------------------------------

export type TeamType = 'club_tournament' | 'external_league';
export type ChildProvenance = 'club_tournament' | 'external_league';

/**
 * Record the provenance of a child based on the team it originates from
 * (Req 5.16): a Club Tournament self-service addition or an External League
 * import.
 */
export function assignChildProvenance(teamType: TeamType): ChildProvenance {
  return teamType === 'external_league' ? 'external_league' : 'club_tournament';
}

// ---------------------------------------------------------------------------
// External-league caregiver linkage (Req 5.15)
// ---------------------------------------------------------------------------

/** A child together with the caregivers it is linked to. */
export interface ChildCaregiverLinkage {
  childId: string;
  caregiverIds: string[];
}

/** True when a single child is linked to at least one caregiver. */
export function childHasCaregiver(child: ChildCaregiverLinkage): boolean {
  return child.caregiverIds.length > 0;
}

/**
 * True when every child is linked to at least one caregiver (Req 5.15).
 *
 * An empty set trivially satisfies the invariant. Used to assert that External
 * League child records always have a caregiver contact for notifications.
 */
export function everyChildLinkedToCaregiver(
  children: ChildCaregiverLinkage[]
): boolean {
  return children.every(childHasCaregiver);
}
