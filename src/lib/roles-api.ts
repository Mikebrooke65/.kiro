import { ApiClient, ApiError } from './api-client';
import type {
  TeamMember,
  TeamMemberWithUser,
  TeamMemberWithTeam,
  TeamRole,
  User,
  LiteUserReport,
} from '../types/database';

class RolesApi extends ApiClient {
  /** Get all members of a team with user details */
  async getTeamMembers(teamId: string): Promise<TeamMemberWithUser[]> {
    const { data, error } = await this.supabase
      .from('team_members')
      .select('*, user:users(*)')
      .eq('team_id', teamId)
      .order('role', { ascending: true });

    if (error) throw new ApiError(error.message);
    return data as TeamMemberWithUser[];
  }

  /** Get all team memberships for a user with team details */
  async getUserTeamMemberships(userId: string): Promise<TeamMemberWithTeam[]> {
    const { data, error } = await this.supabase
      .from('team_members')
      .select('*, team:teams(*)')
      .eq('user_id', userId);

    if (error) throw new ApiError(error.message);
    return data as TeamMemberWithTeam[];
  }

  /** Add a user to a team with a specific role */
  async addTeamMember(teamId: string, userId: string, role: TeamRole = 'player'): Promise<TeamMember> {
    const { data, error } = await this.supabase
      .from('team_members')
      .insert({ team_id: teamId, user_id: userId, role })
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as TeamMember;
  }

  /** Update the role of an existing team membership */
  async updateTeamMemberRole(membershipId: string, role: TeamRole): Promise<TeamMember> {
    const { data, error } = await this.supabase
      .from('team_members')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', membershipId)
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as TeamMember;
  }

  /**
   * Toggle a team membership's additive `is_coach` flag (V1.R Part 1, item C
   * — migration 064). This is entirely independent of `role`: a member's
   * `role` (player/coach/manager) is never touched by this call, so setting
   * `is_coach = true` on a Manager gives them Coach authority ON TOP OF
   * being Manager, without a second `team_members` row (blocked by the
   * `UNIQUE(team_id, user_id)` constraint) and without disturbing their
   * primary `role`.
   *
   * Plain client-side update relying on RLS for authorization, same pattern
   * as `updateTeamMemberRole` — migration 065's `user_can_edit_team` policy
   * gates this identically (Coach/Manager/is_coach on this specific team, or
   * global Admin).
   */
  async setCoachFlag(membershipId: string, isCoach: boolean): Promise<TeamMember> {
    const { data, error } = await this.supabase
      .from('team_members')
      .update({ is_coach: isCoach, updated_at: new Date().toISOString() })
      .eq('id', membershipId)
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as TeamMember;
  }

  /**
   * Remove a team membership directly (no Edge Function). Used today by
   * `UserManagement.tsx`'s Admin team-assignment screen only. Its
   * authorization rests entirely on the `team_members` RLS policy from
   * migration 036 — deliberately unchanged here; see
   * `removeTeamMemberSecure`'s comment for why the roster page's own
   * "Remove" action does NOT reuse this method.
   */
  async removeTeamMember(membershipId: string): Promise<void> {
    const { error } = await this.supabase
      .from('team_members')
      .delete()
      .eq('id', membershipId);

    if (error) throw new ApiError(error.message);
  }

  /**
   * Remove exactly one (person, role, team) association via the privileged
   * `remove-team-member` Edge Function — the data-layer half of the roster
   * page's "Remove" action (product decision 2026-08-31; see
   * `permissions-logic.ts`'s `canRemoveTeamMember` for the full rule set).
   *
   * Deliberately NOT the plain `removeTeamMember` above: that method is a
   * direct client-side delete whose only authorization is the existing,
   * overly-broad `team_members` RLS policy (migration 036) — it cannot
   * enforce "not the team's first Manager," and cannot be trusted to
   * correctly scope a Coach/Manager to only their own team, since Postgres
   * OR's that blanket policy in regardless of any narrower one added
   * alongside it. `remove-team-member` re-derives self-removal,
   * Admin/Coach/Manager-on-this-team status, and first-Manager protection
   * itself, server-side, under service role — see that function's header
   * comment for the full explanation of the underlying RLS gap.
   *
   * DEPLOYMENT: Edge Functions do NOT ship with `git push`. This call fails
   * until `supabase functions deploy remove-team-member` has been run.
   */
  async removeTeamMemberSecure(
    membershipId: string
  ): Promise<{ cascadedCaregiverRemoval: boolean }> {
    const { data: result, error } = await this.supabase.functions.invoke(
      'remove-team-member',
      { body: { membership_id: membershipId } }
    );

    if (error) {
      throw new ApiError(await extractFunctionError(error));
    }
    if (result?.error) {
      throw new ApiError(
        typeof result.error === 'string' ? result.error : 'Could not remove this team member.'
      );
    }

    return { cascadedCaregiverRemoval: Boolean(result?.cascadedCaregiverRemoval) };
  }

  /** Promote a lite user to full user (preserves all team memberships) */
  async promoteToFullUser(userId: string): Promise<User> {
    const { data, error } = await this.supabase
      .from('users')
      .update({ user_type: 'full' })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as User;
  }

  /** Get a report of all lite users, optionally filtered by team */
  async getLiteUsersReport(teamId?: string): Promise<LiteUserReport[]> {
    let query = this.supabase
      .from('team_members')
      .select('*, user:users(*), team:teams(*)')
      .eq('user:users.user_type', 'lite');

    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    const { data, error } = await query;
    if (error) throw new ApiError(error.message);

    const now = new Date();
    return (data || []).map((row: any) => ({
      user: row.user,
      team_name: row.team.name,
      team_age_group: row.team.age_group,
      date_added: row.created_at,
      days_since_creation: Math.floor(
        (now.getTime() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));
  }
}

/**
 * `functions.invoke` surfaces non-2xx responses as an opaque error — the useful
 * message is in the response body, read off `error.context`. Same approach as
 * `caregivers-api.ts` / `email-api.ts` / `invites-api.ts`; kept local so the
 * fallback message suits this file's own calls.
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
  return error instanceof Error ? error.message : 'Could not remove this team member.';
}

export const rolesApi = new RolesApi();
