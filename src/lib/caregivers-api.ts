import { ApiClient, ApiError } from './api-client';
import type {
  PlayerCaregiver,
  CaregiverApproval,
  NewCaregiverData,
  Team,
} from '../types/database';
import { emailApi } from './email-api';
import { invitesApi } from './invites-api';
import {
  validateAddJunior,
  resolveCaregiver,
  resolveCaregiverLink,
  assignChildProvenance,
  type AddJuniorForm,
  type FieldError,
  type ConsentDecision,
} from './add-junior-logic';

/**
 * Outcome of `addJunior`. On validation failure the entered values are kept by
 * the caller and the invalid fields are reported (Req 5.3); on success the ids
 * of the created/reused rows are returned.
 *
 * `caregiverId` is `null` when `caregiverInvited` is `true`: the invite
 * branch (Requirement 4.3) doesn't create a caregiver account synchronously,
 * so there is no id yet — the caregiver's `users` row is created only when
 * they redeem the invite.
 */
export type AddJuniorResult =
  | { ok: false; errors: FieldError[] }
  | {
      ok: true;
      childId: string;
      caregiverId: string | null;
      caregiverInvited: boolean;
      approvalId: string;
    };

/** A `caregiver_approvals` row with the linked player's name embedded. */
export type CaregiverApprovalWithPlayer = CaregiverApproval & {
  player?: { first_name: string; last_name: string } | null;
};

class CaregiversApi extends ApiClient {
  /** Get all caregivers for a player */
  async getPlayerCaregivers(playerId: string): Promise<(PlayerCaregiver & { caregiver: any })[]> {
    const { data, error } = await this.supabase
      .from('player_caregivers')
      .select('*, caregiver:users!player_caregivers_caregiver_id_fkey(*)')
      .eq('player_id', playerId);

    if (error) throw new ApiError(error.message);
    return data || [];
  }

  /** Get all players for a caregiver */
  async getCaregiverPlayers(caregiverId: string): Promise<(PlayerCaregiver & { player: any })[]> {
    const { data, error } = await this.supabase
      .from('player_caregivers')
      .select('*, player:users!player_caregivers_player_id_fkey(*)')
      .eq('caregiver_id', caregiverId);

    if (error) throw new ApiError(error.message);
    return data || [];
  }

  /** Link a caregiver to a player */
  async linkCaregiverToPlayer(caregiverId: string, playerId: string): Promise<PlayerCaregiver> {
    const { data, error } = await this.supabase
      .from('player_caregivers')
      .insert({ caregiver_id: caregiverId, player_id: playerId })
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as PlayerCaregiver;
  }

  /** Unlink a caregiver from a player */
  async unlinkCaregiverFromPlayer(caregiverId: string, playerId: string): Promise<void> {
    const { error } = await this.supabase
      .from('player_caregivers')
      .delete()
      .eq('caregiver_id', caregiverId)
      .eq('player_id', playerId);

    if (error) throw new ApiError(error.message);
  }

  /** Request adding a new caregiver to a player. Skips approval if player has no existing caregivers. */
  async requestCaregiverAddition(
    playerId: string,
    caregiverData: NewCaregiverData,
    requestedBy: string
  ): Promise<CaregiverApproval | null> {
    // Check if player has existing caregivers
    const { data: existing } = await this.supabase
      .from('player_caregivers')
      .select('id')
      .eq('player_id', playerId);

    if (!existing || existing.length === 0) {
      // No existing caregivers — skip approval, create directly
      await this.createCaregiverDirectly(playerId, caregiverData);
      return null; // null signals approval was skipped
    }

    // Create approval request
    const { data, error } = await this.supabase
      .from('caregiver_approvals')
      .insert({
        player_id: playerId,
        new_caregiver_email: caregiverData.email,
        new_caregiver_first_name: caregiverData.first_name,
        new_caregiver_last_name: caregiverData.last_name,
        requested_by: requestedBy,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as CaregiverApproval;
  }

  /** Respond to a caregiver approval request */
  async respondToApproval(
    approvalId: string,
    approved: boolean,
    respondedBy: string
  ): Promise<CaregiverApproval> {
    const status = approved ? 'approved' : 'denied';

    const { data, error } = await this.supabase
      .from('caregiver_approvals')
      .update({
        status,
        responded_by: respondedBy,
        responded_at: new Date().toISOString(),
      })
      .eq('id', approvalId)
      .select()
      .single();

    if (error) throw new ApiError(error.message);

    // If approved, create the caregiver account and send invite
    if (approved && data) {
      await this.createCaregiverDirectly(data.player_id, {
        first_name: data.new_caregiver_first_name,
        last_name: data.new_caregiver_last_name,
        email: data.new_caregiver_email,
      });
    }

    return data as CaregiverApproval;
  }

  /**
   * Get pending approval requests for a caregiver's linked players.
   *
   * Embeds the player's name (`request_kind: 'add_child'` rows are a
   * caregiver being asked to consent to a *child*, not to themself, so the
   * UI needs the child's name to label the request correctly — see
   * `CaregiverApprovalPage.tsx`).
   */
  async getMyPendingApprovals(caregiverId: string): Promise<CaregiverApprovalWithPlayer[]> {
    // Get player IDs this caregiver is linked to
    const { data: links } = await this.supabase
      .from('player_caregivers')
      .select('player_id')
      .eq('caregiver_id', caregiverId);

    if (!links || links.length === 0) return [];

    const playerIds = links.map((l: any) => l.player_id);

    const { data, error } = await this.supabase
      .from('caregiver_approvals')
      .select('*, player:users!caregiver_approvals_player_id_fkey(first_name, last_name)')
      .in('player_id', playerIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    return data as CaregiverApprovalWithPlayer[];
  }

  /**
   * Count of pending approval requests for a caregiver (Req 8.3).
   *
   * Thin wrapper over `getMyPendingApprovals` — drives the Approvals nav
   * tab's badge and visibility (Task 12), which needs only the count, not
   * the full request list.
   */
  async getPendingApprovalCount(caregiverId: string): Promise<number> {
    const approvals = await this.getMyPendingApprovals(caregiverId);
    return approvals.length;
  }

  /** Escalate approvals that have been pending for more than 7 days */
  async escalateTimedOutApprovals(): Promise<CaregiverApproval[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from('caregiver_approvals')
      .update({ status: 'escalated' })
      .eq('status', 'pending')
      .lt('created_at', sevenDaysAgo)
      .select();

    if (error) throw new ApiError(error.message);
    return data as CaregiverApproval[];
  }

  // -------------------------------------------------------------------------
  // Add-a-Junior consent flow (Req 5.4–5.9, 5.11, 5.12)
  //
  // Orchestration lives here and reuses the pure helpers in
  // `add-junior-logic.ts` (validate / resolve caregiver / dedupe link /
  // provenance / consent decision). The single step the browser cannot do —
  // creating `auth.users` rows — is delegated to the `create-auth-user` Edge
  // Function (service role). Everything else (the `player_caregivers` link, the
  // `caregiver_approvals` record, the notification) is an ordinary RLS-governed
  // client write, matching the existing add-a-caregiver flow above.
  //
  // DEPLOYMENT: relies on `create-auth-user` and `send-email` Edge Functions
  // being deployed (`supabase functions deploy ...`).
  // -------------------------------------------------------------------------

  /**
   * Add a junior to a Club Tournament team with caregiver consent (Req 5.4–5.9;
   * caregiver provisioning updated by `.kiro/specs/add-player-and-dob-age-model/`
   * Requirement 4.3/4.4/4.5, task 9.2).
   *
   * Steps, in order:
   * 1. Validate the form; reject and report invalid fields (Req 5.3).
   * 2. Create an inactive child `users` row with a synthetic, non-sign-in email
   *    and recorded provenance (Req 5.6, 5.16) — moved ahead of caregiver
   *    resolution because the Caregiver invite (step 3b below) must carry the
   *    child's id as `subject_user_id`, and that id doesn't exist until this
   *    row is created.
   * 3. Resolve the caregiver `users` row by email:
   *    - Reuse (Requirement 4.4, unchanged): an account already exists, so
   *      link it to the child immediately (step 3a) and notify by the
   *      existing approval-request email, exactly as before this feature.
   *    - Invite (Requirement 4.3, new): no account exists, so generate a
   *      Caregiver invite (`intended_role: 'caregiver'`, `subjectUserId:
   *      childId`) instead of creating the account directly, and send it via
   *      the same invite-email pattern every other invite uses (step 3b).
   *      No `player_caregivers` link is created here — the `redeem-invite`
   *      Edge Function creates it at redemption time from the invite's own
   *      `subject_user_id` (Requirement 4.5's "was just invited" branch).
   * 4. Insert a pending `caregiver_approvals` record (Req 5.8) — unconditional:
   *    it doesn't reference a caregiver id (that table has none), so it's
   *    created the same way regardless of which branch step 3 took.
   */
  async addJunior(teamId: string, form: AddJuniorForm): Promise<AddJuniorResult> {
    // 1. Validate (Req 5.3) — reuse the pure helper.
    const validation = validateAddJunior(form);
    if (!validation.ok) {
      return { ok: false, errors: validation.errors };
    }

    const { data: { user: authUser } } = await this.supabase.auth.getUser();
    if (!authUser) throw new ApiError('Not authenticated');

    // Fetch the team to derive provenance and the display name for the email.
    const { data: team, error: teamError } = await this.supabase
      .from('teams')
      .select('id, name, age_group, team_type')
      .eq('id', teamId)
      .single();
    if (teamError || !team) {
      throw new ApiError(teamError?.message || 'Team not found');
    }
    const teamRow = team as Pick<Team, 'id' | 'name' | 'age_group' | 'team_type'>;
    const provenance = assignChildProvenance(teamRow.team_type);

    // 2. Create the inactive child row (Req 5.6, 5.16) — ahead of caregiver
    // resolution; see the ordering note in the doc comment above. The Edge
    // Function generates the synthetic email and withholds sign-in.
    const childId = await this.createAuthUser({
      first_name: form.childFirstName.trim(),
      last_name: form.childLastName.trim(),
      role: 'player',
      active: false,
      is_child: true,
      child_provenance: provenance,
      can_sign_in: false,
    });

    // 3. Resolve the caregiver (Req 5.4/5.5, 4.3/4.4) — reuse the pure helper.
    const normalizedEmail = form.caregiverEmail.trim().toLowerCase();
    const { data: matchingUsers, error: userLookupError } = await this.supabase
      .from('users')
      .select('id, email')
      .ilike('email', normalizedEmail);
    if (userLookupError) throw new ApiError(userLookupError.message);

    const [caregiverFirstName, ...caregiverRest] = form.caregiverName.trim().split(/\s+/);
    const caregiverLastName = caregiverRest.join(' ');

    const caregiverResolution = resolveCaregiver(normalizedEmail, matchingUsers || []);
    let caregiverId: string | null = null;
    let caregiverInvited = false;

    if (caregiverResolution.action === 'reuse') {
      // 3a. Existing account (Req 4.4, unchanged): link it to the child now.
      // The read is fine client-side (player_caregivers SELECT is open to any
      // authenticated user, migration 036), but the INSERT is admin-only RLS,
      // so a coach/manager running this flow has no client-side write path.
      // That write goes through the `link-player-caregiver` Edge Function,
      // scoped to the caller being a coach/manager/admin of THIS team.
      caregiverId = caregiverResolution.caregiverId;

      const { data: existingLinks, error: linkLookupError } = await this.supabase
        .from('player_caregivers')
        .select('player_id, caregiver_id')
        .eq('player_id', childId);
      if (linkLookupError) throw new ApiError(linkLookupError.message);

      if (resolveCaregiverLink(childId, caregiverId, existingLinks || []).action === 'create') {
        await this.linkCaregiver(teamId, childId, caregiverId);
      }
    } else {
      // 3b. No account (Req 4.3, new): invite instead of creating one
      // directly. `subjectUserId` is what lets `redeem-invite` complete the
      // `player_caregivers` link server-side once this invite is redeemed.
      const invite = await invitesApi.generateInviteCode(
        teamId,
        normalizedEmail,
        form.caregiverPhone.trim(),
        undefined,
        'caregiver',
        childId
      );
      caregiverInvited = true;

      try {
        await emailApi.sendTeamInvite({
          to: normalizedEmail,
          recipientName: caregiverFirstName || undefined,
          teamName: `${teamRow.age_group} ${teamRow.name}`,
          inviteCode: invite.code,
        });
      } catch (err) {
        // The invite row exists either way; a send failure shouldn't undo it
        // (mirrors every other fire-and-forget email in this flow) but is
        // worth surfacing since without this email the caregiver has no way
        // to learn the invite exists.
        console.warn('Failed to send caregiver invite email:', err);
      }
    }

    // 4. Insert the pending consent record (Req 5.8) — unconditional; see
    // the doc comment above for why this doesn't depend on step 3's branch.
    const { data: approval, error: approvalError } = await this.supabase
      .from('caregiver_approvals')
      .insert({
        player_id: childId,
        new_caregiver_email: normalizedEmail,
        new_caregiver_first_name: caregiverFirstName || form.caregiverName.trim(),
        new_caregiver_last_name: caregiverLastName || '',
        requested_by: authUser.id,
        status: 'pending',
        request_kind: 'add_child',
        team_id: teamId,
      })
      .select()
      .single();
    if (approvalError) throw new ApiError(approvalError.message);

    // 5. Notify an EXISTING caregiver of the pending approval (Req 5.9). Not
    // sent on the invite branch (3b): that caregiver has no account yet to
    // log in and view it — the invite email (above) is their only notice
    // until they redeem it and reach the Approvals tab (Task 12).
    if (!caregiverInvited) {
      try {
        await emailApi.sendCaregiverApprovalRequest({
          to: normalizedEmail,
          recipientName: caregiverFirstName || undefined,
          childName: `${form.childFirstName.trim()} ${form.childLastName.trim()}`.trim(),
          teamName: `${teamRow.age_group} ${teamRow.name}`,
        });
      } catch (err) {
        console.warn('Failed to send caregiver approval-request email:', err);
      }
    }

    return {
      ok: true,
      childId,
      caregiverId,
      caregiverInvited,
      approvalId: (approval as CaregiverApproval).id,
    };
  }

  /**
   * Respond to a pending add-child request (Req 5.11, 5.12).
   *
   * `approve` activates the child and adds it to the team roster; `deny` and
   * `escalate` leave it inactive. All three writes this requires (the
   * approval row, `users.active`, and the `team_members` insert on approval)
   * go through the `respond-junior-approval` Edge Function: the caregiver
   * responding is neither an admin nor a coach/manager nor the child
   * themself, so client-side RLS permits the approval-row update but not the
   * other two. Doing all three server-side keeps the decision atomic —
   * `respondedBy` is taken from the caller's own auth session server-side,
   * so it's passed here only for the return type's sake.
   */
  async respondToJuniorApproval(
    approvalId: string,
    decision: ConsentDecision,
    _respondedBy: string
  ): Promise<CaregiverApproval> {
    const { data: result, error } = await this.supabase.functions.invoke(
      'respond-junior-approval',
      { body: { approval_id: approvalId, decision } }
    );

    if (error) {
      throw new ApiError(await extractFunctionError(error));
    }
    if (result?.error) {
      throw new ApiError(
        typeof result.error === 'string' ? result.error : 'Failed to respond to request'
      );
    }
    if (!result?.approval) {
      throw new ApiError('Failed to respond to request');
    }
    return result.approval as CaregiverApproval;
  }

  /** Approve a pending add-child request and activate the child (Req 5.11). */
  async approveJunior(approvalId: string, respondedBy: string): Promise<CaregiverApproval> {
    return this.respondToJuniorApproval(approvalId, 'approve', respondedBy);
  }

  /** Deny a pending add-child request; the child stays inactive (Req 5.12). */
  async denyJunior(approvalId: string, respondedBy: string): Promise<CaregiverApproval> {
    return this.respondToJuniorApproval(approvalId, 'deny', respondedBy);
  }

  /** Escalate a pending add-child request; the child stays inactive (Req 5.12). */
  async escalateJunior(approvalId: string, respondedBy: string): Promise<CaregiverApproval> {
    return this.respondToJuniorApproval(approvalId, 'escalate', respondedBy);
  }

  /**
   * Create an `auth.users` + `public.users` row via the service-role
   * `create-auth-user` Edge Function and return the new id. The browser cannot
   * create auth users directly (that needs the service-role key), so this is
   * the one step of `addJunior` that must run server-side.
   */
  private async createAuthUser(body: {
    email?: string;
    first_name: string;
    last_name: string;
    cellphone?: string;
    role: string;
    active: boolean;
    is_child?: boolean;
    child_provenance?: string;
    can_sign_in: boolean;
  }): Promise<string> {
    const { data: result, error } = await this.supabase.functions.invoke('create-auth-user', {
      body,
    });

    if (error) {
      throw new ApiError(await extractFunctionError(error));
    }
    if (result?.error) {
      throw new ApiError(
        typeof result.error === 'string' ? result.error : 'Failed to create user'
      );
    }
    if (!result?.id) {
      throw new ApiError('Failed to create user');
    }
    return result.id as string;
  }

  /**
   * Insert a `player_caregivers` link via the service-role
   * `link-player-caregiver` Edge Function. The browser cannot insert this
   * row directly — the only INSERT-capable RLS policy on that table is
   * admin-only — so this is the one step of `addJunior` that must run
   * server-side, gated on the caller being a coach/manager/admin of the
   * specific `teamId` the child is being added to.
   */
  private async linkCaregiver(
    teamId: string,
    playerId: string,
    caregiverId: string
  ): Promise<void> {
    const { data: result, error } = await this.supabase.functions.invoke(
      'link-player-caregiver',
      { body: { team_id: teamId, player_id: playerId, caregiver_id: caregiverId } }
    );

    if (error) {
      throw new ApiError(await extractFunctionError(error));
    }
    if (result?.error) {
      throw new ApiError(
        typeof result.error === 'string' ? result.error : 'Failed to link caregiver'
      );
    }
  }

  /** Create a caregiver user directly (used when no approval needed or after approval) */
  private async createCaregiverDirectly(
    playerId: string,
    caregiverData: NewCaregiverData
  ): Promise<void> {
    // Check if user already exists
    const { data: existingUser } = await this.supabase
      .from('users')
      .select('id')
      .eq('email', caregiverData.email)
      .single();

    let caregiverId: string;

    if (existingUser) {
      caregiverId = existingUser.id;
    } else {
      // For MVP: create a placeholder user record (they'll complete registration via invite)
      // The actual auth account is created when they redeem the invite code
      // For now, we just record the intent — the invite flow handles the rest
      console.log(`Caregiver ${caregiverData.email} will be invited to register`);
      return; // Invite code flow will handle user creation
    }

    // Link caregiver to player (skip if already linked)
    const { data: existingLink } = await this.supabase
      .from('player_caregivers')
      .select('id')
      .eq('player_id', playerId)
      .eq('caregiver_id', caregiverId)
      .single();

    if (!existingLink) {
      await this.supabase
        .from('player_caregivers')
        .insert({ player_id: playerId, caregiver_id: caregiverId });
    }
  }
}

/**
 * `functions.invoke` surfaces non-2xx responses as an opaque error — the useful
 * message is in the response body, read off `error.context`. Same approach as
 * `email-api.ts` / `invites-api.ts`; kept local so the fallback suits the
 * add-a-junior flow.
 */
async function extractFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) {
        return typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
      }
    } catch {
      // Body wasn't JSON — fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : 'Failed to add junior';
}

export const caregiversApi = new CaregiversApi();
