// Edge Function: check-invite-recipient
//
// Spec: `.kiro/specs/streamlined-invites-and-child-access/` (Task 4, Requirement 2)
//
// Answers exactly one question for exactly one already-known invite code:
// "does the address this invite was sent to already belong to a real
// account?" Nothing else. `LiteLandingPage.tsx` calls this right after
// `validateInviteCode` succeeds, and — when the answer is true — skips the
// full "create your account" form entirely in favour of a short "you already
// have an account, join {team}?" confirmation (Requirement 2.2). This is
// what makes that possible: today nothing exposes "does this email have an
// account" to an unauthenticated client at all.
//
// SECURITY POSTURE — read before changing:
//   * THIS MUST NEVER BECOME A GENERAL EMAIL-ENUMERATION ENDPOINT. It takes
//     only `code` — never a bare `email` — and answers only for the one
//     `recipient_email` already attached to that specific invite row. A
//     request cannot ask "does x@example.com have an account?" for an
//     address it doesn't already control an invite for.
//   * Returns **only** `{ recipientExists: boolean }`. No name, no role, no
//     account id, nothing else that a crafted or leaked invite code could
//     turn into a lookup on someone else's data.
//   * Reachable without a session, same as `redeem-invite` and for the same
//     reason (Requirement 2.1 runs *before* the person has an account) — the
//     invite code is what scopes this request, not authentication.
//   * An invite that is invalid, expired, redeemed, or has no
//     `recipient_email` on file answers `false` rather than an error — this
//     endpoint's job is a yes/no nudge for the UI, not a second copy of
//     `validateInviteCode`'s status logic (the client already has that).
//   * Rejected/malformed requests are logged with `console.error`.
//
// No new secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
// into Edge Functions automatically.
//
// CLUB-AGNOSTIC: no club name, colour, logo, domain or URL appears here —
// this function returns a bare boolean; `LiteLandingPage` supplies all
// branded copy around it (requirements.md Section 10).
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This is not live
// until `supabase functions deploy check-invite-recipient` has been run.

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

interface AdminAuthUser {
  id: string;
  email?: string | null;
}

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Find an auth user by email through the GoTrue admin endpoint.
 *
 * Duplicated from `redeem-invite/index.ts` rather than imported — this
 * project deploys each Edge Function as an independent bundle with no
 * `_shared/` convention (confirmed: none of the functions under
 * `supabase/functions/` import across function directories), so every
 * function's raw-REST helpers are self-contained, same as
 * `create-auth-user`'s. If this drifts from `redeem-invite`'s copy, that's a
 * sign the two should be consolidated then — not a reason to couple them now.
 */
async function findAuthUserByEmail(
  supabaseUrl: string,
  serviceKey: string,
  email: string
): Promise<AdminAuthUser | null> {
  const perPage = 200;
  const maxPages = 10;

  for (let page = 1; page <= maxPages; page++) {
    const endpoint =
      `${supabaseUrl}/auth/v1/admin/users` +
      `?page=${page}&per_page=${perPage}&filter=${encodeURIComponent(email)}`;

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });

    if (!response.ok) {
      throw new Error(`admin users lookup failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const users: AdminAuthUser[] = Array.isArray(payload?.users) ? payload.users : [];

    const match = users.find((u) => normalizeEmail(u?.email) === email);
    if (match?.id) return match;

    // A short page means there is nothing further to read.
    if (users.length < perPage) return null;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('check-invite-recipient misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    // Fails closed to "no account found" rather than an error: the caller
    // (LiteLandingPage) treats that as "show the full form", which is always
    // a safe fallback — never blocks registration on this check's account.
    return json({ recipientExists: false }, 200);
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.error('check-invite-recipient rejected: unparseable request body', error);
      return json({ error: 'Invalid request' }, 400);
    }

    const code =
      body != null && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string'
        ? (body as { code: string }).code.trim()
        : '';

    if (code === '') {
      console.error('check-invite-recipient rejected: missing code');
      return json({ error: 'Invalid request' }, 400);
    }

    // Deliberately not re-deriving `deriveInviteStatus` (expired/redeemed/
    // etc.) here — see the file header. Any row found (or not) resolves to a
    // plain boolean below; there is no separate error shape to leak.
    const lookupResp = await fetch(
      `${supabaseUrl}/rest/v1/invite_codes?code=eq.${encodeURIComponent(code)}&select=recipient_email`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
    );

    if (!lookupResp.ok) {
      console.error(
        `check-invite-recipient invite lookup failed: ${lookupResp.status} ${await lookupResp.text()}`
      );
      return json({ recipientExists: false }, 200);
    }

    const rows: Array<{ recipient_email: string | null }> = await lookupResp.json();
    const recipientEmail = normalizeEmail(rows[0]?.recipient_email);

    if (recipientEmail === '') {
      // No such invite, or one with no recipient on file — nothing to check.
      return json({ recipientExists: false });
    }

    const match = await findAuthUserByEmail(supabaseUrl, serviceKey, recipientEmail);
    return json({ recipientExists: !!match });
  } catch (error) {
    console.error('check-invite-recipient unexpected failure:', error);
    // Same fail-closed-to-false posture as the misconfiguration branch above.
    return json({ recipientExists: false }, 200);
  }
});
