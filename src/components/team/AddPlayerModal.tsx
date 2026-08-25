// Add Player modal (Requirement 1) — replaces `AddJuniorModal.tsx`.
//
// Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 10)
//
// Captures first name, last name, and a routing date of birth (Req 1.2), then
// branches on `routeAddPlayer`: Adult reveals an email field and sends a
// self-registration invite (Req 1.5, Requirement 3); Junior reveals the
// existing caregiver name/email/phone fields and reuses `caregivers-api.
// addJunior` (Req 1.6, Requirement 4). Neither path captures contact details
// or a photo for the person being added (Req 1.4). A plain confirmation step
// restates the entered DOB and which path it will take before either submit
// actually fires (Req 1.7), so a Manager can catch a mis-typed DOB before an
// invite goes out or a caregiver request is sent.

import { useEffect, useState } from 'react';
import { caregiversApi } from '../../lib/caregivers-api';
import { invitesApi } from '../../lib/invites-api';
import { emailApi } from '../../lib/email-api';
import {
  routeAddPlayer,
  validateAddPlayerForm,
  type AddPlayerForm,
  type AddPlayerFieldError,
  type AddPlayerRoute,
} from '../../lib/add-player-logic';

/** Outcome reported to the parent so it can show a tailored confirmation. */
export type AddPlayerOutcome =
  | { route: 'adult'; emailFailed: boolean }
  | { route: 'junior'; caregiverInvited: boolean };

interface AddPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a player is successfully added. */
  onSuccess?: (outcome: AddPlayerOutcome) => void;
  /** The Club Tournament team the player is being added to. */
  teamId: string;
  /** `{age_group} {name}`, for the invite/notification emails. */
  teamLabel: string;
}

const EMPTY_FORM: AddPlayerForm = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  email: '',
  caregiverName: '',
  caregiverEmail: '',
  caregiverPhone: '',
};

const FIELD_LABELS: Record<AddPlayerFieldError, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  dateOfBirth: 'Date of birth',
  email: 'Email',
  caregiverName: 'Caregiver name',
  caregiverEmail: 'Caregiver email',
  caregiverPhone: 'Caregiver phone',
};

const FIELD_HINTS: Record<AddPlayerFieldError, string> = {
  firstName: 'Enter a first name of 1–50 characters.',
  lastName: 'Enter a last name of 1–50 characters.',
  dateOfBirth: "Enter a valid date of birth that isn't in the future.",
  email: 'Enter a valid email of 1–254 characters.',
  caregiverName: 'Enter a name of 1–100 characters.',
  caregiverEmail: 'Enter a valid email of 1–254 characters.',
  caregiverPhone: 'Enter a phone number of 7–20 characters.',
};

type Stage = 'form' | 'confirm';

/** Today as `yyyy-mm-dd`, for the date input's `max` (a DOB can't be in the future). */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function AddPlayerModal({
  isOpen,
  onClose,
  onSuccess,
  teamId,
  teamLabel,
}: AddPlayerModalProps) {
  const [form, setForm] = useState<AddPlayerForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<AddPlayerFieldError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<Stage>('form');

  // Reset state whenever the modal opens so a fresh add starts clean.
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM);
      setFieldErrors([]);
      setSubmitError(null);
      setIsSubmitting(false);
      setStage('form');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Live routing preview (Req 1.5/1.6) — provisional only; re-derived from
  // scratch at confirm-and-submit time too, so nothing here is trusted as
  // the final decision.
  const route: AddPlayerRoute = routeAddPlayer({ dateOfBirth: form.dateOfBirth });

  const updateField = (field: keyof AddPlayerForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => prev.filter((f) => f !== field));
  };

  const hasError = (field: AddPlayerFieldError) => fieldErrors.includes(field);

  /** Move from the form to the confirmation step (Req 1.7), or reject (Req 1.3). */
  const handleContinue = () => {
    setSubmitError(null);
    const validation = validateAddPlayerForm(form, route);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors([]);
    setStage('confirm');
  };

  const handleBack = () => {
    setStage('form');
  };

  const handleConfirm = async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      // Re-validate and re-route from the current form state — the only
      // values trusted at submit time, regardless of what was true when
      // "Continue" was clicked.
      const finalRoute = routeAddPlayer({ dateOfBirth: form.dateOfBirth });
      const validation = validateAddPlayerForm(form, finalRoute);
      if (!validation.ok) {
        setFieldErrors(validation.errors);
        setStage('form');
        setIsSubmitting(false);
        return;
      }

      if (finalRoute === 'adult') {
        // Requirement 3.1/3.2 — reuses generateInviteCode exactly as the
        // first-Manager flow does; no new invite mechanism.
        const email = form.email.trim().toLowerCase();
        const invite = await invitesApi.generateInviteCode(
          teamId,
          email,
          undefined,
          undefined,
          'player',
          undefined,
          form.firstName.trim(),
          form.lastName.trim()
        );
        let emailFailed = false;
        try {
          await emailApi.sendTeamInvite({
            to: email,
            recipientName: form.firstName.trim(),
            teamName: teamLabel,
            inviteCode: invite.code,
          });
        } catch (err) {
          // The invite exists either way; a send failure is surfaced to the
          // Manager (below) but doesn't undo the invite (mirrors addJunior's
          // own fire-and-forget email handling).
          emailFailed = true;
          console.warn('Failed to send adult self-registration invite email:', err);
        }
        onSuccess?.({ route: 'adult', emailFailed });
      } else {
        const result = await caregiversApi.addJunior(
          teamId,
          {
            caregiverName: form.caregiverName,
            caregiverEmail: form.caregiverEmail,
            caregiverPhone: form.caregiverPhone,
            childFirstName: form.firstName,
            childLastName: form.lastName,
          },
          form.dateOfBirth
        );
        if (!result.ok) {
          // Server-side validation disagreed with the client's (shouldn't
          // normally happen — defense in depth). Map back to the form stage.
          setFieldErrors(
            result.errors.map((f): AddPlayerFieldError =>
              f === 'childFirstName' ? 'firstName' : f === 'childLastName' ? 'lastName' : f
            )
          );
          setStage('form');
          setIsSubmitting(false);
          return;
        }
        onSuccess?.({ route: 'junior', caregiverInvited: result.caregiverInvited });
      }

      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not add the player. Please try again.'
      );
      setIsSubmitting(false);
    }
  };

  const inputClass = (field: AddPlayerFieldError) =>
    `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#0091f3] focus:border-transparent ${
      hasError(field) ? 'border-red-500 bg-red-50' : 'border-gray-300'
    }`;

  const renderField = (
    field: AddPlayerFieldError,
    type: 'text' | 'email' | 'tel' | 'date',
    autoComplete?: string
  ) => (
    <div>
      <label htmlFor={`add-player-${field}`} className="block text-sm font-medium text-gray-700 mb-2">
        {FIELD_LABELS[field]}
      </label>
      <input
        id={`add-player-${field}`}
        type={type}
        value={form[field]}
        autoComplete={autoComplete}
        max={type === 'date' ? todayIso() : undefined}
        aria-invalid={hasError(field)}
        aria-describedby={hasError(field) ? `add-player-${field}-error` : undefined}
        onChange={(e) => updateField(field, e.target.value)}
        className={inputClass(field)}
      />
      {hasError(field) && (
        <p id={`add-player-${field}-error`} className="mt-1 text-sm text-red-600">
          {FIELD_HINTS[field]}
        </p>
      )}
    </div>
  );

  const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim() || 'this person';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-player-title"
    >
      <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col">
        {/* Header (pinned) */}
        <div className="p-6 pb-4 border-b border-gray-200">
          <h2 id="add-player-title" className="text-xl font-bold text-gray-900 mb-1">
            {stage === 'form' ? 'Add Player' : 'Confirm'}
          </h2>
          <p className="text-sm text-gray-500">
            {stage === 'form'
              ? 'Age 16 or over sends a self-registration invite. Under 16 asks a caregiver to consent, same as before.'
              : 'Review before this goes out — the date of birth decides which path is taken.'}
          </p>
        </div>

        {/* Scrollable body */}
        <div className="p-6 overflow-y-auto flex-1">
          {stage === 'form' ? (
            <div className="space-y-4">
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-gray-900 mb-1">Player</legend>
                {renderField('firstName', 'text')}
                {renderField('lastName', 'text')}
                {renderField('dateOfBirth', 'date')}
              </fieldset>

              {route === 'adult' ? (
                <fieldset className="space-y-4">
                  <legend className="text-sm font-semibold text-gray-900 mb-1">
                    Adult — self-registration
                  </legend>
                  {renderField('email', 'email', 'email')}
                </fieldset>
              ) : (
                <fieldset className="space-y-4">
                  <legend className="text-sm font-semibold text-gray-900 mb-1">Caregiver</legend>
                  {renderField('caregiverName', 'text', 'name')}
                  {renderField('caregiverEmail', 'email', 'email')}
                  {renderField('caregiverPhone', 'tel', 'tel')}
                </fieldset>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <span className="font-semibold text-gray-900">{fullName}</span>, born{' '}
                {form.dateOfBirth || '—'}.
              </p>
              {route === 'adult' ? (
                <p>
                  This is an <span className="font-semibold">Adult</span> — a self-registration
                  invite will be sent to <span className="font-medium">{form.email.trim()}</span>{' '}
                  to join {teamLabel} as a player. They'll set up their own account.
                </p>
              ) : (
                <p>
                  This is a <span className="font-semibold">Junior</span> — a request will be sent
                  to caregiver{' '}
                  <span className="font-medium">
                    {form.caregiverName.trim()} ({form.caregiverEmail.trim()})
                  </span>{' '}
                  to consent before {fullName} is added to {teamLabel}.
                </p>
              )}
              <p className="text-gray-500">
                Not right? Go back and check the date of birth — it's what decides the path above.
              </p>
            </div>
          )}

          {fieldErrors.length > 0 && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              Please correct the highlighted field{fieldErrors.length > 1 ? 's' : ''}.
            </p>
          )}
          {submitError && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {submitError}
            </p>
          )}
        </div>

        {/* Footer (pinned) */}
        <div className="p-6 pt-4 border-t border-gray-200 flex gap-3">
          {stage === 'form' ? (
            <>
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleContinue}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-[#0091f3] text-white rounded-lg hover:bg-[#0077cc] disabled:opacity-50"
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-[#22c55e] text-white rounded-lg hover:bg-[#1ea34d] disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Sending...'
                  : route === 'adult'
                    ? 'Send Invite'
                    : 'Send Caregiver Request'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
