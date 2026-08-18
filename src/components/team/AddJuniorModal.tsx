// Feature: post-registration-welcome-and-team-page
//
// Add-a-Junior modal (Req 5.1, 5.2, 5.3). Presented only to permitted users on
// a Club Tournament team — the parent Team Page gates visibility; this modal
// renders the form and submits via `caregivers-api.addJunior`.
//
// It captures caregiver name/email/phone and child first/last name ONLY — no
// child contact details, date of birth, or photo (Req 5.2). On an invalid
// submit it rejects, RETAINS the entered values, and flags every invalid field
// (Req 5.3) using the pure `validateAddJunior` errors surfaced by `addJunior`.

import { useEffect, useState } from 'react';
import { caregiversApi } from '../../lib/caregivers-api';
import type { AddJuniorForm, FieldError } from '../../lib/add-junior-logic';

interface AddJuniorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a junior is successfully added (approval request created). */
  onSuccess?: () => void;
  /** The Club Tournament team the junior is being added to. */
  teamId: string;
}

/** Empty form — only the five permitted fields (Req 5.1, 5.2). */
const EMPTY_FORM: AddJuniorForm = {
  caregiverName: '',
  caregiverEmail: '',
  caregiverPhone: '',
  childFirstName: '',
  childLastName: '',
};

/** Human-readable labels used both for inputs and per-field error messages. */
const FIELD_LABELS: Record<FieldError, string> = {
  caregiverName: 'Caregiver name',
  caregiverEmail: 'Caregiver email',
  caregiverPhone: 'Caregiver phone',
  childFirstName: "Child's first name",
  childLastName: "Child's last name",
};

/** Validation hint shown beside a flagged field so the user knows the bound. */
const FIELD_HINTS: Record<FieldError, string> = {
  caregiverName: 'Enter a name of 1–100 characters.',
  caregiverEmail: 'Enter a valid email of 1–254 characters.',
  caregiverPhone: 'Enter a phone number of 7–20 characters.',
  childFirstName: 'Enter a first name of 1–50 characters.',
  childLastName: 'Enter a last name of 1–50 characters.',
};

export function AddJuniorModal({ isOpen, onClose, onSuccess, teamId }: AddJuniorModalProps) {
  const [form, setForm] = useState<AddJuniorForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state whenever the modal opens so a fresh add starts clean.
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM);
      setFieldErrors([]);
      setSubmitError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateField = (field: keyof AddJuniorForm, value: string) => {
    // Retain values and clear that field's error as the user corrects it.
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => prev.filter((f) => f !== field));
  };

  const hasError = (field: FieldError) => fieldErrors.includes(field);

  const handleSubmit = async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const result = await caregiversApi.addJunior(teamId, form);
      if (!result.ok) {
        // Reject, retain values, flag invalid fields (Req 5.3).
        setFieldErrors(result.errors);
        setIsSubmitting(false);
        return;
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not add the junior. Please try again.'
      );
      setIsSubmitting(false);
    }
  };

  const inputClass = (field: FieldError) =>
    `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#0091f3] focus:border-transparent ${
      hasError(field) ? 'border-red-500 bg-red-50' : 'border-gray-300'
    }`;

  const renderField = (
    field: FieldError,
    type: 'text' | 'email' | 'tel',
    autoComplete?: string
  ) => (
    <div>
      <label htmlFor={`add-junior-${field}`} className="block text-sm font-medium text-gray-700 mb-2">
        {FIELD_LABELS[field]}
      </label>
      <input
        id={`add-junior-${field}`}
        type={type}
        value={form[field]}
        autoComplete={autoComplete}
        aria-invalid={hasError(field)}
        aria-describedby={hasError(field) ? `add-junior-${field}-error` : undefined}
        onChange={(e) => updateField(field, e.target.value)}
        className={inputClass(field)}
      />
      {hasError(field) && (
        <p id={`add-junior-${field}-error`} className="mt-1 text-sm text-red-600">
          {FIELD_HINTS[field]}
        </p>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 pb-24"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-junior-title"
    >
      <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[calc(100vh-7rem)] overflow-y-auto">
        <h2 id="add-junior-title" className="text-xl font-bold text-gray-900 mb-1">
          Add a Junior
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          We'll ask the caregiver to confirm before the child is added to the team.
        </p>

        <div className="space-y-4">
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900 mb-1">Caregiver</legend>
            {renderField('caregiverName', 'text', 'name')}
            {renderField('caregiverEmail', 'email', 'email')}
            {renderField('caregiverPhone', 'tel', 'tel')}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900 mb-1">Child</legend>
            {renderField('childFirstName', 'text')}
            {renderField('childLastName', 'text')}
          </fieldset>
        </div>

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

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-[#0091f3] text-white rounded-lg hover:bg-[#0077cc] disabled:opacity-50"
          >
            {isSubmitting ? 'Adding...' : 'Add Junior'}
          </button>
        </div>
      </div>
    </div>
  );
}
