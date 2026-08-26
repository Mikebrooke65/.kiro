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
  AGE_TICK_MESSAGES,
  deriveInviteStatus,
  emailMatchesInvite,
  mapError,
  messageForInviteStatus,
  normalizeEmail,
  plannedCompensations,
  requiresTeamMembership,
  resolveAgeTickOutcome,
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

    // The role implied by the invite itself — 'player'/'coach'/'manager' for
    // an Adult-ticked Add Player submission, 'caregiver' for a Child-ticked
    // one (Section 1's tick decides which kind of invite got generated in
    // the first place, see add-player-logic.ts routeAddPlayerFromTick).
    // `resolveEffectiveRole` degrades any absent, unknown, or privileged
    // value (including 'admin') to 'player' (6.4 / 6.5 of the superseded
    // spec), so a crafted invite can never confer an elevated role.
    const invitedRole = resolveEffectiveRole(invite.intended_role);

    // --- 2a. Resolve identity — read-only, moved ahead of the DOB/tick gate
    // (`.kiro/specs/streamlined-invites-and-child-access/` Requirement 2)
    // ------------------------------------------------------------------
    // `public.users.id` references `auth.users(id)`, so every profile row has an
    // auth user. Looking the auth user up first therefore settles all three
    // cases, and does it case-insensitively, which a `users.email` equality
    // lookup would not.
    //
    // This used to run as part of step 3, after 2b's DOB/tick gate. It moved
    // here — still read-only, no ledger entries yet, nothing written — so 2b
    // can know `profileAlreadyExisted` before deciding whether to run at all.
    // Requirement 2.2's existing-user bypass sends a "join {team}" request
    // with no name/password/DOB fields; 2b would otherwise reject that
    // request as `missing_date_of_birth`/`missing_subject_details` for an
    // account that isn't declaring anything new — it already went through
    // whatever registration gate applied when it was first created,
    // elsewhere. `existingAuthUser`/`existingProfile` are reused verbatim in
    // step 3 below rather than re-queried.
    const existingAuthUser = await findAuthUserByEmail(supabaseUrl, serviceKey, reg.email);
    let existingProfile: { id: string } | null = null;
    if (existingAuthUser) {
      const { data: profile, error: profileError } = await admin
        .from('users')
        .select('id')
        .eq('id', existingAuthUser.id)
        .maybeSingle();
      if (profileError) {
        throw new RedeemError(SAFE_ERROR_MESSAGES.unavailable, 500, profileError, 'profile_lookup');
      }
      existingProfile = profile;
    }
    const profileAlreadyExisted = !!existingProfile;

    // --- 2b. Symmetric self-declared date of birth + wrong-tick outcomes
    // (`.kiro/specs/streamlined-invites-and-child-access/` Requirement 5, 6)
    // ------------------------------------------------------------------
    // Deliberately placed here — before step 3's writes — so a rejection has
    // nothing to compensate (Property 3, carried over from the superseded
    // spec this replaces).
    //
    // `redemptionRole`/`finalDateOfBirth` are what every later step uses —
    // never `invitedRole` directly — because Requirement 6.2's conversion
    // changes which role and whose date of birth apply for the rest of this
    // invocation, without changing what the invite itself originally said.
    let redemptionRole = invitedRole;
    let finalDateOfBirth: string | null = null;
    let convertedFromCaregiver = false;

    if (profileAlreadyExisted) {
      // Requirement 2.2 — an existing account joining a further team (or
      // becoming caregiver for a further child) is not a new registration:
      // nothing is being self-declared for the first time, so there is no
      // DOB/tick outcome to resolve. `redemptionRole` stays exactly what the
      // invite said; `finalDateOfBirth` stays null and is never read again —
      // step 4's profile insert is skipped for an existing profile too.
    } else if (invitedRole !== 'caregiver') {
      // Adult-ticked path (Requirement 5.1): the redeeming person's own DOB.
      if (!reg.date_of_birth) {
        throw new RedeemError(
          VALIDATION_MESSAGES.missing_date_of_birth,
          400,
          'missing date_of_birth for a self-registering role',
          'missing_date_of_birth'
        );
      }
      const outcome = resolveAgeTickOutcome(invitedRole, reg.date_of_birth);
      if (outcome === 'invalid_date_of_birth') {
        throw new RedeemError(
          AGE_TICK_MESSAGES.invalid_date_of_birth,
          400,
          'self-declared date of birth could not be parsed',
          'invalid_date_of_birth'
        );
      }
      if (outcome === 'bounce_to_manager') {
        // 6.1, RESOLVED: no inline caregiver-naming — stop here and send the
        // person back to their Manager. Nothing has been written yet.
        throw new RedeemError(
          AGE_TICK_MESSAGES.bounce_to_manager,
          400,
          'self-declared date of birth indicates under 16 — bounced to Manager per 6.1',
          'bounce_to_manager'
        );
      }
      // outcome === 'ok' — 'convert_to_adult' cannot occur for a non-caregiver
      // invitedRole (resolveAgeTickOutcome only returns it for 'caregiver').
      finalDateOfBirth = reg.date_of_birth;
    } else {
      // Child-ticked path (Requirement 5.2/5.3): the child's DOB and name,
      // as entered by the caregiver — never a Manager's guess.
      if (!reg.subject_date_of_birth || !reg.subject_first_name || !reg.subject_last_name) {
        throw new RedeemError(
          AGE_TICK_MESSAGES.missing_subject_details,
          400,
          "missing the child's name and/or date of birth for a caregiver redemption",
          'missing_subject_details'
        );
      }
      const outcome = resolveAgeTickOutcome('caregiver', reg.subject_date_of_birth);
      if (outcome === 'invalid_date_of_birth') {
        throw new RedeemError(
          AGE_TICK_MESSAGES.invalid_date_of_birth,
          400,
          "child's self-declared date of birth could not be parsed",
          'invalid_date_of_birth'
        );
      }
      if (outcome === 'convert_to_adult') {
        // 6.2, RESOLVED: convert in place. The person completing this form
        // is an adult, not a caregiver — redeem as a normal self-registering
        // adult instead of linking to the child record Add Player created.
        // That child record is left exactly as it was (inactive, unlinked)
        // — nothing here deletes or repurposes it; Requirement 8.4's
        // consent-timeout job is what eventually clears a stale one.
        redemptionRole = 'player';
        finalDateOfBirth = reg.subject_date_of_birth;
        convertedFromCaregiver = true;
      } else {
        // outcome === 'ok' — genuinely a child, as ticked.
        finalDateOfBirth = null; // never set on a caregiver's own profile row
      }
    }

    // --- 3. Resolve the user (writes) ------------------------------------
    // `existingAuthUser`/`existingProfile` were already looked up in step 2a
    // above; nothing here re-queries them.
    let userId: string;

    if (existingAuthUser) {
      const profile = existingProfile;

      // Whatever happens below, this auth user pre-existed. Recording it as not
      // created by this invocation is what stops rollback deleting a real
      // account (3.1).
      ledger.authUser = { userId: existingAuthUser.id, createdByThisInvocation: false };
      userId = existingAuthUser.id;

      if (profile) {
        // 3.1 — existing user: create nothing, they just gain the membership.
        // (`profileAlreadyExisted` was already derived from this same
        // `profile` lookup back in step 2a.)
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
        role: redemptionRole,
        user_type: 'lite',
        active: true,
        privacy_consent_at: reg.privacy_consent ? nowIso : null,
        // streamlined-invites-and-child-access Requirement 5: the
        // self-declared DOB confirmed at redemption, not a Manager's guess —
        // `finalDateOfBirth` is already resolved by step 2b above to the
        // right value for whichever path this redemption actually took
        // (including a Requirement 6.2 conversion), so no role check is
        // needed here.
        date_of_birth: finalDateOfBirth,
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
    if (requiresTeamMembership(redemptionRole)) {
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
          .insert({ team_id: invite.team_id, user_id: userId, role: redemptionRole });

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

      // streamlined-invites-and-child-access Requirement 5.3: the child's
      // name and date of birth, as just entered by the caregiver, are the
      // record of truth — not whatever the Manager typed as a label in Add
      // Player (Requirement 1.1). Written unconditionally here rather than
      // only-if-blank: a caregiver correcting a name at this exact moment is
      // exactly what Requirement 5.3 is for. `reg.subject_date_of_birth` is
      // guaranteed non-null here — step 2b already required it and only
      // reaches this branch on outcome 'ok'.
      //
      // Requirement 2.2, guarded: skipped entirely for an existing caregiver
      // account linking to a further child (the existing-user bypass sends
      // no subject fields at all — none of `reg.subject_*` is guaranteed
      // non-null in that case). Writing `null`s here would blank out a
      // child's already-recorded name/DOB purely because the *caregiver's*
      // account happened to already exist; the child record this invite
      // points at is untouched instead, exactly like step 4's profile
      // insert is skipped for the same reason.
      if (!profileAlreadyExisted) {
        const { error: subjectUpdateError } = await admin
          .from('users')
          .update({
            first_name: reg.subject_first_name,
            last_name: reg.subject_last_name,
            date_of_birth: reg.subject_date_of_birth,
          })
          .eq('id', invite.subject_user_id);

        if (subjectUpdateError) {
          throw new RedeemError(
            mapError(subjectUpdateError),
            400,
            subjectUpdateError,
            'update_subject'
          );
        }
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
    // Deliberately `redemptionRole`, not `invitedRole`: a Requirement 6.2
    // conversion means this person is not becoming a caregiver at all, so
    // there is no "Caregiver Approvals" screen to route them to even though
    // the invite was originally caregiver-intended.
    let hasPendingApproval = false;
    if (redemptionRole === 'caregiver' && invite.subject_user_id) {
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
      // streamlined-invites-and-child-access Requirement 6.2 — true only
      // when this redemption converted from a Child-ticked caregiver invite
      // into a normal adult registration. `user.role` already reflects the
      // converted role ('player'); this is an explicit signal so the client
      // can show the "you were registered as yourself, not a caregiver"
      // messaging without inferring it from role alone.
      converted_from_caregiver: convertedFromCaregiver,
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
