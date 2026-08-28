import { useState } from 'react';
import {
  validateCaregiverContactFields,
  type CaregiverContactFieldError,
} from '../../lib/add-junior-logic';
import { caregiversApi } from '../../lib/caregivers-api';
import { ApiError } from '../../lib/api-client';

/**
 * Add an ADDITIONAL caregiver to a child that already has a `users` row —
 * Requirement 7.5 (`streamlined-invites-and-child-access`, Task 9). Unlike
 * `AddPlayerModal`'s Junior branch (which creates a brand-new child AND its
 * first caregiver together), this modal only ever attaches a caregiver to
 * an EXISTING child, so it collects nothing about the child at all.
 *
 * Whether this modal is even reachable is decided by the caller via
 * `canAddCaregiver` (`permissions-logic.ts`) — a Coach/Manager only sees the
 * trigger for a child with zero caregivers, an Admin always does. The
 * actual write (`caregiversApi.addCaregiverToExistingChild`) is
 * authorization-checked again at the data layer regardless (migration 056),
 * so this modal never needs to re-derive that decision itself.
 */
interface AddCaregiverModalProps {
  teamId: string;
  childId: string;
  childName: string;
  onClose: () => void;
  onSuccess: (outcome: { invited: boolean }) => void;
}

const FIELD_LABELS: Record<CaregiverContactFieldError, string> = {
  name: "Caregiver's name",
  email: "Caregiver's email",
  phone: "Caregiver's phone",
};

const FIELD_HINTS: Record<CaregiverContactFieldError, string> = {
  name: 'Enter a name up to 100 characters.',
  email: 'Enter a valid email address.',
  phone: 'Enter a phone number (7-20 characters).',
};

export function AddCaregiverModal({
  teamId,
  childId,
  childName,
  onClose,
  onSuccess,
}: AddCaregiverModalProps) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [fieldErrors, setFieldErrors] = useState<CaregiverContactFieldError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasError = (field: CaregiverContactFieldError) => fieldErrors.includes(field);

  const updateField = (field: CaregiverContactFieldError, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors.length > 0) setFieldErrors([]);
  };

  const inputClass = (field: CaregiverContactFieldError) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
      hasError(field)
        ? 'border-red-300 focus:ring-red-200'
        : 'border-gray-300 focus:ring-[#0091f3]/30'
    }`;

  const renderField = (field: CaregiverContactFieldError, type: 'text' | 'email' | 'tel') => (
    <div>
      <label
        htmlFor={`add-caregiver-${field}`}
        className="block text-sm font-medium text-gray-700 mb-2"
      >
        {FIELD_LABELS[field]}
      </label>
      <input
        id={`add-caregiver-${field}`}
        type={type}
        value={form[field]}
        aria-invalid={hasError(field)}
        aria-describedby={hasError(field) ? `add-caregiver-${field}-error` : undefined}
        onChange={(e) => updateField(field, e.target.value)}
        className={inputClass(field)}
      />
      {hasError(field) && (
        <p id={`add-caregiver-${field}-error`} className="mt-1 text-sm text-red-600">
          {FIELD_HINTS[field]}
        </p>
      )}
    </div>
  );

  const handleSubmit = async () => {
    setSubmitError(null);
    const validation = validateCaregiverContactFields(form);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const outcome = await caregiversApi.addCaregiverToExistingChild(
        teamId,
        childId,
        childName,
        form
      );
      onSuccess(outcome);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : 'Could not add this caregiver. Please try again.'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-caregiver-title"
    >
      <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col">
        <div className="p-6 pb-4 border-b border-gray-200">
          <h2 id="add-caregiver-title" className="text-xl font-bold text-gray-900 mb-1">
            Add Caregiver
          </h2>
          <p className="text-sm text-gray-500">
            Link an additional caregiver to {childName}. If they already have an account, they're
            linked immediately; otherwise they'll get an invite to set one up.
          </p>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {renderField('name', 'text')}
          {renderField('email', 'email')}
          {renderField('phone', 'tel')}

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{submitError}</p>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 border-t border-gray-200 flex gap-3">
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
            {isSubmitting ? 'Adding...' : 'Add Caregiver'}
          </button>
        </div>
      </div>
    </div>
  );
}
