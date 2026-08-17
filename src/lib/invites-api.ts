import { ApiClient, ApiError } from './api-client';
import { emailApi } from './email-api';
import { formatTeamLabel } from './success-screen-logic';
import type { RedeemInviteResult } from './success-screen-logic';
import type {
  InviteCode,
  InviteCodeValidation,
  LiteRegistrationData,
  InvitePlayerData,
} from '../types/database';

// The Success Screen and this wrapper share one result shape. It lives in
// `success-screen-logic` (where its pure consumers are tested); re-exported here
// so callers can import it alongside `invitesApi` without redefining it.
export type { RedeemInviteResult };

/** Generate a random alphanumeric code */
function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

class InvitesApi extends ApiClient {
  /**
   * Generate a new invite code for a team, optionally linked to a competition.
   *
   * `intendedRole` records the role the invite is created for (Requirement 6.1/6.7).
   * It is persisted on the `invite_codes` row and honoured by `redeem-invite`,
   * which defaults a null/absent value to `player` server-side. `admin` is not a
   * valid intended role and is excluded by the DB CHECK constraint (migration 049).
   */
  async generateInviteCode(
    teamId: string,
    recipientEmail: string,
    recipientPhone?: string,
    competitionId?: string,
    intendedRole?: 'player' | 'coach' | 'manager'
  ): Promise<InviteCode> {
    const { data: { user: authUser } } = await this.supabase.auth.getUser();
    if (!authUser) throw new ApiError('Not authenticated');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000); // 21 days

    const { data, error } = await this.supabase
      .from('invite_codes')
      .insert({
        code: generateCode(),
        team_id: teamId,
        competition_id: competitionId || null,
        created_by: authUser.id,
        recipient_email: recipientEmail,
        recipient_phone: recipientPhone || null,
        expires_at: expiresAt.toISOString(),
        intended_role: intendedRole ?? null,
      })
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as InviteCode;
  }

  /** Validate an invite code — returns status and details */
  async validateInviteCode(code: string): Promise<InviteCodeValidation> {
    const { data, error } = await this.supabase
      .from('invite_codes')
      .select('*, team:teams(*)')
      .eq('code', code)
      .single();

    if (error || !data) {
      return { valid: false, error: 'invalid' };
    }

    if (data.redeemed_by) {
      return { valid: false, error: 'redeemed', invite: data };
    }

    if (new Date(data.expires_at) < new Date()) {
      // Notify the inviter about expired code usage
      await this.notifyExpiredCodeUsage(data);
      return { valid: false, error: 'expired', invite: data };
    }

    return { valid: true, invite: data, team: data.team };
  }

  /**
   * Redeem an invite code — creates a lite user or adds an existing user to the team.
   *
   * Spec: `.kiro/specs/lite-user-registration-fix/` (task 3.3)
   *
   * This is a thin wrapper over the `redeem-invite` Edge Function. The whole
   * transaction (auth user, `users` row, `team_members` row, redemption) now runs
   * server-side under `service_role`, because `supabase.auth.signUp()` returns no
   * session while email confirmation is enabled — so the browser was still `anon`
   * when it tried to insert into `users`, and migration 044's `id = auth.uid()`
   * check could never pass (2.1, 2.6). The client-side `signUp()` / insert /
   * update sequence is deliberately gone: nothing here needs a session.
   *
   * DEPLOYMENT: Edge Functions do NOT ship with `git push`. This call fails until
   * `supabase functions deploy redeem-invite` has been run.
   */
  async redeemInviteCode(
    code: string,
    userData: LiteRegistrationData
  ): Promise<RedeemInviteResult> {
    // Only data the person typed, plus the code from the link. `role`,
    // `user_type`, `team_id` and `active` are decided server-side — sending them
    // from here would be ignored anyway.
    const { data: result, error } = await this.supabase.functions.invoke('redeem-invite', {
      body: {
        code,
        email: userData.email,
        password: userData.password,
        first_name: userData.first_name,
        last_name: userData.last_name,
        privacy_consent: userData.privacy_consent === true,
      },
    });

    if (error) {
      throw new ApiError(await extractFunctionError(error));
    }

    // A 2xx response carrying an `error` field — shouldn't happen, but the
    // message is already safe to show if it does.
    if (result?.error) {
      throw new ApiError(
        typeof result.error === 'string' ? result.error : REGISTRATION_FALLBACK_MESSAGE
      );
    }

    if (!result?.user) {
      throw new ApiError(REGISTRATION_FALLBACK_MESSAGE);
    }

    // Shape the raw Edge Function response into the typed result the Success
    // Screen consumes. Every field beyond `user` is optional: the two paths and
    // the generic fallback each populate a different subset.
    const typed: RedeemInviteResult = {
      success: result.success,
      user: result.user,
      team: result.team ?? null,
      email_confirmed: result.email_confirmed,
      email_confirmation_required: result.email_confirmation_required,
      confirmation_email_sent: result.confirmation_email_sent,
      competition_name: result.competition_name ?? null,
    };

    // Matching-address path (Req 2.1): the account is already confirmed, so send
    // a welcome to the EXACT address the registrant submitted. Fire-and-forget —
    // the registration is already committed server-side and a welcome-email
    // failure must never block or roll it back (Req 2.10).
    if (typed.email_confirmed === true) {
      this.triggerWelcomeEmail(userData.email, typed);
    }

    return typed;
  }

  /**
   * Trigger the matching-path welcome email without awaiting it (Req 2.1/2.10).
   *
   * The team name is rendered as `{age_group} {name}` from the redemption
   * result's server-supplied team data — the client never invents branding or a
   * team name. If no team data is present there is nothing to welcome the
   * registrant to, so the send is skipped rather than sending an empty label.
   *
   * Any rejection is logged and swallowed: the registration has already
   * completed and must not be affected by an email failure.
   */
  private triggerWelcomeEmail(to: string, result: RedeemInviteResult): void {
    const teamLabel = formatTeamLabel(
      result.team ? { age_group: result.team.age_group, name: result.team.name } : null
    );
    if (!teamLabel) return;

    void emailApi
      .sendWelcome({
        to,
        recipientName: result.user?.first_name || undefined,
        teamName: teamLabel,
        competitionName: result.competition_name || undefined,
      })
      .catch((err) => {
        // Fire-and-forget: never rethrow. The registration stands regardless.
        console.warn('Welcome email send failed (registration unaffected):', err);
      });
  }

  /** Get all pending (unredeemed, unexpired) invite codes */
  async getPendingInvites(): Promise<InviteCode[]> {
    const { data, error } = await this.supabase
      .from('invite_codes')
      .select('*, team:teams(*)')
      .is('redeemed_by', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    return data as InviteCode[];
  }

  /** Get pending invites for a specific competition */
  async getPendingInvitesForCompetition(competitionId: string): Promise<InviteCode[]> {
    const { data, error } = await this.supabase
      .from('invite_codes')
      .select('*, team:teams(*)')
      .eq('competition_id', competitionId)
      .is('redeemed_by', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    return data as InviteCode[];
  }

  /** Get all invites (pending and redeemed) for a specific competition */
  async getAllInvitesForCompetition(competitionId: string): Promise<InviteCode[]> {
    const { data, error } = await this.supabase
      .from('invite_codes')
      .select('*, team:teams(*)')
      .eq('competition_id', competitionId)
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    return data as InviteCode[];
  }

  /** Invite a mid-season player to a WCR team */
  async inviteMidSeasonPlayer(teamId: string, playerData: InvitePlayerData): Promise<InviteCode> {
    // Check if user already exists
    const { data: existingUser } = await this.supabase
      .from('users')
      .select('id')
      .eq('email', playerData.email)
      .single();

    if (existingUser) {
      // Add existing user to team directly
      const { data: existingMember } = await this.supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', existingUser.id)
        .single();

      if (!existingMember) {
        await this.supabase
          .from('team_members')
          .insert({ team_id: teamId, user_id: existingUser.id, role: 'player' });
      }
    }

    // Generate invite code regardless (for tracking)
    return this.generateInviteCode(teamId, playerData.email, playerData.phone);
  }

  /** Notify the inviter that an expired code was used */
  private async notifyExpiredCodeUsage(invite: InviteCode): Promise<void> {
    // Use in-app messaging to notify the creator
    // For MVP: we'll create a system message to the inviter
    try {
      const { data: creator } = await this.supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', invite.created_by)
        .single();

      if (creator) {
        console.log(
          `Expired invite code ${invite.code} was used. Notifying ${creator.first_name} ${creator.last_name}.`
        );
        // TODO: Send in-app message to invite.created_by when messaging integration is wired
      }
    } catch {
      // Non-critical — log and continue
      console.warn('Failed to notify inviter about expired code');
    }
  }
}

/**
 * Shown when the function fails without a usable message of its own. Plain
 * language, no database text (2.4).
 */
const REGISTRATION_FALLBACK_MESSAGE =
  "Something went wrong and we couldn't complete your registration. Please try again.";

/**
 * `functions.invoke` surfaces non-2xx responses as an opaque error — the useful
 * message is in the response body, which has to be read off `error.context`.
 * Without this, every failure reads "Edge Function returned a non-2xx status
 * code", which would defeat 2.4: the registrant would never see the plain-language
 * reason (expired code, already-used code, email already registered) that
 * `redeem-invite` took the trouble to produce.
 *
 * Same approach as `extractFunctionError` in `src/lib/email-api.ts`; kept local so
 * the fallback message suits registration rather than email sending.
 */
async function extractFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) {
        return typeof body.error === 'string' ? body.error : REGISTRATION_FALLBACK_MESSAGE;
      }
    } catch {
      // Body wasn't JSON — fall through to the generic message.
    }
  }
  // Deliberately not `error.message`: that is either the opaque invoke text or a
  // transport error, neither of which is useful to the person registering.
  return REGISTRATION_FALLBACK_MESSAGE;
}

export const invitesApi = new InvitesApi();
