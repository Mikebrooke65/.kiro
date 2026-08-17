// Edge Function: redeem-invite
//
// Spec: `.kiro/specs/lite-user-registration-fix/` (task 3.2)
//
// The whole lite-user registration transaction, server-side under `service_role`.
// It exists because `supabase.auth.signUp()` returns NO session while email
// confirmation is enabled, so the browser is still the `anon` role when it tries
// to insert into `users` and migration 044's `id = auth.uid()` check cannot pass.
// Running here means RLS is never in the path and the browser never needs a
// session at any point (2.1, 2.6).
//
// One call: validate the request -> re-validate the invite code -> resolve or
// create the auth user -> insert the `users` profile row -> insert the
// `team_members` row -> mark the invite redeemed. Any failure is compensated in
// reverse, touching only what this invocation created (2.3).
//
// SECURITY POSTURE — read before changing:
//   * This endpoint is reachable WITHOUT a user session. It has to be:
//     registration happens before the person has an account. supabase-js sends
//     the anon key as the bearer token, which satisfies default JWT
//     verification, so the default is kept and this function simply does not
//     additionally require an end-user session the way `send-email` does. If
//     verification rejects the anon key in this project's configuration, deploy
//     with `--no-verify-jwt`.
//   * THE INVITE CODE IS THE AUTHORIZATION. A code must be present, unredeemed
//     and unexpired before anything is written.
//   * Nothing privileged is ever taken from the request body. `role`,
//     `user_type`, `team_id` and `active` are set here, server-side, so a
//     crafted body cannot elevate a registrant or attach them to another team.
//   * Rejected attempts are logged with `console.error`.
//   * RATE LIMITING IS OUT OF SCOPE for this bugfix and is a known, recorded
//     exposure: an attacker holding a valid code can create auth users.
//
// No new secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
// into Edge Functions automatically.
//
// CLUB-AGNOSTIC: no club name, colour, logo, domain or URL appears here. This
// function returns data only; `LiteLandingPage` formats the team name as
// `{age_group} {name}`.
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This fix is not live
// until `supabase functions deploy redeem-invite` has been run.

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import {
  deriveInviteStatus,
  emailMatchesInvite,
  mapError,
  messageForInviteStatus,
  normalizeEmail,
  plannedCompensations,
  resolveEffectiveRole,
  SAFE_ERROR_MESSAGES,
  validateRequest,
  type CreationLedger,
  type NormalizedRegistration,
} from './logic.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Fields a caller might try to set that this function always decides itself. */
const SERVER_CONTROLLED_FIELDS = ['role', 'user_type', 'team_id', 'active'] as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * A failure we have already classified. `safeMessage` is drawn from
 * `SAFE_ERROR_MESSAGES`, so it can go straight back over the wire; `detail`
 * holds the raw text, which is logged and never returned (2.4).
 */
class RedeemError extends Error {
  constructor(
    readonly safeMessage: string,
    readonly status: number,
    readonly detail?: unknown,
    readonly code?: string
  ) {
    super(safeMessage);
    this.name = 'RedeemError';
  }
}

// ---------------------------------------------------------------------------
// Auth admin lookup by email
// ---------------------------------------------------------------------------

interface AdminAuthUser {
  id: string;
  email?: string | null;
}

/**
 * Find an auth user by email through the GoTrue admin endpoint.
 *
 * PostgREST cannot reach the `auth` schema, so this is the only way to answer
 * "does an auth user already exist for this address?" — which is what
 * distinguishes a genuinely new registrant from a pre-fix orphan.
 *
 * `filter` narrows server-side where supported. Where it is ignored, the
 * bounded pagination below still finds the user, and the match is always an
 * exact comparison on the normalised address rather than the substring the
 * filter returns.
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
      throw new RedeemError(
        SAFE_ERROR_MESSAGES.unavailable,
        502,
        `admin users lookup failed: ${response.status} ${await response.text()}`
      );
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

// ---------------------------------------------------------------------------
// Compensating rollback
// ---------------------------------------------------------------------------

/**
 * Undo, in reverse creation order, only what this invocation created (2.3,
 * Property 4). `plannedCompensations` does the filtering, so a pre-existing auth
 * user, profile row or membership can never be targeted here.
 *
 * Each step is independent and best-effort: one failing compensation must not
 * stop the others, or a rollback that trips on a delete would leave more behind
 * than the failure it was cleaning up after.
 */
async function runCompensations(
  admin: ReturnType<typeof createClient>,
  ledger: CreationLedger
): Promise<void> {
  const compensations = plannedCompensations(ledger);
  if (compensations.length === 0) return;

  for (const compensation of compensations) {
    try {
      switch (compensation.action) {
        case 'delete_team_member': {
          const { error } = await admin
            .from('team_members')
            .delete()
            .eq('team_id', compensation.teamId)
            .eq('user_id', compensation.userId);
          if (error) throw error;
          break;
        }
        case 'delete_profile_row': {
          const { error } = await admin.from('users').delete().eq('id', compensation.userId);
          if (error) throw error;
          break;
        }
        case 'delete_auth_user': {
          const { error } = await admin.auth.admin.deleteUser(compensation.userId);
          if (error) throw error;
          break;
        }
      }
    } catch (error) {
      // Logged, not rethrown: the caller is already returning a failure, and a
      // half-done rollback is still better than an abandoned one.
      console.error(`redeem-invite rollback step ${compensation.action} failed:`, error);
    }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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
    console.error('redeem-invite misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return json({ error: SAFE_ERROR_MESSAGES.unavailable }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Everything this invocation creates is recorded here as it happens, so the
  // catch block can undo exactly that and nothing else.
  const ledger: CreationLedger = {};

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.error('redeem-invite rejected: unparseable request body', error);
      throw new RedeemError(SAFE_ERROR_MESSAGES.unknown, 400, error, 'bad_request');
    }

    // Note what is ignored rather than honoured — worth seeing in the logs.
    const attempted = SERVER_CONTROLLED_FIELDS.filter(
      (field) => body != null && typeof body === 'object' && field in (body as object)
    );
    if (attempted.length > 0) {
      console.error(`redeem-invite ignoring client-supplied fields: ${attempted.join(', ')}`);
    }

    // --- 1. Request validation (3.7) -------------------------------------
    const validation = validateRequest(body);
    if (!validation.ok) {
      console.error(`redeem-invite rejected: ${validation.reason}`);
      return json({ error: validation.message, reason: validation.reason }, 400);
    }
    const reg: NormalizedRegistration = validation.value;

    // --- 2. Server-side invite validation (3.3) --------------------------
    // The client already validated; that check is advisory only. The code is
    // the authorization for an unauthenticated endpoint, so it is re-derived
    // here under `service_role`.
    const { data: invite, error: inviteError } = await admin
      .from('invite_codes')
      .select('*')
      .eq('code', reg.code)
      .maybeSingle();

    if (inviteError) {
      throw new RedeemError(SAFE_ERROR_MESSAGES.unavailable, 500, inviteError, 'invite_lookup');
    }

    const status = deriveInviteStatus(invite, new Date());
    if (status !== 'valid') {
      console.error(`redeem-invite rejected: code status ${status}`);
      return json({ error: messageForInviteStatus(status), status }, 400);
    }
    if (!invite.team_id) {
      console.error(`redeem-invite rejected: invite ${invite.id} has no team_id`);
      return json({ error: SAFE_ERROR_MESSAGES.team_unavailable, status: 'invalid' }, 400);
    }

    // D2: the email match is the ownership proof that decides pre-confirmation
    // (2.7 / 2.8), and the only condition under which an orphan may be adopted.
    const preConfirm = emailMatchesInvite(reg.email, invite.recipient_email);

    // The role granted by this redemption is decided server-side from the
    // invite's intended role and applied identically to the profile row (6.2)
    // and the membership row (6.3). `resolveEffectiveRole` degrades any absent,
    // unknown, or privileged value (including 'admin') to 'player' (6.4 / 6.5),
    // so a crafted invite can never confer an elevated role.
    const effectiveRole = resolveEffectiveRole(invite.intended_role);

    // --- 3. Resolve the user --------------------------------------------
    // `public.users.id` references `auth.users(id)`, so every profile row has an
    // auth user. Looking the auth user up first therefore settles all three
    // cases, and does it case-insensitively, which a `users.email` equality
    // lookup would not.
    const existingAuthUser = await findAuthUserByEmail(supabaseUrl, serviceKey, reg.email);
    let userId: string;
    let profileAlreadyExisted = false;

    if (existingAuthUser) {
      const { data: profile, error: profileError } = await admin
        .from('users')
        .select('id')
        .eq('id', existingAuthUser.id)
        .maybeSingle();

      if (profileError) {
        throw new RedeemError(SAFE_ERROR_MESSAGES.unavailable, 500, profileError, 'profile_lookup');
      }

      // Whatever happens below, this auth user pre-existed. Recording it as not
      // created by this invocation is what stops rollback deleting a real
      // account (3.1).
      ledger.authUser = { userId: existingAuthUser.id, createdByThisInvocation: false };
      userId = existingAuthUser.id;

      if (profile) {
        // 3.1 — existing user: create nothing, they just gain the membership.
        profileAlreadyExisted = true;
        ledger.profileRow = { userId, createdByThisInvocation: false };
      } else if (preConfirm) {
        // Pre-fix orphan (defect 1.2) for the invited address: adopt it, setting
        // the password the person just chose. Restricting adoption to the
        // invited address is what stops a valid code being used to take over
        // someone else's auth record.
        //
        // Note: this password change is deliberately NOT compensated on a later
        // failure — the auth user pre-existed, so rollback must not touch it. A
        // retry simply sets the password again.
        const { error: adoptError } = await admin.auth.admin.updateUserById(userId, {
          password: reg.password,
          email_confirm: preConfirm,
          user_metadata: { first_name: reg.first_name, last_name: reg.last_name },
        });
        if (adoptError) {
          throw new RedeemError(mapError(adoptError), 400, adoptError, 'adopt_orphan');
        }
        console.log(`redeem-invite adopted orphaned auth user ${userId}`);
      } else {
        console.error(
          `redeem-invite rejected: auth user exists for a non-invited address (invite ${invite.id})`
        );
        return json({ error: SAFE_ERROR_MESSAGES.email_taken, reason: 'email_taken' }, 409);
      }
    } else {
      // Genuinely new registrant — the bug condition case (2.1).
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: reg.email,
        password: reg.password,
        email_confirm: preConfirm, // 2.7 / 2.8
        user_metadata: { first_name: reg.first_name, last_name: reg.last_name },
      });

      if (createError || !created?.user) {
        throw new RedeemError(
          mapError(createError ?? 'auth user creation returned no user'),
          400,
          createError,
          'create_auth_user'
        );
      }

      userId = created.user.id;
      ledger.authUser = { userId, createdByThisInvocation: true };
    }

    // --- 4. Profile row (3.5) -------------------------------------------
    if (!profileAlreadyExisted) {
      const nowIso = new Date().toISOString();
      const profilePayload = {
        id: userId,
        email: reg.email,
        first_name: reg.first_name,
        last_name: reg.last_name,
        cellphone: '',
        role: effectiveRole,
        user_type: 'lite',
        active: true,
        privacy_consent_at: reg.privacy_consent ? nowIso : null,
      };

      const { error: insertError } = await admin.from('users').insert(profilePayload);

      if (insertError) {
        // Migration 006 installs an `on_auth_user_created` trigger that inserts
        // a bare `public.users` row. Where that trigger is live, the row above
        // already exists and carries the trigger's defaults (`user_type` 'full',
        // no consent timestamp), so it is corrected rather than duplicated.
        const isDuplicate = /duplicate key|already exists|23505/i.test(
          `${insertError.code ?? ''} ${insertError.message ?? ''}`
        );
        if (!isDuplicate) {
          throw new RedeemError(mapError(insertError), 400, insertError, 'insert_profile');
        }

        const { id: _id, ...profileUpdate } = profilePayload;
        const { error: updateError } = await admin
          .from('users')
          .update(profileUpdate)
          .eq('id', userId);
        if (updateError) {
          throw new RedeemError(mapError(updateError), 400, updateError, 'update_profile');
        }
      }

      // Either way the row exists only because this invocation ran, so rollback
      // owns it.
      ledger.profileRow = { userId, createdByThisInvocation: true };
    }

    // --- 5. Team membership (3.2) ---------------------------------------
    const { data: existingMember, error: memberLookupError } = await admin
      .from('team_members')
      .select('id')
      .eq('team_id', invite.team_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberLookupError) {
      throw new RedeemError(
        SAFE_ERROR_MESSAGES.unavailable,
        500,
        memberLookupError,
        'member_lookup'
      );
    }

    if (existingMember) {
      // Already a member — leave the existing row alone, insert no duplicate.
      ledger.teamMember = {
        teamId: invite.team_id,
        userId,
        createdByThisInvocation: false,
      };
    } else {
      const { error: memberInsertError } = await admin
        .from('team_members')
        .insert({ team_id: invite.team_id, user_id: userId, role: effectiveRole });

      if (memberInsertError) {
        throw new RedeemError(
          mapError(memberInsertError),
          400,
          memberInsertError,
          'insert_team_member'
        );
      }

      ledger.teamMember = { teamId: invite.team_id, userId, createdByThisInvocation: true };
    }

    // --- 6. Redemption, last ---------------------------------------------
    // Only now that every other write has succeeded, so a failure never burns
    // the code.
    const { error: redeemError } = await admin
      .from('invite_codes')
      .update({ redeemed_by: userId, redeemed_at: new Date().toISOString() })
      .eq('id', invite.id);

    if (redeemError) {
      throw new RedeemError(mapError(redeemError), 400, redeemError, 'redeem_code');
    }

    // --- 7. Return the resolved user -------------------------------------
    const { data: user, error: fetchError } = await admin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      throw new RedeemError(
        SAFE_ERROR_MESSAGES.unavailable,
        500,
        fetchError ?? 'profile row missing after write',
        'fetch_profile'
      );
    }

    // The team row is returned as plain data (no branding, no formatting) so a
    // caller has it without a second round trip. `LiteLandingPage` renders
    // `{age_group} {name}` itself (3.8).
    const { data: team } = await admin
      .from('teams')
      .select('*')
      .eq('id', invite.team_id)
      .maybeSingle();

    // --- 8. Non-matching path: confirmation link (2.2, 2.9) --------------
    // On the non-matching-address path the account is held behind an email
    // confirmation gate. The confirmation link is generated here, server-side,
    // under `service_role` (2.2) so the caller can hand it to `send-email`
    // (type `confirm_registration`) rather than relying on GoTrue's built-in
    // SMTP.
    //
    // Generation failure is NOT a registration failure. The account is already
    // committed and must be preserved (2.9), so this runs in its own try/catch
    // and never reaches the outer catch that would roll the account back. On
    // failure we log the raw detail and signal that confirmation is required
    // but the email could not be sent, leaving the account intact for a retry.
    let confirmationLink: string | null = null;
    let confirmationEmailSent = true;

    if (!preConfirm) {
      try {
        const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
          type: 'signup',
          email: reg.email,
          password: reg.password,
        });

        const actionLink = linkData?.properties?.action_link ?? null;
        if (linkError || !actionLink) {
          throw linkError ?? new Error('generateLink returned no action_link');
        }

        confirmationLink = actionLink;
      } catch (linkError) {
        // 2.9: log the failure, preserve the created account (no rollback),
        // and report that confirmation is required but the email was not sent.
        console.error('redeem-invite confirmation link generation failed:', linkError);
        confirmationEmailSent = false;
      }
    }

    return json({
      success: true,
      user,
      team: team ?? null,
      // Mirrors 2.7 / 2.8 so the caller can tell "log in now" from "check your
      // email" without inspecting the auth user.
      email_confirmed: preConfirm,
      email_confirmation_required: !preConfirm,
      // Present only on the non-matching path: the server-generated link the
      // caller sends via `send-email`, and whether that email could be sent at
      // all. `confirmation_email_sent: false` is the "confirmation required but
      // not sent" signal (2.9).
      ...(preConfirm
        ? {}
        : { confirmation_link: confirmationLink, confirmation_email_sent: confirmationEmailSent }),
    });
  } catch (error) {
    // Anything past this point may have written something. Undo this
    // invocation's own records, in reverse, and nothing else.
    await runCompensations(admin, ledger);

    if (error instanceof RedeemError) {
      console.error(`redeem-invite failed (${error.code ?? 'unclassified'}):`, error.detail);
      return json(
        { error: error.safeMessage, ...(error.code ? { reason: error.code } : {}) },
        error.status
      );
    }

    // Unclassified: log the raw detail for diagnosis, return only a safe
    // message. No Postgres policy or constraint text ever leaves here (2.4).
    console.error('redeem-invite unexpected failure:', error);
    return json({ error: mapError(error) }, 500);
  }
});
