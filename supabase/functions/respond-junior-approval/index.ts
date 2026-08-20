// Edge Function: respond-junior-approval
//
// Service-role primitive that applies a caregiver's consent decision
// (approve/deny/escalate) to a pending add-a-junior request. It exists
// because two of the three writes a decision requires are not permitted by
// client-side RLS for the caregiver making the decision:
//
//   - `caregiver_approvals` UPDATE *is* already permitted client-side (the
//     caregiver is linked via `player_caregivers`) — see migration 036's
//     "Allow caregivers to respond to approvals" policy.
//   - `users` UPDATE (activating the child) is admin-only or self-only
//     (migrations 002/003/004) — the caregiver is neither, so flipping the
//     child's `active` flag needs service role.
//   - `team_members` INSERT (putting the approved child on the roster) is
//     admin/coach/manager-only or self-only (migrations 036/044) — the
//     caregiver is none of those for the child's row, so this also needs
//     service role.
//
// Rather than split the write across a client-side update and a
// service-role call, this function does all three together so a decision is
// atomic from the caller's point of view: either the whole thing lands, or
// none of it does, and the child never ends up "approved" but missing from
// the roster (the exact gap found while investigating this fix — the
// dedicated `respondToJuniorApproval` logic previously existed in
// `caregivers-api.ts` but was never wired to a service-role write and was
// never called by any UI; the only reachable Approve/Deny button used the
// generic legacy `respondToApproval`, which doesn't branch on
// `request_kind` and has no path to activate a child or create its
// `team_members` row at all).
//
// Authorization: the caller must be authenticated and either hold the
// club-wide admin role, or be linked to the request's child as a caregiver
// via `player_caregivers` — i.e. only the caregiver(s) actually asked for
// consent (or an admin) can respond.
//
// Requires (set via `supabase secrets set`): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (both are provided to Edge Functions by default).
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This call fails
// until `supabase functions deploy respond-junior-approval` has been run.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ConsentDecision = 'approve' | 'deny' | 'escalate';

interface RespondJuniorApprovalBody {
  approval_id: string;
  decision: ConsentDecision;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Mirrors `applyConsentDecision` in src/lib/add-junior-logic.ts. */
function outcomeFor(decision: ConsentDecision): { status: string; childActive: boolean } {
  switch (decision) {
    case 'approve':
      return { status: 'approved', childActive: true };
    case 'deny':
      return { status: 'denied', childActive: false };
    case 'escalate':
      return { status: 'escalated', childActive: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'No authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) {
      return json({ error: 'Malformed token' }, 401);
    }

    let callerId: string;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      callerId = payload.sub;
      if (!callerId) throw new Error('No sub in payload');
    } catch {
      return json({ error: 'Could not extract user ID from token' }, 401);
    }

    const body = (await req.json()) as RespondJuniorApprovalBody;
    if (!body?.approval_id || !['approve', 'deny', 'escalate'].includes(body?.decision)) {
      return json({ error: 'approval_id and a valid decision are required' }, 400);
    }

    // Load the approval row (service role — RLS is irrelevant here).
    const approvalResp = await fetch(
      `${SUPABASE_URL}/rest/v1/caregiver_approvals?id=eq.${body.approval_id}&select=id,player_id,team_id,status,request_kind`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    const approvalRows = await approvalResp.json();
    const approval = Array.isArray(approvalRows) ? approvalRows[0] : null;
    if (!approval) {
      return json({ error: 'Approval request not found' }, 404);
    }
    if (approval.request_kind !== 'add_child') {
      return json({ error: 'Not an add-a-junior consent request' }, 400);
    }
    if (approval.status !== 'pending') {
      return json({ error: 'This request has already been responded to' }, 409);
    }

    // Authorization: caller must be admin OR the caregiver linked to this child.
    const roleResp = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${callerId}&select=role`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    const roleData = await roleResp.json();
    const isAdmin = Array.isArray(roleData) && roleData[0]?.role === 'admin';

    let permitted = isAdmin;
    if (!permitted) {
      const linkResp = await fetch(
        `${SUPABASE_URL}/rest/v1/player_caregivers?player_id=eq.${approval.player_id}&caregiver_id=eq.${callerId}&select=player_id&limit=1`,
        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
      );
      const linkData = await linkResp.json();
      permitted = Array.isArray(linkData) && linkData.length > 0;
    }

    if (!permitted) {
      return json({ error: 'Only the linked caregiver or an Admin can respond to this request' }, 403);
    }

    const outcome = outcomeFor(body.decision);
    const respondedAt = new Date().toISOString();

    // 1. Update the approval row.
    const updateApprovalResp = await fetch(
      `${SUPABASE_URL}/rest/v1/caregiver_approvals?id=eq.${body.approval_id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          status: outcome.status,
          responded_by: callerId,
          responded_at: respondedAt,
        }),
      }
    );
    if (!updateApprovalResp.ok) {
      const err = await updateApprovalResp.json().catch(() => ({}));
      return json({ error: err.message || 'Failed to update approval' }, 400);
    }
    const updatedRows = await updateApprovalResp.json();
    const updatedApproval = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

    // 2. Activate (or keep inactive) the child.
    const updateUserResp = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${approval.player_id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ active: outcome.childActive }),
      }
    );
    if (!updateUserResp.ok) {
      const err = await updateUserResp.json().catch(() => ({}));
      return json({ error: err.message || 'Failed to update child status' }, 400);
    }

    // 3. On approval, put the child on the team roster (dedupe defensively).
    if (body.decision === 'approve' && approval.team_id) {
      const existingResp = await fetch(
        `${SUPABASE_URL}/rest/v1/team_members?team_id=eq.${approval.team_id}&user_id=eq.${approval.player_id}&select=id&limit=1`,
        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
      );
      const existing = await existingResp.json();
      const alreadyMember = Array.isArray(existing) && existing.length > 0;

      if (!alreadyMember) {
        const insertMemberResp = await fetch(`${SUPABASE_URL}/rest/v1/team_members`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            team_id: approval.team_id,
            user_id: approval.player_id,
            role: 'player',
          }),
        });
        if (!insertMemberResp.ok) {
          const err = await insertMemberResp.json().catch(() => ({}));
          return json({ error: err.message || 'Failed to add child to team roster' }, 400);
        }
      }
    }

    return json({ success: true, approval: updatedApproval });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
});
