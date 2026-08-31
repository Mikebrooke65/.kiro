// Edge Function: generate-device-code
//
// Spec: `.kiro/specs/streamlined-invites-and-child-access/` (Task 6, Requirement 7.4)
//
// A caregiver, from their own authenticated session, triggers "give {child}
// their own access" (7.4.1). This mints a short-lived, single-use code that
// `redeem-device-code` later exchanges for a session on the child's existing
// synthetic-email auth user (created today via `create-auth-user`'s
// `can_sign_in: false` path) — no new account, no password, no username.
//
// SECURITY POSTURE — read before changing:
//   * Caller must be authenticated (their own session JWT, decoded the same
//     lightweight way `create-auth-user` does) AND authorized for this
//     child — checked here under service role, never trusted from the
//     request body. `child_device_codes` itself has no direct authenticated
//     INSERT policy (migration 055) specifically so this check cannot be
//     bypassed by writing the row directly from the client.
//   * Authorized means: linked to the child via `player_caregivers`, OR
//     club-wide Admin (`users.role = 'admin'`), OR a `team_members` row with
//     role `coach`/`manager` on any team the child is on. The admin/coach/
//     manager branch was added 2026-08-31, found testing the Section 6.2
//     self-service "Remove My Caregiver" follow-up (migration 062): a 16+
//     player who removes their only caregiver used to leave NOBODY able to
//     issue them a fresh code — not even a club Admin. Same authority model
//     `link-player-caregiver` already uses for this class of problem.
//   * Requirement 7.4.6, RESOLVED: generating a fresh code immediately
//     revokes any existing session for this child — "a lost/stolen device
//     stops working the moment a replacement code is issued", not only once
//     the replacement is redeemed. Done here, at generation time, not in
//     `redeem-device-code` — see design.md 7.4.6 for why (and for why the
//     mechanism is password rotation via `updateUserById`, not a dedicated
//     revoke-by-user-id endpoint, which GoTrue does not have).
//   * Also expires any of this child's previously-issued, still-unredeemed
//     codes, so only the most recently issued code can ever be redeemed —
//     consistent with "one active device grant at a time" even before this
//     new code is used.
//   * Returns only `{ code, expires_at }` — the caller builds the shareable
//     link itself (`${origin}/device/{code}`), same as every other invite
//     link in this app.
//
// No new secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
// into Edge Functions automatically.
//
// CLUB-AGNOSTIC: no club name, colour, logo, domain or URL appears here —
// this function returns bare data; the caller (`caregivers-api.ts` /
// `TeamPage.tsx`) builds any branded share text.
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This is not live
// until `supabase functions deploy generate-device-code` has been run.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** How long a generated code stays redeemable if untouched. Short on purpose
 *  — this is meant to be handed straight to a device sitting in front of the
 *  caregiver, not stored for later, so a narrow window limits how long a
 *  code is exposed if it's written down, screenshotted, or overheard. */
const CODE_LIFETIME_MS = 30 * 60 * 1000; // 30 minutes

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Same shape as `invites-api.ts`'s `generateCode()` — duplicated rather than
 *  imported (Deno/Edge Function side, no `_shared/` convention in this repo;
 *  see `check-invite-recipient`'s header for the same note). */
function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** A long, unguessable password so the rotated value can never itself be
 *  guessed into a sign-in — mirrors `create-auth-user`'s `randomPassword()`. */
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
    console.error('generate-device-code misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'No authorization header' }, 401);
    }

    // Extract the caller id from the JWT — same lightweight approach as
    // `create-auth-user` (this function only needs the id, not a full
    // signature-verified decode: the id is only used to check a
    // `player_caregivers` row exists, which is itself the real authorization
    // gate below; a forged id simply fails that check).
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
      console.error('generate-device-code rejected: unparseable request body', error);
      return json({ error: 'Invalid request' }, 400);
    }

    const childUserId =
      body != null &&
      typeof body === 'object' &&
      typeof (body as { child_user_id?: unknown }).child_user_id === 'string'
        ? (body as { child_user_id: string }).child_user_id.trim()
        : '';

    if (childUserId === '') {
      return json({ error: 'Invalid request' }, 400);
    }

    // --- Authorization: linked caregiver, OR club Admin, OR a Coach/Manager
    // on one of this child's teams (2026-08-31 — see header comment). -------
    let authorized = false;

    const linkResp = await fetch(
      `${SUPABASE_URL}/rest/v1/player_caregivers?caregiver_id=eq.${callerId}&player_id=eq.${childUserId}&select=player_id`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    if (!linkResp.ok) {
      console.error(`generate-device-code link lookup failed: ${linkResp.status} ${await linkResp.text()}`);
      return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
    }
    const linkRows = await linkResp.json();
    authorized = Array.isArray(linkRows) && linkRows.length > 0;

    if (!authorized) {
      const roleResp = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${callerId}&select=role`,
        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
      );
      if (!roleResp.ok) {
        console.error(`generate-device-code role lookup failed: ${roleResp.status} ${await roleResp.text()}`);
        return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
      }
      const roleRows = await roleResp.json();
      authorized = Array.isArray(roleRows) && roleRows[0]?.role === 'admin';
    }

    if (!authorized) {
      const childTeamsResp = await fetch(
        `${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${childUserId}&select=team_id`,
        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
      );
      if (!childTeamsResp.ok) {
        console.error(
          `generate-device-code child-teams lookup failed: ${childTeamsResp.status} ${await childTeamsResp.text()}`
        );
        return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
      }
      const childTeamRows = await childTeamsResp.json();
      const teamIds: string[] = Array.isArray(childTeamRows)
        ? childTeamRows.map((row: { team_id?: string }) => row.team_id).filter((id: unknown): id is string => typeof id === 'string')
        : [];

      if (teamIds.length > 0) {
        const memberResp = await fetch(
          `${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${callerId}&team_id=in.(${teamIds.join(',')})&role=in.(coach,manager)&select=id&limit=1`,
          { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
        );
        if (!memberResp.ok) {
          console.error(`generate-device-code member lookup failed: ${memberResp.status} ${await memberResp.text()}`);
          return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
        }
        const memberRows = await memberResp.json();
        authorized = Array.isArray(memberRows) && memberRows.length > 0;
      }
    }

    if (!authorized) {
      console.error(`generate-device-code rejected: caller ${callerId} is not authorized for child ${childUserId}`);
      return json({ error: 'You are not authorized to do this for this child.' }, 403);
    }

    // --- Defense in depth: confirm this really is a child user ------------
    const childResp = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${childUserId}&select=id,is_child`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    if (!childResp.ok) {
      console.error(`generate-device-code child lookup failed: ${childResp.status} ${await childResp.text()}`);
      return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
    }
    const childRows = await childResp.json();
    if (!Array.isArray(childRows) || childRows.length === 0 || !childRows[0]?.is_child) {
      console.error(`generate-device-code rejected: ${childUserId} does not resolve to a child user`);
      return json({ error: 'This person does not have a child account.' }, 400);
    }

    // --- Requirement 7.4.6: revoke any existing session for this child now,
    // before this new code even gets a chance to be redeemed. Rotating the
    // password is never used for sign-in on this account (no one ever knows
    // or needs it), and is a confirmed way to kill the child's existing
    // session by user id — see design.md 7.4.6 for the full sourcing. -----
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
      console.error('generate-device-code session revocation failed:', err);
      return json({ error: 'Could not prepare a new device code. Please try again.' }, 500);
    }

    // --- Expire any previously-issued, still-unredeemed codes for this
    // child — only the code this call is about to create should ever be
    // redeemable afterward. ------------------------------------------------
    const nowIso = new Date().toISOString();
    const expirePriorResp = await fetch(
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
    if (!expirePriorResp.ok) {
      // Not fatal to the new code being issued — logged for visibility, but
      // the new code below is still the one that matters going forward, and
      // an old, already-expired-by-revocation code redeeming would find no
      // live session to inherit anyway. Not worth failing the whole request.
      console.error(
        `generate-device-code: failed to expire prior codes for ${childUserId}: ${expirePriorResp.status} ${await expirePriorResp.text()}`
      );
    }

    // --- Create the new code -----------------------------------------------
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS).toISOString();

    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/child_device_codes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        code,
        child_user_id: childUserId,
        created_by: callerId,
        expires_at: expiresAt,
      }),
    });

    if (!insertResp.ok) {
      const err = await insertResp.json().catch(() => ({}));
      console.error('generate-device-code insert failed:', err);
      return json({ error: 'Could not create a device code. Please try again.' }, 500);
    }

    return json({ code, expires_at: expiresAt });
  } catch (error) {
    console.error('generate-device-code unexpected failure:', error);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
