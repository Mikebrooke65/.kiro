// Edge Function: remove-team-member
//
// Service-role primitive backing the roster page's new "Remove" action
// (product decision 2026-08-31, surfaced testing Task 12 item 6's
// existing-user bypass and the follow-on question of how to undo a
// mistaken Add — `.kiro/specs/streamlined-invites-and-child-access/`,
// `NEXT-SESSION-NOTES.md`'s "Roster 'Remove' redesign" section).
//
// Deletes exactly ONE `team_members` row (one person/role/team
// association) — not an account-wide `users.active` flip like the
// Deactivate button this supersedes on the Team Page. See
// `permissions-logic.ts`'s `canRemoveTeamMember` doc comment for the full
// rule set this enforces; this function is that rule's server-side twin.
//
// WHY THIS CAN'T BE "JUST AN RLS POLICY": migration 036 already created a
// blanket `team_members` FOR ALL policy —
//   USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
//                   AND users.role::text IN ('admin','coach','manager')))
// — that lets ANY user whose GLOBAL `users.role` is admin/coach/manager
// delete ANY `team_members` row for ANY team, completely unscoped to teams
// they actually belong to. Postgres OR's every applicable RLS policy
// together, so a new, narrower policy alongside that one would be
// redundant-but-harmless, not an actual restriction — it cannot express
// "but never the first Manager, and only Coach/Manager status ON THIS
// TEAM." That's a genuine pre-existing looseness, not introduced by this
// change; it's called out here (and in CHANGELOG.md) as a known, separate
// gap rather than silently patched, since narrowing that policy risks
// breaking other flows (`roles-api.ts`'s `addTeamMember`/
// `updateTeamMemberRole`/`removeTeamMember`, used by the Admin
// `UserManagement.tsx` screen) that currently rely on it working exactly
// as broadly as it does today. This function is simply the privileged,
// correctly-scoped path for the roster page's own Remove button —
// mirroring `link-player-caregiver`'s architecture (client has no direct
// write path; the server does its own authorization check under service
// role) — while that wider RLS question stays open for a future session.
//
// Authorization:
//   - Self-removal (caller's own user_id matches the membership's user_id)
//     is ALWAYS allowed, including for the team's first Manager — a person
//     must always be able to remove themselves.
//   - Otherwise: club-wide Admin, or a `team_members` row on THIS team with
//     role coach/manager — same authority model as every other
//     roster-modifying action in this app — EXCEPT the team's first
//     Manager (earliest `team_members` row with role='manager' for this
//     team, by created_at) can only be removed by themselves, never by
//     anyone else however senior. There is deliberately no tiering between
//     Coach/Manager/Admin beyond that one exception (user's explicit
//     instruction, 2026-08-31: "no tiering, other than the first manager").
//   - External League teams are always read-only — Remove is refused for
//     any membership on one, including self-removal.
//
// Cascade (judgment call, documented for review — not explicitly specified
// this precisely by the user): removing a Player's LAST remaining
// `team_members` row anywhere in the app also deletes all of their
// `player_caregivers` links, so a caregiver link never survives with no
// team membership behind it at all ("no orphaned caregiver link with no
// child"). A player who still belongs to at least one OTHER team keeps
// their caregiver link untouched — `player_caregivers` isn't team-scoped
// in this schema, so severing it over a single team's Remove would affect
// every team the child is on, not just this one. Migration 056's
// `admin_action_items` removal-notification trigger already fires on any
// `player_caregivers` DELETE regardless of caller (SECURITY DEFINER),
// so this cascade queues the same admin-review row a manual removal would.
//
// Requires (set via `supabase secrets set`): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (both are provided to Edge Functions by default).
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This call fails
// until `supabase functions deploy remove-team-member` has been run.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RemoveTeamMemberBody {
  membership_id: string;
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

    // Extract the caller id from the JWT (same lightweight approach as
    // create-auth-user / link-player-caregiver — the real authorization
    // gate is the DB checks below, not the token's signature).
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

    const body = (await req.json()) as RemoveTeamMemberBody;
    if (!body?.membership_id) {
      return json({ error: 'membership_id is required' }, 400);
    }

    const svHeaders = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

    // Load the target membership row — team_id/user_id/role/created_at all
    // come from the server's own read, never trusted from the client.
    const membershipResp = await fetch(
      `${SUPABASE_URL}/rest/v1/team_members?id=eq.${body.membership_id}&select=id,team_id,user_id,role,created_at`,
      { headers: svHeaders }
    );
    const membershipRows = await membershipResp.json();
    const membership = Array.isArray(membershipRows) ? membershipRows[0] : null;
    if (!membership) {
      return json({ error: 'Team membership not found' }, 404);
    }

    // External League teams are always read-only — Remove never applies,
    // not even to yourself (Req 4.3/5.17, same rule as every other
    // roster-modifying action).
    const teamResp = await fetch(
      `${SUPABASE_URL}/rest/v1/teams?id=eq.${membership.team_id}&select=team_type`,
      { headers: svHeaders }
    );
    const teamRows = await teamResp.json();
    const teamType = Array.isArray(teamRows) ? teamRows[0]?.team_type : null;
    if (teamType === 'external_league') {
      return json({ error: 'This team is read-only' }, 403);
    }

    const isSelfRemoval = membership.user_id === callerId;

    if (!isSelfRemoval) {
      // Authorization: caller must be admin OR a coach/manager on THIS team.
      const roleResp = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${callerId}&select=role`,
        { headers: svHeaders }
      );
      const roleData = await roleResp.json();
      const isAdmin = Array.isArray(roleData) && roleData[0]?.role === 'admin';

      let permitted = isAdmin;
      if (!permitted) {
        const memberResp = await fetch(
          `${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${callerId}&team_id=eq.${membership.team_id}&role=in.(coach,manager)&select=id&limit=1`,
          { headers: svHeaders }
        );
        const memberData = await memberResp.json();
        permitted = Array.isArray(memberData) && memberData.length > 0;
      }

      if (!permitted) {
        return json({ error: 'Coach, Manager, or Admin access required for this team' }, 403);
      }

      // First-Manager protection: derive the earliest `role='manager'` row
      // for this team and refuse if the target IS that row, regardless of
      // the caller's own authority level.
      const firstManagerResp = await fetch(
        `${SUPABASE_URL}/rest/v1/team_members?team_id=eq.${membership.team_id}&role=eq.manager&select=id&order=created_at.asc&limit=1`,
        { headers: svHeaders }
      );
      const firstManagerRows = await firstManagerResp.json();
      const firstManagerId = Array.isArray(firstManagerRows) ? firstManagerRows[0]?.id : null;
      if (firstManagerId && firstManagerId === membership.id) {
        return json(
          { error: "The team's first Manager can only remove themselves" },
          403
        );
      }
    }

    const deleteResp = await fetch(
      `${SUPABASE_URL}/rest/v1/team_members?id=eq.${membership.id}`,
      { method: 'DELETE', headers: svHeaders }
    );
    if (!deleteResp.ok) {
      const err = await deleteResp.json().catch(() => ({}));
      return json({ error: err.message || 'Failed to remove team member' }, 400);
    }

    // Cascade: if this was the player's LAST team_members row anywhere,
    // also delete their caregiver links (see header comment for why this
    // is scoped to "last row" rather than every Player removal).
    let cascadedCaregiverRemoval = false;
    if (membership.role === 'player') {
      const remainingResp = await fetch(
        `${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${membership.user_id}&select=id&limit=1`,
        { headers: svHeaders }
      );
      const remainingRows = await remainingResp.json();
      const hasRemainingMembership = Array.isArray(remainingRows) && remainingRows.length > 0;

      if (!hasRemainingMembership) {
        const caregiverDeleteResp = await fetch(
          `${SUPABASE_URL}/rest/v1/player_caregivers?player_id=eq.${membership.user_id}`,
          { method: 'DELETE', headers: svHeaders }
        );
        cascadedCaregiverRemoval = caregiverDeleteResp.ok;
      }
    }

    return json({ success: true, cascadedCaregiverRemoval });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
});
