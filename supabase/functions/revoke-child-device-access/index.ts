// Edge Function: revoke-child-device-access
//
// Spec: `.kiro/specs/streamlined-invites-and-child-access/` (Task 9,
// Requirement 7.5)
//
// The admin half of "removing a caregiver notifies an admin, who decides
// whether to revoke the child's device access." That notification alone
// (an `admin_action_items` row, migration 056's trigger) never revokes
// anything — Correctness Property 5 (design.md) is explicit that removal
// must never revoke as a side effect. This function is the explicit,
// separate action an admin takes if they decide to.
//
// Deliberately admin-only, unlike `generate-device-code` (any linked
// caregiver): the caller here is acting on an `admin_action_items` review,
// not on their own child, so "linked caregiver of this child" is the wrong
// check — it might even be the removed caregiver themselves in some other
// session. Club-wide admin is the only authority this decision is scoped to
// (requirements.md Section 7.5).
//
// Mechanism: rotates the child's auth password, exactly like
// `generate-device-code`'s own revocation step (see that file and design.md
// 7.4.6 for the full sourcing on why this kills an existing session by user
// id) — but WITHOUT creating a replacement code. The point here is "cut
// this off," not "hand out a new one"; a caregiver who still wants the
// child to have access issues a fresh code themselves afterward, same as
// any other time (Requirement 7.4.1).
//
// Also expires any still-unredeemed codes for this child, and — when
// `action_item_id` is passed — marks that `admin_action_items` row
// `actioned`, so the admin screen's "Revoke device access" button is a
// single call rather than two.
//
// No new secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
// injected into Edge Functions automatically.
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This is not live
// until `supabase functions deploy revoke-child-device-access` has been run.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Same as `generate-device-code`'s `randomPassword()` — duplicated rather
 *  than imported (no `_shared/` convention in this repo). */
function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('revoke-child-device-access misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
  }

  try {
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

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.error('revoke-child-device-access rejected: unparseable request body', error);
      return json({ error: 'Invalid request' }, 400);
    }

    const childUserId =
      body != null &&
      typeof body === 'object' &&
      typeof (body as { child_user_id?: unknown }).child_user_id === 'string'
        ? (body as { child_user_id: string }).child_user_id.trim()
        : '';
    const actionItemId =
      body != null &&
      typeof body === 'object' &&
      typeof (body as { action_item_id?: unknown }).action_item_id === 'string'
        ? (body as { action_item_id: string }).action_item_id.trim()
        : '';

    if (childUserId === '') {
      return json({ error: 'Invalid request' }, 400);
    }

    // --- Authorization: caller must be club-wide admin ---------------------
    const roleResp = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${callerId}&select=role`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    if (!roleResp.ok) {
      console.error(`revoke-child-device-access role lookup failed: ${roleResp.status} ${await roleResp.text()}`);
      return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
    }
    const roleRows = await roleResp.json();
    const isAdmin = Array.isArray(roleRows) && roleRows[0]?.role === 'admin';
    if (!isAdmin) {
      console.error(`revoke-child-device-access rejected: caller ${callerId} is not an admin`);
      return json({ error: 'Admin access required.' }, 403);
    }

    // --- Defense in depth: confirm this really is a child user -------------
    const childResp = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${childUserId}&select=id,is_child`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    if (!childResp.ok) {
      console.error(`revoke-child-device-access child lookup failed: ${childResp.status} ${await childResp.text()}`);
      return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
    }
    const childRows = await childResp.json();
    if (!Array.isArray(childRows) || childRows.length === 0 || !childRows[0]?.is_child) {
      console.error(`revoke-child-device-access rejected: ${childUserId} does not resolve to a child user`);
      return json({ error: 'This person does not have a child account.' }, 400);
    }

    // --- Revoke: rotate the password, same mechanism as generate-device-code
    const revokeResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${childUserId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: randomPassword() }),
    });
    if (!revokeResp.ok) {
      const err = await revokeResp.json().catch(() => ({}));
      console.error('revoke-child-device-access session revocation failed:', err);
      return json({ error: 'Could not revoke device access. Please try again.' }, 500);
    }

    // --- Expire any still-unredeemed codes for this child (defense in depth,
    // same as generate-device-code's own cleanup step; not fatal if it fails
    // since the revocation above already took effect). ----------------------
    const nowIso = new Date().toISOString();
    const expireResp = await fetch(
      `${SUPABASE_URL}/rest/v1/child_device_codes?child_user_id=eq.${childUserId}&redeemed_at=is.null`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ expires_at: nowIso }),
      }
    );
    if (!expireResp.ok) {
      console.error(
        `revoke-child-device-access: failed to expire pending codes for ${childUserId}: ${expireResp.status} ${await expireResp.text()}`
      );
    }

    // --- Mark the triggering admin_action_items row actioned, if given -----
    if (actionItemId !== '') {
      const actionResp = await fetch(
        `${SUPABASE_URL}/rest/v1/admin_action_items?id=eq.${actionItemId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            status: 'actioned',
            actioned_by: callerId,
            actioned_at: nowIso,
          }),
        }
      );
      if (!actionResp.ok) {
        console.error(
          `revoke-child-device-access: revoked access but failed to mark action item ${actionItemId} actioned: ${actionResp.status} ${await actionResp.text()}`
        );
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error('revoke-child-device-access unexpected failure:', error);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
