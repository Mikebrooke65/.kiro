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
  ADD_PLAYER_MESSAGES,
  deriveInviteStatus,
  emailMatchesInvite,
  isAdult,
  mapError,
  messageForInviteStatus,
  normalizeEmail,
  plannedCompensations,
  requiresTeamMembership,
  resolveEffectiveRole,
  SAFE_ERROR_MESSAGES,
  VALIDATION_MESSAGES,
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
        case 'delete_caregiver_link': {
          const { error } = await admin
            .from('player_caregivers')
            .delete()
            .eq('player_id', compensation.playerId)
            .eq('caregiver_id', compensation.caregiverId);
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

    // --- 2b. Adult self-declared date of birth (add-player-and-dob-age-model
    // Requirement 3.4, 3.5) ------------------------------------------------
    // Deliberately placed here — before step 3, before any write in this
    // invocation — so a rejection has nothing to compensate (Property 3).
    // A Caregiver invite never carries a date of birth (Requirement 4.1's DOB
    // exception is the child's, recorded separately by caregivers-api, not
    // here), so this check is skipped entirely for that one role.
    //
    // Deliberately keyed on `effectiveRole !== 'caregiver'` directly rather
    // than reusing `requiresTeamMembership` — the two happen to share the
    // same boolean today, but they are independent decisions (one about
    // team_members, one about date_of_birth) and should not be coupled just
    // because they currently agree.
    if (effectiveRole !== 'caregiver') {
      if (!reg.date_of_birth) {
        throw new RedeemError(
          VALIDATION_MESSAGES.missing_date_of_birth,
          400,
          'missing date_of_birth for a self-registering role',
          'missing_date_of_birth'
        );
      }
      if (!isAdult(reg.date_of_birth)) {
        throw new RedeemError(
          ADD_PLAYER_MESSAGES.underage_self_registration,
          400,
          'self-declared date of birth indicates under 16',
          'underage_self_registration'
        );
      }
    }

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
        // add-player-and-dob-age-model Requirement 3.4: the self-declared DOB
        // confirmed at redemption, not the Manager's Add Player routing
        // guess. Never set for a caregiver — this feature never asks one for
        // their own date of birth (step 2b above only required it for the
        // other three roles).
        date_of_birth: effectiveRole === 'caregiver' ? null : reg.date_of_birth,
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

    // --- 5. Team membership (3.2), or 5b. Caregiver link -----------------
    // add-player-and-dob-age-model Requirement 6.1/6.2: exactly one of these
    // two runs, decided by `requiresTeamMembership` and never anything else
    // (Property 9). `team_members.role` stays CHECK'd to
    // player/coach/manager only (migration 048) — a caregiver never gets a
    // row here, by design, not by omission.
    if (requiresTeamMembership(effectiveRole)) {
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
    } else {
      // --- 5b. Caregiver link (Requirement 4.6, 5.1, 5.4) -----------------
      // invite.subject_user_id is the child this Caregiver invite is about
      // (set only for a 'caregiver'-intended invite, migration 053). It must
      // still resolve to a Junior user at redemption time — Requirement 5.4
      // guards against the child record having been removed since the
      // invite was generated.
      if (!invite.subject_user_id) {
        throw new RedeemError(
          ADD_PLAYER_MESSAGES.caregiver_subject_missing,
          400,
          'caregiver invite has no subject_user_id',
          'subject_missing'
        );
      }

      const { data: subjectUser, error: subjectError } = await admin
        .from('users')
        .select('id, is_child')
        .eq('id', invite.subject_user_id)
        .maybeSingle();

      if (subjectError) {
        throw new RedeemError(SAFE_ERROR_MESSAGES.unavailable, 500, subjectError, 'subject_lookup');
      }
      if (!subjectUser || !subjectUser.is_child) {
        throw new RedeemError(
          ADD_PLAYER_MESSAGES.caregiver_subject_missing,
          400,
          'subject_user_id no longer resolves to a Junior user',
          'subject_missing'
        );
      }

      // Dedupe: mirrors link-player-caregiver's own dedupe (Task 1) so
      // redeeming twice, or redeeming after an admin already linked the pair
      // some other way, is a no-op rather than an error. `.select()` after an
      // `ignoreDuplicates` upsert returns only the row(s) actually inserted —
      // empty when the link already existed — which is how
      // `createdByThisInvocation` below is determined precisely, the same
      // discipline every other ledger entry in this file follows.
      const { data: linkResult, error: linkError } = await admin
        .from('player_caregivers')
        .upsert(
          { player_id: invite.subject_user_id, caregiver_id: userId },
          { onConflict: 'player_id,caregiver_id', ignoreDuplicates: true }
        )
        .select('player_id, caregiver_id');

      if (linkError) {
        throw new RedeemError(mapError(linkError), 400, linkError, 'insert_caregiver_link');
      }

      ledger.caregiverLink = {
        playerId: invite.subject_user_id,
        caregiverId: userId,
        createdByThisInvocation: (linkResult?.length ?? 0) > 0,
      };
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

    // --- 7b. Pending-approval signal (add-player-and-dob-age-model
    // Requirement 8.2) ------------------------------------------------------
    // Only meaningful on the Caregiver path: does the child this invite was
    // about (invite.subject_user_id) still have a pending caregiver_approvals
    // row? If so the client routes the caregiver's first authenticated screen
    // straight to Caregiver Approvals instead of Home. Redeeming the invite
    // never touches this row itself (Property 7) — it is a read, not a write.
    // `caregiver_approvals` has no caregiver_id column (migration 036); the
    // player_id match alone is precise because Requirement 5.4's subject
    // check above already confirmed this exact child.
    let hasPendingApproval = false;
    if (effectiveRole === 'caregiver' && invite.subject_user_id) {
      const { data: pendingApproval } = await admin
        .from('caregiver_approvals')
        .select('id')
        .eq('player_id', invite.subject_user_id)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();
      hasPendingApproval = !!pendingApproval;
    }

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
      // add-player-and-dob-age-model Requirement 8.2 — true only for a
      // Caregiver-invite redemption whose child still has a pending
      // caregiver_approvals row; false (not omitted) on every other path, so
      // the client never needs to distinguish "false" from "not present".
      has_pending_approval: hasPendingApproval,
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
