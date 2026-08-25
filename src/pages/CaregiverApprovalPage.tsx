import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { caregiversApi } from '../lib/caregivers-api';
import type { CaregiverApprovalWithPlayer } from '../lib/caregivers-api';
import { isValidDateOfBirth } from '../lib/success-screen-logic';

/** Local editable copy of a child's identifying details, keyed by approval id. */
interface ChildEdit {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

/** Per-field validation errors for one child edit, keyed the same way. */
interface ChildEditErrors {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}

/** Trimmed length within [min, max] — same bound `add-player-logic.ts` uses. */
function lengthInBounds(value: string, min: number, max: number): boolean {
  const length = value.trim().length;
  return length >= min && length <= max;
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
function validateChildEdit(edit: ChildEdit): ChildEditErrors {
  const errors: ChildEditErrors = {};
  if (!lengthInBounds(edit.firstName, 1, 50)) errors.firstName = 'Enter a first name.';
  if (!lengthInBounds(edit.lastName, 1, 50)) errors.lastName = 'Enter a last name.';
  if (!isValidDateOfBirth(edit.dateOfBirth)) {
    errors.dateOfBirth = "Enter a valid date of birth that isn't in the future.";
  }
  return errors;
}

export function CaregiverApprovalPage() {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<CaregiverApprovalWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  // The caregiver's confirmed-or-corrected copy of each pending child's name
  // and DOB (Req: UX follow-up 2026-08-25). Seeded from the Manager's Add
  // Player entry when approvals load, then fully editable — that entry was
  // only ever a routing guess (Requirement 4.1), never confirmed by anyone
  // who actually knows the child, unlike an Adult's own self-declared DOB.
  const [edits, setEdits] = useState<Record<string, ChildEdit>>({});
  const [editErrors, setEditErrors] = useState<Record<string, ChildEditErrors>>({});

  useEffect(() => {
    if (user?.id) loadApprovals();
  }, [user?.id]);

  const loadApprovals = async () => {
    try {
      const data = await caregiversApi.getMyPendingApprovals(user!.id);
      setApprovals(data);
      // Seed edit state for every add_child row from its current player
      // record — only for rows not already being edited (a reload shouldn't
      // clobber in-progress typing, though nothing today triggers one).
      setEdits(prev => {
        const next = { ...prev };
        for (const approval of data) {
          if (approval.request_kind === 'add_child' && !next[approval.id]) {
            next[approval.id] = {
              firstName: approval.player?.first_name ?? '',
              lastName: approval.player?.last_name ?? '',
              dateOfBirth: approval.player?.date_of_birth ?? '',
            };
          }
        }
        return next;
      });
    } catch (e) {
      console.error('Failed to load approvals:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateEdit = (approvalId: string, field: keyof ChildEdit, value: string) => {
    setEdits(prev => ({ ...prev, [approvalId]: { ...prev[approvalId], [field]: value } }));
    setEditErrors(prev => {
      if (!prev[approvalId]?.[field]) return prev;
      const { [field]: _removed, ...rest } = prev[approvalId];
      return { ...prev, [approvalId]: rest };
    });
  };

  // 'add_child' rows are an add-a-junior consent request — the caregiver is
  // approving a *child* being added, not consenting to be added themself —
  // so they go through the dedicated Edge-Function-backed flow, which is
  // the only path that activates the child and adds them to the roster.
  // 'add_caregiver' rows keep the legacy behaviour.
  const handleRespond = async (approval: CaregiverApprovalWithPlayer, approved: boolean) => {
    setRespondError(null);

    // Only an approval locks the child in, so only approve validates and
    // sends the caregiver's confirmed-or-corrected name/DOB. Deny/escalate
    // leave the child's record untouched, same as before this existed.
    let correction: ChildEdit | undefined;
    if (approval.request_kind === 'add_child' && approved) {
      const edit = edits[approval.id];
      const errors = edit ? validateChildEdit(edit) : {};
      if (!edit || Object.keys(errors).length > 0) {
        setEditErrors(prev => ({ ...prev, [approval.id]: errors }));
        return;
      }
      correction = edit;
    }

    setResponding(approval.id);
    try {
      if (approval.request_kind === 'add_child') {
        if (approved) {
          await caregiversApi.approveJunior(approval.id, user!.id, correction);
        } else {
          await caregiversApi.denyJunior(approval.id, user!.id);
        }
      } else {
        await caregiversApi.respondToApproval(approval.id, approved, user!.id);
      }
      setApprovals(prev => prev.filter(a => a.id !== approval.id));
    } catch (e) {
      console.error('Failed to respond:', e);
      setRespondError(e instanceof Error ? e.message : 'Failed to respond. Please try again.');
    } finally {
      setResponding(null);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading...</div>;

  return (
    <div className="p-4 pb-20">
      <h1 className="text-xl font-bold mb-4">Caregiver Approvals</h1>

      {respondError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {respondError}
        </div>
      )}

      {approvals.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">✓</p>
          <p>No pending approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map(approval => {
            const isAddChild = approval.request_kind === 'add_child';
            const childName = approval.player
              ? `${approval.player.first_name} ${approval.player.last_name}`.trim()
              : 'your child';
            const edit = edits[approval.id];
            const errors = editErrors[approval.id] ?? {};
            return (
              <div key={approval.id} className="bg-white rounded-lg shadow p-4">
                {isAddChild ? (
                  <>
                    <p className="font-medium">{childName}</p>
                    <p className="text-sm text-gray-500 mb-3">
                      You've been listed as a caregiver for {childName} joining the team.
                      Check their details below and approve to confirm and add them to the
                      roster.
                    </p>
                    {edit && (
                      <div className="space-y-3 mb-4">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              First name
                            </label>
                            <input
                              type="text"
                              value={edit.firstName}
                              onChange={e => updateEdit(approval.id, 'firstName', e.target.value)}
                              className={`w-full border rounded-lg px-3 py-2 text-sm ${
                                errors.firstName ? 'border-red-500 bg-red-50' : 'border-gray-300'
                              }`}
                            />
                            {errors.firstName && (
                              <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Last name</label>
                            <input
                              type="text"
                              value={edit.lastName}
                              onChange={e => updateEdit(approval.id, 'lastName', e.target.value)}
                              className={`w-full border rounded-lg px-3 py-2 text-sm ${
                                errors.lastName ? 'border-red-500 bg-red-50' : 'border-gray-300'
                              }`}
                            />
                            {errors.lastName && (
                              <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Date of birth
                          </label>
                          <input
                            type="date"
                            value={edit.dateOfBirth}
                            max={new Date().toISOString().slice(0, 10)}
                            onChange={e => updateEdit(approval.id, 'dateOfBirth', e.target.value)}
                            className={`w-full border rounded-lg px-3 py-2 text-sm ${
                              errors.dateOfBirth ? 'border-red-500 bg-red-50' : 'border-gray-300'
                            }`}
                          />
                          {errors.dateOfBirth && (
                            <p className="mt-1 text-xs text-red-600">{errors.dateOfBirth}</p>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          This was entered by whoever added {childName} — correct it here if
                          it's not quite right. Approving locks these details in.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-medium">
                      {approval.new_caregiver_first_name} {approval.new_caregiver_last_name}
                    </p>
                    <p className="text-sm text-gray-500 mb-3">
                      {approval.new_caregiver_email} wants to be added as a caregiver
                    </p>
                  </>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond(approval, true)}
                    disabled={responding === approval.id}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {responding === approval.id ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleRespond(approval, false)}
                    disabled={responding === approval.id}
                    className="flex-1 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50">
                    Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
