import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Calendar, MapPin, Trophy, Clock, ChevronLeft, ChevronRight, Save, ArrowRightCircle, ClipboardList } from 'lucide-react';
import { gamesApi } from '../lib/games-api';
import { eventsApi } from '../lib/events-api';
import { teamsApi } from '../lib/teams-api';
import type { Game, Team } from '../types/database';
import { useAuth } from '../contexts/AuthContext';

export function Games() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Score recording state
  const [teamScore, setTeamScore] = useState<string>('');
  const [opponentScore, setOpponentScore] = useState<string>('');
  const [scoreSaving, setScoreSaving] = useState(false);

  // Load user's teams
  useEffect(() => {
    if (user) {
      console.log('Games: User loaded, fetching teams for user:', user.id);
      loadTeams();
    } else {
      console.log('Games: No user available yet');
    }
  }, [user]);

  // Load games when team is selected
  useEffect(() => {
    if (selectedTeam) {
      loadGames();
    }
  }, [selectedTeam]);

  // Load game details when game index changes
  useEffect(() => {
    if (games.length > 0 && games[currentGameIndex]) {
      loadGameDetails(games[currentGameIndex]);
    }
  }, [currentGameIndex, games]);

  const loadTeams = async () => {
    if (!user?.id) {
      console.log('Games: No user ID available');
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('Games: Fetching teams for user:', user.id);

      // Read team data through the team_members -> teams join keyed on the
      // current user so the result equals the user's membership and isn't
      // reduced to zero by the `teams` SELECT policy for players (Req 7.4).
      const memberships = await teamsApi.getMyTeams(user.id);

      // Dedupe by team id: getMyTeams returns one row PER relationship, so a
      // user who is (say) a coach on a team AND a caregiver of a child on the
      // same team gets that team back more than once. The Team page already
      // dedupes via buildTeamSelection; this page and Coaching didn't, which
      // showed the same team several times in the dropdown (found live
      // 2026-09-03). Keep first appearance.
      const seenTeamIds = new Set<string>();
      const userTeams = memberships
        .map((tm) => tm.team)
        .filter((team): team is Team => Boolean(team))
        .filter((team) => {
          if (seenTeamIds.has(team.id)) return false;
          seenTeamIds.add(team.id);
          return true;
        });
      console.log('Games: User teams:', userTeams);
      setTeams(userTeams);

      // Auto-select first team
      if (userTeams.length > 0) {
        console.log('Games: Auto-selecting team:', userTeams[0]);
        setSelectedTeam(userTeams[0]);
      } else {
        console.log('Games: No teams found for user');
      }
    } catch (err) {
      console.error('Games: Error loading teams:', err);
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const loadGames = async () => {
    if (!selectedTeam) return;

    try {
      setLoading(true);
      
      // Query events table for game events
      const { data, error } = await gamesApi.supabase
        .from('events')
        .select('*')
        .eq('event_type', 'game')
        .contains('target_teams', [selectedTeam.id])
        .lt('event_date', new Date().toISOString())
        .order('event_date', { ascending: false });

      if (error) throw error;

      // Convert events to Game format
      const pastGames: Game[] = (data || []).map(event => ({
        id: event.id,
        team_id: selectedTeam.id,
        opponent: event.opponent || 'Unknown',
        game_date: event.event_date,
        venue: event.location,
        home_away: event.home_away || 'home',
        status: 'completed' as const,
        team_score: event.team_score,
        opponent_score: event.opponent_score,
        created_at: event.created_at,
        updated_at: event.updated_at,
        created_by: event.created_by,
        updated_by: event.updated_by,
      }));

      setGames(pastGames);

      // Auto-select most recent game (index 0)
      if (pastGames.length > 0) {
        setCurrentGameIndex(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  const loadGameDetails = (game: Game) => {
    if (!game) return;
    // Pre-fill score if already recorded. (Player rosters and written feedback
    // are no longer loaded here — game feedback now lives in Progress Notes.)
    setTeamScore(game.team_score != null ? game.team_score.toString() : '');
    setOpponentScore(game.opponent_score != null ? game.opponent_score.toString() : '');
  };

  const handleSaveScore = async () => {
    const currentGame = games[currentGameIndex];
    if (!currentGame) return;

    // Handle empty strings as 0
    const team = teamScore === '' ? 0 : parseInt(teamScore);
    const opponent = opponentScore === '' ? 0 : parseInt(opponentScore);

    if (isNaN(team) || isNaN(opponent)) {
      setError('Please enter valid scores');
      return;
    }

    if (team < 0 || opponent < 0) {
      setError('Scores cannot be negative');
      return;
    }

    try {
      setScoreSaving(true);
      setError(null);
      
      // Update score in events table
      await eventsApi.updateEventScore(currentGame.id, team, opponent);
      
      // Update local state
      const updatedGame = { ...currentGame, team_score: team, opponent_score: opponent };
      const updatedGames = [...games];
      updatedGames[currentGameIndex] = updatedGame;
      setGames(updatedGames);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save score');
    } finally {
      setScoreSaving(false);
    }
  };

  const navigateGame = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentGameIndex > 0) {
      setCurrentGameIndex(currentGameIndex - 1);
    } else if (direction === 'next' && currentGameIndex < games.length - 1) {
      setCurrentGameIndex(currentGameIndex + 1);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  if (loading && teams.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0091f3] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      <div className="border-l-8 border-[#ea7800] pl-4 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Games</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Team Selection */}
      {teams.length === 0 ? (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm">
            No teams assigned. Please contact your administrator or assign yourself to a team in Teams Management.
          </p>
        </div>
      ) : teams.length > 1 ? (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Team
          </label>
          <select
            value={selectedTeam?.id || ''}
            onChange={(e) => {
              const team = teams.find(t => t.id === e.target.value);
              setSelectedTeam(team || null);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
          >
            {teams.map(team => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.age_group})
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-gray-700">
            <span className="font-medium">Team:</span> {teams[0].age_group} {teams[0].name}
          </p>
        </div>
      )}

      {/* Progress Notes entry point (internal name "Gant"). Game feedback now
          lives in Progress Notes rather than an inline form here — this button
          carries the selected team through so the queue opens pre-filtered to
          it. Requirement 1.3 / 9.2. */}
      {selectedTeam && (
        <button
          onClick={() => navigate('/ai-coach', { state: { teamId: selectedTeam.id } })}
          className="w-full mb-4 flex items-center justify-center gap-2 text-white rounded-lg shadow hover:shadow-md transition-shadow px-4 py-3"
          style={{ backgroundColor: '#d97706' }}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="font-semibold">Progress Notes</span>
        </button>
      )}

      {/* Game Card with Navigation */}
      {games.length > 0 && games[currentGameIndex] && (
        <div className="space-y-4">
          {/* Game Card */}
          <div className="rounded-xl shadow-sm overflow-hidden border border-orange-200" style={{ backgroundColor: 'rgba(234, 120, 0, 0.2)' }}>
            {/* Navigation + Match Title */}
            <div className="flex items-center justify-between px-3 py-2">
              <button
                onClick={() => navigateGame('prev')}
                disabled={currentGameIndex === 0}
                className={`p-1 rounded transition-colors ${currentGameIndex === 0 ? 'text-gray-300' : 'text-gray-600 hover:bg-white/50'}`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 text-center">
                <p className="font-bold text-gray-900 text-sm">
                  {selectedTeam?.age_group} {selectedTeam?.name} vs {games[currentGameIndex].opponent}
                </p>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className={`px-1.5 py-0 rounded text-[10px] font-semibold ${games[currentGameIndex].home_away === 'home' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {games[currentGameIndex].home_away.toUpperCase()}
                  </span>
                  {games.length > 1 && (
                    <span className="text-[10px] text-gray-400">{currentGameIndex + 1}/{games.length}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => navigateGame('next')}
                disabled={currentGameIndex === games.length - 1}
                className={`p-1 rounded transition-colors ${currentGameIndex === games.length - 1 ? 'text-gray-300' : 'text-gray-600 hover:bg-white/50'}`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Score Display (if recorded) + Date/Location row */}
            <div className="px-3 pb-2">
              {games[currentGameIndex].team_score !== null && games[currentGameIndex].team_score !== undefined && (
                <div className="flex items-center justify-center gap-3 mb-2">
                  <span className="text-2xl font-bold text-gray-900">{games[currentGameIndex].team_score}</span>
                  <span className="text-sm font-medium text-gray-400">-</span>
                  <span className="text-2xl font-bold text-gray-900">{games[currentGameIndex].opponent_score}</span>
                </div>
              )}
              <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(games[currentGameIndex].game_date)}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(games[currentGameIndex].game_date)}</span>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{games[currentGameIndex].venue}</span>
              </div>
              {/* Subs link */}
              <div className="flex justify-center mt-2">
                <button
                  onClick={() => navigate(`/games/${games[currentGameIndex].id}/subs`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#ea7800] text-white hover:bg-[#d06e00] transition-colors"
                >
                  <ArrowRightCircle className="w-3.5 h-3.5" />
                  Subs
                </button>
              </div>
            </div>
          </div>

          {/* Score Recording - compact inline */}
          <div className="bg-white rounded-lg shadow-sm px-3 py-2 border border-gray-200">
            <div className="flex gap-2 items-center">
              <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Score:</span>
              <input
                type="number"
                min="0"
                value={teamScore}
                onChange={(e) => setTeamScore(e.target.value)}
                className="w-14 px-2 py-1 text-center text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#0091f3]"
                placeholder="0"
              />
              <span className="text-xs text-gray-400">-</span>
              <input
                type="number"
                min="0"
                value={opponentScore}
                onChange={(e) => setOpponentScore(e.target.value)}
                className="w-14 px-2 py-1 text-center text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#0091f3]"
                placeholder="0"
              />
              <button
                onClick={handleSaveScore}
                disabled={scoreSaving}
                className="ml-auto px-3 py-1 text-sm bg-[#0091f3] text-white rounded hover:bg-[#0077cc] transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Save className="w-3 h-3" />
                {scoreSaving ? '...' : 'Save'}
              </button>
            </div>
          </div>

        </div>
      )}

      {games.length === 0 && selectedTeam && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No past games found</p>
          <p className="text-sm text-gray-500 mt-1">Games will appear here after they've been played</p>
        </div>
      )}
    </div>
  );
}
