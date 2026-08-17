// Edge Function: create-auth-user
//
// Low-level, service-role primitive that creates a single auth user plus its
// matching `public.users` profile row and returns the new id. It exists because
// the browser cannot create `auth.users` rows: that requires the admin API and
// the service-role key, which must never reach the client.
//
// It is deliberately dumb — it makes exactly one user and applies no business
// logic. The add-a-junior orchestration (deciding *whether* to create a
// caregiver, generating links, inserting approvals) lives in
// `src/lib/caregivers-api.ts`, which reuses the pure helpers in
// `src/lib/add-junior-logic.ts`. This function is only the auth-creation step
// that orchestration cannot do itself.
//
// Two shapes of user:
//   - can_sign_in = true  → caregiver: a real, deliverable email, email_confirm
//                            true, a random password. The account is capable of
//                            signing in (via password reset / magic link).
//   - can_sign_in = false → child (Model A): a server-generated synthetic email
//                            on the reserved `.invalid` TLD (non-deliverable),
//                            email NOT confirmed, random password. The row
//                            satisfies the schema but can never authenticate.
//
// Authorization: the caller must be authenticated and hold an elevated role —
// club-wide admin (`users.role = 'admin'`) or a coach/manager `team_members`
// row. Players/caregivers cannot mint users.
//
// Requires (set via `supabase secrets set`): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (both are provided to Edge Functions by default).
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This call fails until
// `supabase functions deploy create-auth-user` has been run.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateAuthUserBody {
  email?: string; // required when can_sign_in; ignored for children (synthetic)
  first_name: string;
  last_name: string;
  cellphone?: string | null;
  role?: string; // defaults to 'player'
  active?: boolean; // defaults to true
  user_type?: string; // defaults to 'lite'
  is_child?: boolean;
  child_provenance?: string | null;
  can_sign_in: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** A long, unguessable password so a non-interactive account can't be signed into. */
function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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

    // Extract the caller id from the JWT (same lightweight approach as create-user).
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

    // Authorization: caller must be admin OR a coach/manager on some team.
    const roleResp = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${callerId}&select=role`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    const roleData = await roleResp.json();
    const isAdmin = Array.isArray(roleData) && roleData[0]?.role === 'admin';

    let permitted = isAdmin;
    if (!permitted) {
      const memberResp = await fetch(
        `${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${callerId}&role=in.(coach,manager)&select=id&limit=1`,
        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
      );
      const memberData = await memberResp.json();
      permitted = Array.isArray(memberData) && memberData.length > 0;
    }

    if (!permitted) {
      return json({ error: 'Coach, Manager, or Admin access required' }, 403);
    }

    const body = (await req.json()) as CreateAuthUserBody;
    if (!body?.first_name || !body?.last_name || typeof body.can_sign_in !== 'boolean') {
      return json(
        { error: 'first_name, last_name and can_sign_in are required' },
        400
      );
    }

    // Resolve the email. Children get a server-generated synthetic address so a
    // compromised client can't smuggle a deliverable one onto a no-sign-in row.
    let email: string;
    if (body.can_sign_in) {
      if (!body.email) {
        return json({ error: 'email is required for a sign-in-capable user' }, 400);
      }
      email = body.email.trim().toLowerCase();
    } else {
      email = `child.${crypto.randomUUID()}@no-reply.invalid`;
    }

    // Create the auth user. Children are never email-confirmed and use an
    // unguessable password on a non-deliverable address → they cannot sign in.
    const createAuthResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: randomPassword(),
        email_confirm: body.can_sign_in,
        user_metadata: { first_name: body.first_name, last_name: body.last_name },
      }),
    });

    if (!createAuthResp.ok) {
      const err = await createAuthResp.json();
      return json({ error: err.msg || err.message || 'Failed to create auth user' }, 400);
    }

    const authUser = await createAuthResp.json();
    const newUserId = authUser.id;

    // Create the matching profile row.
    const profile: Record<string, unknown> = {
      id: newUserId,
      email,
      first_name: body.first_name,
      last_name: body.last_name,
      cellphone: body.cellphone ?? null,
      role: body.role || 'player',
      user_type: body.user_type || 'lite',
      active: body.active !== false,
    };
    if (body.is_child) profile.is_child = true;
    if (body.child_provenance) profile.child_provenance = body.child_provenance;

    const createProfileResp = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(profile),
    });

    if (!createProfileResp.ok) {
      // Roll back the orphaned auth user so a retry can succeed.
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${newUserId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      const err = await createProfileResp.json().catch(() => ({}));
      return json({ error: err.message || 'Failed to create user record' }, 400);
    }

    return json({ success: true, id: newUserId, email });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
});
