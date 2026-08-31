import { useState } from 'react';
import { rolesApi } from '../../lib/roles-api';
import { ApiError } from '../../lib/api-client';

/**
 * Two-step "Remove" confirmation for one (person, role, team) association —
 * the roster page's new undo mechanism (product decision 2026-08-31,
 * replacing Deactivate for this purpose — see `permissions-logic.ts`'s
 * `canRemoveTeamMember` doc comment for the full rationale and rule set).
 *
 * Mirrors `RemoveMyCaregiverModal.tsx`'s pattern deliberately: one explicit
 * confirm step with plain-language consequence copy, nothing written on the
 * trigger click alone. Reachable only when `canRemoveTeamMember` is true for
 * the row/role in question — `TeamPage.tsx` never renders this modal's
 * trigger otherwise — but the real authorization is re-derived server-side
 * by `remove-team-member` regardless of how this modal was reached.
 */
interface RemoveTeamMemberModalProps {
  membershipId: string;
  memberName: string;
  roleLabel: string;
  isOwnRow: boolean;
  onClose: () => void;
  onSuccess: (cascadedCaregiverRemoval: boolean) => void;
}

export function RemoveTeamMemberModal({
  membershipId,
  memberName,
  roleLabel,
  isOwnRow,
  onClose,
  onSuccess,
}: RemoveTeamMemberModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await rolesApi.removeTeamMemberSecure(membershipId);
      onSuccess(result.cascadedCaregiverRemoval);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : 'Could not remove this team member. Please try again.'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-team-member-title"
    >
      <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col">
        <div className="p-6 pb-4 border-b border-gray-200">
          <h2 id="remove-team-member-title" className="text-xl font-bold text-gray-900 mb-1">
            Remove {roleLabel}
          </h2>
        </div>

        <div className="p-6 flex-1 space-y-3">
          <p className="text-sm text-gray-700">
            {isOwnRow ? (
              <>
                This will remove you as {roleLabel} on this team. This can't be undone from here —
                you'd need to be added back to regain this role.
              </>
            ) : (
              <>
                This will permanently remove {memberName} as {roleLabel} on this team. This can't be
                undone from here — they'd need to be added back to regain this role.
              </>
            )}
          </p>
          <p className="text-sm text-gray-700">
            Any other roles {isOwnRow ? 'you hold' : `${memberName} holds`} on this team, or on
            other teams, are not affected.
          </p>

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
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
