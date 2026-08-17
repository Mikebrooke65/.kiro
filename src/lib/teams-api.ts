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
  async getMyTeams(userId: string): Promise<TeamMemberWithTeam[]> {
    const { data, error } = await this.supabase
      .from('team_members')
      .select('*, team:teams(*)')
      .eq('user_id', userId);

    if (error) throw new ApiError(error.message);
    return data as unknown as TeamMemberWithTeam[];
  }
}

export const teamsApi = new TeamsApi();
