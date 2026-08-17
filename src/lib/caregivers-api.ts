import { ApiClient, ApiError } from './api-client';
import type {
  PlayerCaregiver,
  CaregiverApproval,
  NewCaregiverData,
  Team,
} from '../types/database';
import { emailApi } from './email-api';
import {
  validateAddJunior,
  resolveCaregiver,
  resolveCaregiverLink,
  assignChildProvenance,
  applyConsentDecision,
  type AddJuniorForm,
  type FieldError,
  type ConsentDecision,
} from './add-junior-logic';

/**
 * Outcome of `addJunior`. On validation failure the entered values are kept by
 * the caller and the invalid fields are reported (Req 5.3); on success the ids
 * of the created/reused rows are returned.
 */
export type AddJuniorResult =
  | { ok: false; errors: FieldError[] }
  | { ok: true; childId: string; caregiverId: string; approvalId: string };

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

  /** Get pending approval requests for a caregiver's linked players */
  async getMyPendingApprovals(caregiverId: string): Promise<CaregiverApproval[]> {
    // Get player IDs this caregiver is linked to
    const { data: links } = await this.supabase
      .from('player_caregivers')
      .select('player_id')
      .eq('caregiver_id', caregiverId);

    if (!links || links.length === 0) return [];

    const playerIds = links.map((l: any) => l.player_id);

    const { data, error } = await this.supabase
      .from('caregiver_approvals')
      .select('*')
      .in('player_id', playerIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    return data as CaregiverApproval[];
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
   * Add a junior to a Club Tournament team with caregiver consent (Req 5.4–5.9).
   *
   * Steps, in order:
   * 1. Validate the form; reject and report invalid fields (Req 5.3).
   * 2. Resolve the caregiver `users` row by email: reuse if it exists
   *    (Req 5.5), otherwise create a sign-in-capable row with the real email
   *    (Req 5.4).
   * 3. Create an inactive child `users` row with a synthetic, non-sign-in email
   *    and recorded provenance (Req 5.6, 5.16).
   * 4. Link child ↔ caregiver in `player_caregivers`, no duplicate (Req 5.7).
   * 5. Insert a pending `caregiver_approvals` record (Req 5.8).
   * 6. Notify the caregiver via `send-email` (Req 5.9), fire-and-forget.
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

    // 2. Resolve the caregiver (Req 5.4/5.5) — reuse the pure helper.
    const normalizedEmail = form.caregiverEmail.trim().toLowerCase();
    const { data: matchingUsers, error: userLookupError } = await this.supabase
      .from('users')
      .select('id, email')
      .ilike('email', normalizedEmail);
    if (userLookupError) throw new ApiError(userLookupError.message);

    const [caregiverFirstName, ...caregiverRest] = form.caregiverName.trim().split(/\s+/);
    const caregiverLastName = caregiverRest.join(' ');

    const caregiverResolution = resolveCaregiver(normalizedEmail, matchingUsers || []);
    let caregiverId: string;
    if (caregiverResolution.action === 'reuse') {
      caregiverId = caregiverResolution.caregiverId;
    } else {
      caregiverId = await this.createAuthUser({
        email: normalizedEmail,
        first_name: caregiverFirstName || form.caregiverName.trim(),
        last_name: caregiverLastName || '',
        cellphone: form.caregiverPhone.trim(),
        role: 'caregiver',
        active: true,
        can_sign_in: true,
      });
    }

    // 3. Create the inactive child row (Req 5.6, 5.16). The Edge Function
    // generates the synthetic email and withholds sign-in.
    const childId = await this.createAuthUser({
      first_name: form.childFirstName.trim(),
      last_name: form.childLastName.trim(),
      role: 'player',
      active: false,
      is_child: true,
      child_provenance: provenance,
      can_sign_in: false,
    });

    // 4. Link child ↔ caregiver with no duplicate (Req 5.7) — reuse the helper.
    const { data: existingLinks, error: linkLookupError } = await this.supabase
      .from('player_caregivers')
      .select('player_id, caregiver_id')
      .eq('player_id', childId);
    if (linkLookupError) throw new ApiError(linkLookupError.message);

    if (resolveCaregiverLink(childId, caregiverId, existingLinks || []).action === 'create') {
      const { error: linkError } = await this.supabase
        .from('player_caregivers')
        .insert({ player_id: childId, caregiver_id: caregiverId });
      if (linkError) throw new ApiError(linkError.message);
    }

    // 5. Insert the pending consent record (Req 5.8).
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

    // 6. Notify the caregiver (Req 5.9). Fire-and-forget: a send failure must
    // not undo the records already written (mirrors the matching-path welcome).
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

    return { ok: true, childId, caregiverId, approvalId: (approval as CaregiverApproval).id };
  }

  /**
   * Respond to a pending add-child request (Req 5.11, 5.12).
   *
   * Uses `applyConsentDecision` to compute the new status, `responded_at`, and
   * whether the child becomes active, then persists both the approval row and
   * the child's `users.active` flag. `approve` activates the child; `deny` and
   * `escalate` leave it inactive.
   */
  async respondToJuniorApproval(
    approvalId: string,
    decision: ConsentDecision,
    respondedBy: string
  ): Promise<CaregiverApproval> {
    const outcome = applyConsentDecision(decision, new Date().toISOString());

    const { data, error } = await this.supabase
      .from('caregiver_approvals')
      .update({
        status: outcome.status,
        responded_by: respondedBy,
        responded_at: outcome.respondedAt,
      })
      .eq('id', approvalId)
      .select()
      .single();
    if (error) throw new ApiError(error.message);

    const approval = data as CaregiverApproval;

    // Activate or keep the child inactive to match the decision (Req 5.11/5.12).
    const { error: childError } = await this.supabase
      .from('users')
      .update({ active: outcome.childActive })
      .eq('id', approval.player_id);
    if (childError) throw new ApiError(childError.message);

    return approval;
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
