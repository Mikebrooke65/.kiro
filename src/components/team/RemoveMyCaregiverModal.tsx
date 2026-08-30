import { useState } from 'react';
import { caregiversApi } from '../../lib/caregivers-api';
import { ApiError } from '../../lib/api-client';

/**
 * Self-service "end my caregiver relationship" confirmation, for a player
 * who is 16 or older and still has one or more caregivers linked
 * (2026-08-30, Task 12 item 4 follow-up —
 * `.kiro/specs/streamlined-invites-and-child-access/`).
 *
 * Reachable only when `roster-logic.ts`'s `canSelfRemoveCaregiver` is true
 * for the viewer's own row — `TeamPage.tsx` never shows this modal's
 * trigger for anyone else's row, or for a viewer under 16. The write itself
 * (`unlinkCaregiverFromPlayer`, already used by the admin-facing "Manage
 * Caregivers" flow) is re-gated at the data layer regardless, by migration
 * 062's new `player_caregivers` DELETE policy — a player may only ever
 * delete a link where `player_id = auth.uid()` and their own recorded date
 * of birth clears 16, so this modal being reachable is not itself the
 * authorization.
 *
 * One explicit confirm step, per product decision 2026-08-30: clicking the
 * trigger opens this modal with plain-language copy explaining the
 * consequence (the caregiver loses visibility into the player's activity)
 * before anything is written — nothing happens on the trigger click alone.
 *
 * Removes every linked caregiver at once rather than one at a time: the
 * intent behind this action is "I no longer want a caregiver overseeing my
 * account," not fine-grained per-caregiver management (that's what the
 * separate admin-facing "Manage Caregivers" flow is for).
 */
interface RemoveMyCaregiverModalProps {
  playerId: string;
  caregivers: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSuccess: () => void;
}

export function RemoveMyCaregiverModal({
  playerId,
  caregivers,
  onClose,
  onSuccess,
}: RemoveMyCaregiverModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const names = caregivers.map((c) => c.name || 'your caregiver').join(' and ');

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // Best-effort across multiple links: if one fails partway through,
      // report it rather than silently stopping — the ones already removed
      // stay removed (each is its own independent row/trigger firing), and
      // `onSuccess`'s roster refresh will show exactly what's left.
      for (const caregiver of caregivers) {
        await caregiversApi.unlinkCaregiverFromPlayer(caregiver.id, playerId);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : 'Could not remove your caregiver. Please try again.'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-my-caregiver-title"
    >
      <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col">
        <div className="p-6 pb-4 border-b border-gray-200">
          <h2 id="remove-my-caregiver-title" className="text-xl font-bold text-gray-900 mb-1">
            Remove My Caregiver
          </h2>
        </div>

        <div className="p-6 flex-1 space-y-3">
          <p className="text-sm text-gray-700">
            As you're 16 or older, you can remove {names} as your caregiver in this app.
          </p>
          <p className="text-sm text-gray-700">
            Once removed, they'll no longer be able to see your activity on this app. If you
            change your mind later, you'll need to ask your team's Manager to add a caregiver
            back.
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
            {isSubmitting ? 'Removing...' : 'Remove Caregiver'}
          </button>
        </div>
      </div>
    </div>
  );
}
