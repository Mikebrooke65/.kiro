import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { teamsApi } from '../lib/teams-api';
import { gamesApi } from '../lib/games-api';
import { gantApi } from '../lib/gant-api';
import { GantReviewModal } from '../components/GantReviewModal';
import { GantCaptureSheet } from '../components/GantCaptureSheet';
import type { GantPendingEntry, Team as DbTeam, User } from '../types/database';

/**
 * "My Pending Notes" — the Progress Notes queue.
 *
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 4)
 * Requirements Section 5; design.md Section 5.
 *
 * Filterable by team, then by player, chronological order within either
 * filter or with no filter applied (Req 5.2, decided 2026-09-03). Tapping
 * an entry opens the Review screen (Task 3) directly.
 */

const GANT_ACCENT = '#d97706';

interface Team {
  id: string;
  name: string;
  age_group: string;
}

export function GantPendingQueue() {
  const { user } = useAuth();

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>(''); // '' = all teams
  const [players, setPlayers] = useState<User[]>([]);
  const [playerFilter, setPlayerFilter] = useState<string>(''); // '' = all players

  const [entries, setEntries] = useState<GantPendingEntry[]>([]);
  const [teamNamesById, setTeamNamesById] = useState<Record<string, string>>({});
  const [teamAgeGroupsById, setTeamAgeGroupsById] = useState<Record<string, string>>({});
  const [playerNamesById, setPlayerNamesById] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewingEntry, setReviewingEntry] = useState<GantPendingEntry | null>(null);
  const [captureContext, setCaptureContext] = useState<{ teamId: string; playerId: string | null } | null>(null);

  useEffect(() => {
    void loadTeams();
  }, [user]);

  useEffect(() => {
    void loadPlayersForFilter();
    setPlayerFilter('');
  }, [teamFilter]);

  useEffect(() => {
    void loadEntries();
  }, [teamFilter, playerFilter]);

  async function loadTeams() {
    if (!user) return;
    try {
      const memberships = await teamsApi.getMyTeams(user.id);
      const userTeams: Team[] = memberships
        .map((tm) => tm.team)
        .filter((t): t is DbTeam => Boolean(t))
        .map((t) => ({ id: t.id, name: t.name, age_group: t.age_group }))
        .sort((a, b) => a.age_group.localeCompare(b.age_group));
      setTeams(userTeams);
      setTeamNamesById(
        Object.fromEntries(userTeams.map((t) => [t.id, `${t.age_group} ${t.name}`]))
      );
      setTeamAgeGroupsById(Object.fromEntries(userTeams.map((t) => [t.id, t.age_group])));
    } catch (err) {
      console.error('Failed to load teams for the pending queue:', err);
    }
  }

  async function loadPlayersForFilter() {
    if (!teamFilter) {
      setPlayers([]);
      return;
    }
    try {
      const teamPlayers = await gamesApi.getTeamPlayers(teamFilter);
      setPlayers(teamPlayers);
      setPlayerNamesById((prev) => ({
        ...prev,
        ...Object.fromEntries(teamPlayers.map((p) => [p.id, `${p.first_name} ${p.last_name}`])),
      }));
    } catch (err) {
      console.error('Failed to load players for the pending-queue filter:', err);
    }
  }

  async function loadEntries() {
    setLoading(true);
    setError(null);
    try {
      const filters: { teamId?: string; playerId?: string } = {};
      if (teamFilter) filters.teamId = teamFilter;
      if (playerFilter) filters.playerId = playerFilter;
      const rows = await gantApi.getMyPendingEntries(filters);
      setEntries(rows);

      // Backfill any player names not already known (e.g. no team filter
      // applied, so loadPlayersForFilter never ran for those players).
      const unknownPlayerIds = Array.from(
        new Set(
          rows
            .map((r) => r.player_id)
            .filter((id): id is string => Boolean(id) && !playerNamesById[id!])
        )
      );
      if (unknownPlayerIds.length > 0) {
        // Best-effort: fetch via each row's own team roster once per unique team.
        const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
        const namesById: Record<string, string> = {};
        for (const tId of teamIds) {
          const rosterPlayers = await gamesApi.getTeamPlayers(tId).catch(() => [] as User[]);
          rosterPlayers.forEach((p) => {
            namesById[p.id] = `${p.first_name} ${p.last_name}`;
          });
        }
        setPlayerNamesById((prev) => ({ ...prev, ...namesById }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your pending notes.');
    } finally {
      setLoading(false);
    }
  }

  function handleResolved(_outcome: 'ticked' | 'crossed', entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setReviewingEntry(null);
    // Found live 2026-09-03: this page-level banner was never cleared, so a
    // failed action's message could linger invisibly behind a later modal
    // (this banner sits BEHIND any z-[60] overlay) and then reappear once
    // that modal closed, looking like a fresh, unrelated error.
    setError(null);
  }

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: GANT_ACCENT }} />
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      <div className="border-l-8 pl-4 mb-4" style={{ borderColor: GANT_ACCENT }}>
        <h1 className="text-2xl font-bold text-gray-900">Progress Notes</h1>
        <p className="text-sm text-gray-600">Notes captured and waiting to be reviewed</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Filters (Req 5.2): team, then player, chronological within either */}
      <div className="flex gap-2 mb-4">
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.age_group} {t.name}
            </option>
          ))}
        </select>
        <select
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value)}
          disabled={!teamFilter}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">All players</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name}
            </option>
          ))}
        </select>
      </div>

      {/* Quick capture — not tied to any single player, useful when nothing
          specific prompted a visit here but the coach wants to add a note. */}
      {teamFilter && (
        <button
          onClick={() => {
            setError(null);
            setCaptureContext({ teamId: teamFilter, playerId: playerFilter || null });
          }}
          className="w-full mb-4 px-4 py-2 rounded-lg border font-medium text-sm"
          style={{ borderColor: GANT_ACCENT, color: GANT_ACCENT }}
        >
          + Add a note
        </button>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">No pending notes right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const playerName = entry.player_id ? playerNamesById[entry.player_id] ?? 'Player' : null;
            const teamName = teamNamesById[entry.team_id] ?? 'Team';
            const preview = entry.raw_text?.[0]?.text ?? '';
            return (
              <button
                key={entry.id}
                onClick={() => {
                  setError(null);
                  setReviewingEntry(entry);
                }}
                className="w-full text-left bg-white rounded-lg shadow-sm border border-gray-100 p-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {playerName || `${teamName} (team)`}
                  </p>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(entry.captured_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 truncate">{teamName}</p>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{preview}</p>
                {entry.round_count > 0 && (
                  <span
                    className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)', color: '#92400e' }}
                  >
                    {entry.round_count} round{entry.round_count === 1 ? '' : 's'} so far
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {reviewingEntry && (
        <GantReviewModal
          entry={reviewingEntry}
          playerName={reviewingEntry.player_id ? playerNamesById[reviewingEntry.player_id] ?? 'Player' : null}
          teamName={teamNamesById[reviewingEntry.team_id] ?? 'Team'}
          ageGroup={teamAgeGroupsById[reviewingEntry.team_id]}
          onClose={() => setReviewingEntry(null)}
          onResolved={handleResolved}
          onError={setError}
        />
      )}

      {captureContext && (
        <GantCaptureSheet
          teamId={captureContext.teamId}
          teamName={teamNamesById[captureContext.teamId] ?? 'Team'}
          playerId={captureContext.playerId}
          playerName={captureContext.playerId ? playerNamesById[captureContext.playerId] ?? 'Player' : null}
          onClose={() => {
            setCaptureContext(null);
            void loadEntries();
          }}
          onCaptured={() => void loadEntries()}
          onError={setError}
        />
      )}
    </div>
  );
}
