import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { caregiversApi } from '../lib/caregivers-api';
import type { CaregiverApprovalWithPlayer } from '../lib/caregivers-api';

export function CaregiverApprovalPage() {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<CaregiverApprovalWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) loadApprovals();
  }, [user?.id]);

  const loadApprovals = async () => {
    try {
      const data = await caregiversApi.getMyPendingApprovals(user!.id);
      setApprovals(data);
    } catch (e) {
      console.error('Failed to load approvals:', e);
    } finally {
      setLoading(false);
    }
  };

  // 'add_child' rows are an add-a-junior consent request — the caregiver is
  // approving a *child* being added, not consenting to be added themself —
  // so they go through the dedicated Edge-Function-backed flow, which is
  // the only path that activates the child and adds them to the roster.
  // 'add_caregiver' rows keep the legacy behaviour.
  const handleRespond = async (approval: CaregiverApprovalWithPlayer, approved: boolean) => {
    setResponding(approval.id);
    setRespondError(null);
    try {
      if (approval.request_kind === 'add_child') {
        if (approved) {
          await caregiversApi.approveJunior(approval.id, user!.id);
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
            return (
              <div key={approval.id} className="bg-white rounded-lg shadow p-4">
                {isAddChild ? (
                  <>
                    <p className="font-medium">{childName}</p>
                    <p className="text-sm text-gray-500 mb-3">
                      You've been listed as a caregiver for {childName} joining the team.
                      Approve to confirm and add them to the roster.
                    </p>
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
