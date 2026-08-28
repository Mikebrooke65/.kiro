import { ApiClient, ApiError } from './api-client';
import type { Team, TeamMemberWithTeam } from '../types/database';

export class TeamsApi extends ApiClient {
  // Get a single team by ID
  async getTeam(teamId: string): Promise<Team> {
    return this.queryOne<Team>('teams', teamId);
  }

  // Update team game configuration (game_players and half_duration)
  async updateTeamConfig(
    teamId: string,
    gamePlayers: number,
    halfDuration: number
  ): Promise<Team> {
    return this.update<Team>('teams', teamId, {
      game_players: gamePlayers,
      half_duration: halfDuration,
    });
  }

  // Count of DISTINCT teams the given user belongs to, read from team_members
  // (the roster source of truth) rather than a club-wide `teams` count that RLS
  // reduces to zero for player-role users. Returns 0 when the user has no
  // memberships. A user with multiple roles on one team is counted once.
  // Req 7.1, 7.2, 7.3, 7.5, 7.6
  async getMyTeamCount(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId);

    if (error) throw new ApiError(error.message);

    const distinctTeamIds = new Set(
      (data ?? []).map((row: { team_id: string }) => row.team_id)
    );
    return distinctTeamIds.size;
  }

  // Source-of-truth roster/team read: a team_members -> teams join keyed on the
  // current user's id so the result set equals the user's membership and is not
  // reduced to zero by the `teams` SELECT policy for a player-role user.
  // Req 3.10, 7.4
  //
  // streamlined-invites-and-child-access, 2026-08-28 fix: a caregiver never
  // has their own `team_members` row (only their linked child does), so a
  // caregiver querying only by their own `user_id` always got back an empty
  // list — the Team page showed "You are not a member of any team yet" even
  // for a caregiver whose child was actively on a roster, and the same gap
  // silently blocked their Messages tab too (`MessagingContext` derives its
  // team scope from this same relationship). Fixed the same way `Requirement
  // 6.3`'s `unionTeamAndCaregiverRecipients` already fixed the equivalent
  // problem for message-send recipients: union in every team their linked
  // child(ren) belong to, via `player_caregivers`, rather than relying on
  // `team_members` alone. Additive only — a non-caregiver's result is
  // unchanged, since `player_caregivers` never has a row for them as a
  // caregiver in the first place.
  async getMyTeams(userId: string): Promise<TeamMemberWithTeam[]> {
    const { data, error } = await this.supabase
      .from('team_members')
      .select('*, team:teams(*)')
      .eq('user_id', userId);

    if (error) throw new ApiError(error.message);
    const ownMemberships = (data ?? []) as unknown as TeamMemberWithTeam[];

    const { data: links, error: linksError } = await this.supabase
      .from('player_caregivers')
      .select('player_id')
      .eq('caregiver_id', userId);

    if (linksError) {
      // Best-effort, same discipline as `resolveRecipients`'s own caregiver
      // lookup: a caregiver temporarily missing their child's team is
      // preferable to failing the whole Team page load.
      console.error('getMyTeams: player_caregivers lookup failed, caregiver-linked teams omitted', linksError);
      return ownMemberships;
    }

    const childIds = (links ?? []).map((row: { player_id: string }) => row.player_id);
    if (childIds.length === 0) return ownMemberships;

    const { data: childMemberships, error: childError } = await this.supabase
      .from('team_members')
      .select('*, team:teams(*)')
      .in('user_id', childIds);

    if (childError) {
      console.error('getMyTeams: linked child team_members lookup failed, caregiver-linked teams omitted', childError);
      return ownMemberships;
    }

    return [...ownMemberships, ...((childMemberships ?? []) as unknown as TeamMemberWithTeam[])];
  }
}

export const teamsApi = new TeamsApi();
