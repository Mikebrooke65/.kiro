// Edge Function: link-player-caregiver
//
// Service-role primitive that inserts a single `player_caregivers` row. It
// exists because that table's only INSERT-capable RLS policy is admin-only
// ("Admins can manage player-caregiver links", migration 002; "Allow admins
// to manage player_caregivers", migration 036) — a coach or manager running
// the add-a-junior flow has no client-side write path, which is exactly the
// bug reported against `caregiversApi.addJunior` step 4 ("new row violates
// row-level security policy for table player_caregivers").
//
// Deliberately narrow, matching `create-auth-user`: it makes exactly one
// link and applies no other business logic. The add-a-junior orchestration
// (creating the caregiver/child users, requesting consent, notifying) lives
// in `src/lib/caregivers-api.ts`.
//
// Authorization: the caller must be authenticated and hold an elevated role
// **for the specific team the link belongs to** — club-wide admin
// (`users.role = 'admin'`), or a `team_members` row on `team_id` with role
// `coach` or `manager`. This is intentionally stricter than
// `create-auth-user`'s "coach/manager of any team" check, per the
// add-a-junior design: a coach on Team A must not be able to link a
// caregiver to a child on Team B.
//
// Requirement 7.5 (streamlined-invites-and-child-access, Task 9) adds one
// more restriction on top of that: a Coach/Manager may create a child's
// FIRST caregiver link (the only case this function was used for before
// Task 9 — always a brand-new child via `addJunior`, with zero existing
// caregivers, so that call site is unaffected), but a SECOND-OR-LATER
// caregiver for the same child requires club-wide admin — checked below,
// after the dedupe check, so re-submitting an already-existing link never
// needs escalation. This is the "caregiver already has an account" path;
// the "caregiver has no account yet" path gets the equivalent gate added
// directly to the `invite_codes` RLS policy (migration 056), since that
// path never reaches this function at all.
//
// Requires (set via `supabase secrets set`): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (both are provided to Edge Functions by default).
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This call fails
// until `supabase functions deploy link-player-caregiver` has been run.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LinkPlayerCaregiverBody {
  team_id: string;
  player_id: string;
  caregiver_id: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    // Extract the caller id from the JWT (same lightweight approach as create-auth-user).
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

    const body = (await req.json()) as LinkPlayerCaregiverBody;
    if (!body?.team_id || !body?.player_id || !body?.caregiver_id) {
      return json({ error: 'team_id, player_id and caregiver_id are required' }, 400);
    }

    // Authorization: caller must be admin OR a coach/manager on THIS team.
    const roleResp = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${callerId}&select=role`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    const roleData = await roleResp.json();
    const isAdmin = Array.isArray(roleData) && roleData[0]?.role === 'admin';

    let permitted = isAdmin;
    if (!permitted) {
      const memberResp = await fetch(
        `${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${callerId}&team_id=eq.${body.team_id}&role=in.(coach,manager)&select=id&limit=1`,
        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
      );
      const memberData = await memberResp.json();
      permitted = Array.isArray(memberData) && memberData.length > 0;
    }

    if (!permitted) {
      return json({ error: 'Coach, Manager, or Admin access required for this team' }, 403);
    }

    // Dedupe (Req 5.7) — skip the insert if the link already exists. Checked
    // before the second-or-later gate below: re-submitting an existing link
    // is a no-op, not "adding a caregiver," so it never needs escalation.
    const existingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/player_caregivers?player_id=eq.${body.player_id}&caregiver_id=eq.${body.caregiver_id}&select=player_id&limit=1`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    const existing = await existingResp.json();
    if (Array.isArray(existing) && existing.length > 0) {
      return json({ success: true, created: false });
    }

    // Requirement 7.5 — a SECOND-OR-LATER caregiver for this child requires
    // club-wide admin, judged on the current linked-caregiver count (not a
    // historical "was there ever a first" count — a child back down to zero
    // caregivers, e.g. after an admin's removal-driven revocation, can have
    // a new first caregiver added by a Coach/Manager again).
    if (!isAdmin) {
      const countResp = await fetch(
        `${SUPABASE_URL}/rest/v1/player_caregivers?player_id=eq.${body.player_id}&select=player_id&limit=1`,
        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
      );
      const countData = await countResp.json();
      const childAlreadyHasACaregiver = Array.isArray(countData) && countData.length > 0;
      if (childAlreadyHasACaregiver) {
        return json(
          { error: 'Admin access required to add an additional caregiver for this child' },
          403
        );
      }
    }

    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/player_caregivers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ player_id: body.player_id, caregiver_id: body.caregiver_id }),
    });

    if (!insertResp.ok) {
      const err = await insertResp.json().catch(() => ({}));
      return json({ error: err.message || 'Failed to link caregiver' }, 400);
    }

    return json({ success: true, created: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
});
