// Edge Function: redeem-device-code
//
// Spec: `.kiro/specs/streamlined-invites-and-child-access/` (Task 6, Requirement 7.4)
//
// The child opens the device-code link **once**, on their own device
// (7.4.4). This validates the code and mints a magic-link `token_hash` for
// their existing synthetic-email auth user — established via GoTrue's
// `generate_link` admin endpoint, which returns the token directly rather
// than sending an email (the synthetic address is non-deliverable anyway).
// The client then calls `supabase.auth.verifyOtp({ token_hash, type:
// 'magiclink' })` with the **anon** client to actually establish the
// session in the child's browser — that call, not this function, is what
// creates the session; this function never sees or holds it.
//
// No password is ever set or seen here (7.4.4) — session revocation for
// this device-code mechanism happens at *generation* time instead (see
// `generate-device-code`'s header and design.md 7.4.6), not here.
//
// SECURITY POSTURE — read before changing:
//   * Reachable without a session, same as `redeem-invite` and for the same
//     reason — the child has no account access yet. THE CODE IS THE
//     AUTHORIZATION: unexpired and unredeemed, or nothing happens.
//   * A code that is invalid, expired, or already redeemed gets the SAME
//     generic message — design.md is explicit this never distinguishes
//     "expired" from "already used" from "unknown code" to an
//     unauthenticated, child-facing client, since there's no legitimate
//     reason a child needs that distinction and it narrows the guessing
//     surface slightly.
//   * Returns only `{ token_hash }` — no email, no user id, no role, nothing
//     that identifies the account beyond what `verifyOtp` itself needs.
//   * Rejected attempts are logged with `console.error`.
//
// No new secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
// into Edge Functions automatically.
//
// CLUB-AGNOSTIC: no club name, colour, logo, domain or URL appears here —
// this function returns bare data; the device-code landing page supplies
// any branded copy around it.
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This is not live
// until `supabase functions deploy redeem-device-code` has been run.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Same generic message regardless of *why* the code doesn't work — see the
 *  file header for why that's deliberate, not an oversight. */
const INVALID_CODE_MESSAGE = "This code is no longer valid. Ask your caregiver for a new one.";

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

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('redeem-device-code misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 500);
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.error('redeem-device-code rejected: unparseable request body', error);
      return json({ error: INVALID_CODE_MESSAGE }, 400);
    }

    const code =
      body != null && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string'
        ? (body as { code: string }).code.trim()
        : '';

    if (code === '') {
      return json({ error: INVALID_CODE_MESSAGE }, 400);
    }

    const lookupResp = await fetch(
      `${SUPABASE_URL}/rest/v1/child_device_codes?code=eq.${encodeURIComponent(code)}&select=id,child_user_id,expires_at,redeemed_at`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    if (!lookupResp.ok) {
      console.error(`redeem-device-code lookup failed: ${lookupResp.status} ${await lookupResp.text()}`);
      return json({ error: INVALID_CODE_MESSAGE }, 400);
    }

    const rows: Array<{
      id: string;
      child_user_id: string;
      expires_at: string;
      redeemed_at: string | null;
    }> = await lookupResp.json();
    const row = rows[0];

    if (!row || row.redeemed_at || new Date(row.expires_at) < new Date()) {
      console.error(`redeem-device-code rejected: code not valid (found=${!!row})`);
      return json({ error: INVALID_CODE_MESSAGE }, 400);
    }

    // Resolve the child's synthetic email — `generate_link` needs it, but it
    // never leaves this function (not returned to the caller).
    const userResp = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${row.child_user_id}&select=email`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    if (!userResp.ok) {
      console.error(`redeem-device-code user lookup failed: ${userResp.status} ${await userResp.text()}`);
      return json({ error: INVALID_CODE_MESSAGE }, 400);
    }
    const userRows: Array<{ email: string | null }> = await userResp.json();
    const email = userRows[0]?.email;
    if (!email) {
      console.error(`redeem-device-code rejected: child ${row.child_user_id} has no email on file`);
      return json({ error: INVALID_CODE_MESSAGE }, 400);
    }

    const linkResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', email }),
    });

    if (!linkResp.ok) {
      const err = await linkResp.json().catch(() => ({}));
      console.error('redeem-device-code generate_link failed:', err);
      return json({ error: INVALID_CODE_MESSAGE }, 400);
    }

    const linkData = await linkResp.json();
    const tokenHash = linkData?.hashed_token ?? linkData?.properties?.hashed_token ?? null;
    if (!tokenHash) {
      console.error('redeem-device-code: generate_link returned no hashed_token', linkData);
      return json({ error: INVALID_CODE_MESSAGE }, 400);
    }

    // Mark redeemed only once everything else has actually succeeded — a
    // failure above must leave the code usable for a retry, not burn it.
    const redeemResp = await fetch(
      `${SUPABASE_URL}/rest/v1/child_device_codes?id=eq.${row.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ redeemed_at: new Date().toISOString() }),
      }
    );
    if (!redeemResp.ok) {
      console.error(
        `redeem-device-code: failed to mark code redeemed: ${redeemResp.status} ${await redeemResp.text()}`
      );
      // Not fatal to this response — the token is already minted and valid;
      // worst case a retry mints a second, equally valid token before this
      // row is corrected. Logged for follow-up, not surfaced to the child.
    }

    return json({ token_hash: tokenHash });
  } catch (error) {
    console.error('redeem-device-code unexpected failure:', error);
    return json({ error: INVALID_CODE_MESSAGE }, 400);
  }
});
