// Feature: post-registration-welcome-and-team-page (task 12.1)
//
// Mobile Team Page. Renders a team selector, a grouped roster (Coach → Manager
// → Player), age-band contact display, role/team-type-gated action controls,
// and the loading / empty / multi-team / error-with-retry states. Routed at
// `/team` inside the authenticated MainLayout (see src/routes/index.tsx).
//
// Pure logic (selection, grouping, contact, capabilities) lives in
// `roster-logic.ts` and `permissions-logic.ts`; this component only wires those
// helpers to Supabase reads/writes and React state.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, UserPlus, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { teamsApi } from '../lib/teams-api';
import { rolesApi } from '../lib/roles-api';
import { UserRole } from '../types/database';
import type { TeamRole, TeamType, TeamMemberWithUser } from '../types/database';
import {
  buildTeamSelection,
  deriveAgeBand,
  deriveAgeBandForPerson,
  groupAndSortRoster,
  selectCaregiverContact,
  type AgeBand,
  type CaregiverLink,
  type ContactDisplay,
  type RosterEntry,
  type RosterMember,
  type TeamSelectionState,
} from '../lib/roster-logic';
import {
  resolveCapabilities,
  type ActionCapabilities,
  type PermissionRole,
} from '../lib/permissions-logic';
import { AddJuniorModal } from '../components/team/AddJuniorModal';

/** How long a roster fetch may run before the error state shows (Req 3.15). */
const ROSTER_TIMEOUT_MS = 10_000;

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** Everything one roster fetch resolves, ready to drive the render. */
interface RosterData {
  entries: RosterEntry[];
  ageBand: AgeBand;
  teamType: TeamType;
  managerCount: number;
  /** Roles the current user holds on this team (for capability resolution). */
  currentUserRoles: PermissionRole[];
  /** team_members row id of each user's player membership (for promotion). */
  playerMembershipIdByUser: Record<string, string>;
}

/** Reject if the wrapped promise does not settle within `ms` (Req 3.15). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('roster_timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function TeamPage() {
  const { user } = useAuth();

  // Team-selector state derived from the user's team_members set.
  const [selection, setSelection] = useState<TeamSelectionState>({
    options: [],
    selectedTeamId: null,
    prompt: false,
    empty: false,
  });
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Roster state for the currently selected team.
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [rosterStatus, setRosterStatus] = useState<LoadStatus>('idle');

  // Action feedback (e.g. manager-cap message, confirmation) and modal.
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showAddJunior, setShowAddJunior] = useState(false);

  // Guards a roster response against a newer selection/retry superseding it.
  const loadTokenRef = useRef(0);

  const isClubAdmin = user?.role === UserRole.ADMIN;

  // ---- Load the user's teams once (Req 3.1, 3.2, 3.13, 3.14) ----------------
  const loadTeams = useCallback(async () => {
    if (!user) return;
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const memberships = await teamsApi.getMyTeams(user.id);
      setSelection(buildTeamSelection(memberships));
    } catch (err) {
      setTeamsError(err instanceof Error ? err.message : 'Could not load your teams.');
    } finally {
      setTeamsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // ---- Load the roster for the selected team (Req 3.4, 3.15) ----------------
  const loadRoster = useCallback(
    async (teamId: string) => {
      if (!user) return;
      const token = ++loadTokenRef.current;
      setRosterStatus('loading');
      setActionMessage(null);

      try {
        const data = await withTimeout(fetchRoster(teamId, user.id), ROSTER_TIMEOUT_MS);
        if (token !== loadTokenRef.current) return; // superseded
        setRoster(data);
        setRosterStatus('loaded');
      } catch (err) {
        if (token !== loadTokenRef.current) return; // superseded
        setRoster(null);
        setRosterStatus('error');
      }
    },
    [user]
  );

  // Auto-load whenever a team becomes selected (auto-select for single-team
  // users, or a manual pick for multi-team users). Clearing selection resets.
  useEffect(() => {
    if (selection.selectedTeamId) {
      loadRoster(selection.selectedTeamId);
    } else {
      setRoster(null);
      setRosterStatus('idle');
    }
  }, [selection.selectedTeamId, loadRoster]);

  const selectTeam = (teamId: string) => {
    setShowDropdown(false);
    setSelection((prev) => ({ ...prev, selectedTeamId: teamId, prompt: false }));
  };

  const selectedOption = selection.options.find(
    (o) => o.teamId === selection.selectedTeamId
  );

  // Capabilities for the current user on the selected team (Req 4.1–4.5, 4.11).
  const capabilities: ActionCapabilities | null = roster
    ? resolveCapabilities({
        isClubAdmin,
        teamRoles: roster.currentUserRoles,
        teamType: roster.teamType,
        managerCount: roster.managerCount,
      })
    : null;

  // ---- Roster actions -------------------------------------------------------

  const refreshRoster = () => {
    if (selection.selectedTeamId) loadRoster(selection.selectedTeamId);
  };

  const handleDeactivate = async (entry: RosterEntry) => {
    setActionMessage(null);
    try {
      const { error } = await supabase
        .from('users')
        .update({ active: false })
        .eq('id', entry.userId);
      if (error) throw new Error(error.message);
      setActionMessage(`${entry.displayName} is now inactive.`);
      refreshRoster();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Could not update the member.');
    }
  };

  const handleReactivate = async (entry: RosterEntry) => {
    setActionMessage(null);
    try {
      const { error } = await supabase
        .from('users')
        .update({ active: true })
        .eq('id', entry.userId);
      if (error) throw new Error(error.message);
      setActionMessage(`${entry.displayName} is now active.`);
      refreshRoster();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Could not update the member.');
    }
  };

  const handlePromoteToManager = async (entry: RosterEntry) => {
    setActionMessage(null);
    const membershipId = roster?.playerMembershipIdByUser[entry.userId];
    if (!membershipId) return;
    try {
      await rolesApi.updateTeamMemberRole(membershipId, 'manager');
      setActionMessage(`${entry.displayName} is now a Manager.`);
      refreshRoster();
    } catch (err) {
      // The data-layer trigger backstops the cap (Req 4.9/4.10): map its error
      // to the user-facing message and leave the role unchanged.
      const message = err instanceof Error ? err.message : '';
      if (message.includes('manager_cap_reached')) {
        setActionMessage('This team already has the maximum of two Managers.');
      } else {
        setActionMessage(message || 'Could not promote the member.');
      }
    }
  };

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="bg-gray-50 min-h-full pb-20">
      {/* Header */}
      <div className="p-4">
        <div className="border-l-8 border-[#0091f3] pl-4 mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-600 text-sm">View your team roster and contact details</p>
        </div>
      </div>

      {/* Loading the user's teams */}
      {teamsLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0091f3]" />
        </div>
      )}

      {/* Failed to load teams */}
      {!teamsLoading && teamsError && (
        <div className="px-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
            <p className="text-sm text-red-800">{teamsError}</p>
            <button
              onClick={loadTeams}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        </div>
      )}

      {/* No teams at all (Req 3.14) */}
      {!teamsLoading && !teamsError && selection.empty && (
        <div className="px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-gray-900 font-medium">You are not a member of any team yet.</p>
            <p className="text-gray-500 text-sm mt-1">
              When you're added to a team, its roster will appear here.
            </p>
          </div>
        </div>
      )}

      {/* Team selector + roster area */}
      {!teamsLoading && !teamsError && !selection.empty && (
        <>
          {/* Selector (Req 3.1, 3.3) */}
          <div className="px-4 mb-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="p-4 flex items-center justify-between">
                <h2 className="font-bold text-lg text-gray-900">
                  {selectedOption ? selectedOption.label : 'Select a team'}
                </h2>
                {selection.options.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowDropdown((s) => !s)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#0091f3] text-white rounded-lg text-sm font-medium hover:bg-[#0081d8] transition-colors"
                    >
                      {selectedOption ? 'Change Team' : 'Choose Team'}
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {showDropdown && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                        {selection.options.map((option) => (
                          <button
                            key={option.teamId}
                            onClick={() => selectTeam(option.teamId)}
                            className={`block w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                              option.teamId === selection.selectedTeamId
                                ? 'bg-blue-50 text-[#0091f3] font-medium'
                                : 'text-gray-700'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Prompt to select a team when 2+ teams and none chosen (Req 3.13) */}
          {selection.prompt && !selection.selectedTeamId && (
            <div className="px-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  You belong to more than one team. Select a team above to view its roster.
                </p>
              </div>
            </div>
          )}

          {/* Roster loading (Req 3.4) */}
          {selection.selectedTeamId && rosterStatus === 'loading' && (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0091f3]" />
            </div>
          )}

          {/* Roster load error with retry preserving selection (Req 3.15) */}
          {selection.selectedTeamId && rosterStatus === 'error' && (
            <div className="px-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
                <p className="text-sm text-red-800">
                  The roster could not be loaded. Please try again.
                </p>
                <button
                  onClick={refreshRoster}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm"
                >
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
              </div>
            </div>
          )}

          {/* Loaded roster */}
          {selection.selectedTeamId && rosterStatus === 'loaded' && roster && capabilities && (
            <div className="px-4 space-y-4">
              {/* Add-user action (Req 4.2, 5.1) — gated by capability */}
              {capabilities.canAddUser && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowAddJunior(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#22c55e] text-white rounded-lg text-sm font-medium hover:bg-[#1ea34d] transition-colors"
                  >
                    <UserPlus className="w-4 h-4" /> Add Junior
                  </button>
                </div>
              )}

              {/* Action feedback / confirmations (Req 4.6, 4.7, 4.9) */}
              {actionMessage && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3" role="status">
                  <p className="text-sm text-blue-800">{actionMessage}</p>
                </div>
              )}

              {roster.entries.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                  <p className="text-gray-500 text-sm">This team has no members yet.</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                  {roster.entries.map((entry) => (
                    <RosterRow
                      key={entry.userId}
                      entry={entry}
                      capabilities={capabilities}
                      onDeactivate={() => handleDeactivate(entry)}
                      onReactivate={() => handleReactivate(entry)}
                      onPromote={() => handlePromoteToManager(entry)}
                      canPromoteThisMember={
                        !!roster.playerMembershipIdByUser[entry.userId] &&
                        entry.roles.includes('player') &&
                        !entry.roles.includes('manager')
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add-a-Junior modal — only reachable when canAddUser is true */}
      {selection.selectedTeamId && (
        <AddJuniorModal
          isOpen={showAddJunior}
          onClose={() => setShowAddJunior(false)}
          onSuccess={() => {
            setActionMessage('Add-junior request sent to the caregiver for approval.');
            refreshRoster();
          }}
          teamId={selection.selectedTeamId}
        />
      )}
    </div>
  );
}

// ---- Roster row -------------------------------------------------------------

const ROLE_LABELS: Record<TeamRole, string> = {
  coach: 'Coach',
  manager: 'Manager',
  player: 'Player',
};

interface RosterRowProps {
  entry: RosterEntry;
  capabilities: ActionCapabilities;
  canPromoteThisMember: boolean;
  onDeactivate: () => void;
  onReactivate: () => void;
  onPromote: () => void;
}

function RosterRow({
  entry,
  capabilities,
  canPromoteThisMember,
  onDeactivate,
  onReactivate,
  onPromote,
}: RosterRowProps) {
  // Inactive OR pending members are greyed (Req 3.6, 5.10).
  const greyed = !entry.active || entry.pending;
  // Pending children are non-selectable — no actions exposed (Req 5.10).
  const actionsAllowed = !entry.pending;

  return (
    <div className={`px-4 py-3 ${greyed ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-900 truncate">{entry.displayName}</p>
            {entry.roles.map((role) => (
              <span
                key={role}
                className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-700"
              >
                {ROLE_LABELS[role]}
              </span>
            ))}
            {entry.pending && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-100 text-amber-800">
                Pending consent
              </span>
            )}
            {!entry.active && !entry.pending && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-200 text-gray-600">
                Inactive
              </span>
            )}
          </div>
          <ContactLine contact={entry.contact} />
        </div>

        {/* Action controls — gated by capability + member selectability */}
        {actionsAllowed && (
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {capabilities.canChangeRole && canPromoteThisMember && (
              <button
                onClick={onPromote}
                disabled={!capabilities.canPromoteToManager}
                title={
                  capabilities.canPromoteToManager
                    ? undefined
                    : 'This team already has the maximum of two Managers.'
                }
                className="text-xs px-2.5 py-1 rounded-md bg-[#0091f3] text-white disabled:opacity-40"
              >
                Make Manager
              </button>
            )}
            {capabilities.canDeactivate && entry.active && (
              <button
                onClick={onDeactivate}
                className="text-xs px-2.5 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Deactivate
              </button>
            )}
            {capabilities.canReactivate && !entry.active && (
              <button
                onClick={onReactivate}
                className="text-xs px-2.5 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Reactivate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactLine({ contact }: { contact: ContactDisplay }) {
  if (contact.kind === 'self') {
    return <p className="text-sm text-gray-500 mt-0.5">{contact.cellphone}</p>;
  }
  if (contact.kind === 'caregiver') {
    return (
      <p className="text-sm text-gray-500 mt-0.5">
        {contact.name} · {contact.cellphone}
        <span className="text-gray-400"> (caregiver)</span>
      </p>
    );
  }
  // Missing caregiver contact (Req 3.11).
  return (
    <p className="text-sm text-amber-600 mt-0.5">Caregiver contact details missing</p>
  );
}

// ---- Roster fetch (reads team_members, the source of truth — Req 3.10) ------

/**
 * Fetch and assemble the roster for a team: its members (with all roles merged
 * per user), the age-band-appropriate contact for each, any pending children
 * awaiting consent (Req 5.10), and the metadata needed for capability checks.
 *
 * Age band (`.kiro/specs/add-player-and-dob-age-model/` Requirement 2.1-2.5):
 * each roster row's band now prefers that PERSON's own `date_of_birth`,
 * falling back to the team's `age_group` only where they have none recorded
 * — so one roster can legitimately mix DOB-derived and age_group-derived
 * bands person by person (Req 2.5). `deriveAgeBand(team.age_group)` is kept
 * only as that fallback and as a team-level summary on the returned
 * `RosterData` (unused by this component's own render today).
 *
 * `date_of_birth` itself (Requirement 4.2 — visible only to that team's
 * Coach/Manager/Admin) never appears on `RosterMember`/`RosterEntry`: it is
 * read here only to compute the (non-sensitive) age band, then discarded —
 * the same way `team.age_group`-derived classification was never itself
 * treated as sensitive. No UI in this feature renders a raw date of birth;
 * if a future feature (e.g. birthday reminders, Req 2.6) needs to actually
 * display one, that display — not this fetch — is where real caller-role
 * gating belongs, since `users` RLS (migration 004) permits any
 * authenticated read and cannot enforce it at the column level.
 */
async function fetchRoster(teamId: string, currentUserId: string): Promise<RosterData> {
  // Team classification + age group drive editability and the fallback band.
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, age_group, team_type')
    .eq('id', teamId)
    .single();
  if (teamError || !team) throw new Error(teamError?.message || 'Team not found');

  const teamAgeGroup = team.age_group as string;
  const ageBand = deriveAgeBand(teamAgeGroup); // team-level summary only — see doc comment above
  const teamType = (team.team_type as TeamType) ?? 'club_tournament';

  // Members (source of truth). Includes active + inactive.
  const memberRows = await rolesApi.getTeamMembers(teamId);
  const ageBandFor = (dateOfBirth: string | null | undefined) =>
    deriveAgeBandForPerson(dateOfBirth, teamAgeGroup);

  // Pending children awaiting caregiver consent are not yet team_members, so
  // they're read from their pending add-child approval records (Req 5.10).
  const { data: pendingApprovals, error: pendingError } = await supabase
    .from('caregiver_approvals')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('request_kind', 'add_child')
    .eq('status', 'pending');
  if (pendingError) throw new Error(pendingError.message);

  const pendingChildIds = (pendingApprovals ?? []).map(
    (row: { player_id: string }) => row.player_id
  );

  // Resolve pending child user rows (name, active flag, and their own DOB if
  // Add Player's Junior path recorded one — Req 4.1).
  let pendingChildren: Array<{
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
  }> = [];
  if (pendingChildIds.length > 0) {
    const { data: childUsers, error: childError } = await supabase
      .from('users')
      .select('id, first_name, last_name, date_of_birth')
      .in('id', pendingChildIds);
    if (childError) throw new Error(childError.message);
    pendingChildren = childUsers ?? [];
  }

  // Resolve every player's caregiver links so the contact of record can be
  // chosen (primary, else most recently linked) — per person now (Req 2.5),
  // not gated on a single team-wide band.
  const childCandidateIds = new Set<string>(pendingChildIds);
  for (const row of memberRows) {
    if (row.role === 'player' && ageBandFor(row.user?.date_of_birth) === 'child') {
      childCandidateIds.add(row.user_id);
    }
  }

  const caregiverLinksByPlayer = await fetchCaregiverLinks(Array.from(childCandidateIds));

  // Build the pre-merge roster rows from memberships.
  const members: RosterMember[] = memberRows.map((row) => ({
    userId: row.user_id,
    displayName: displayName(row),
    role: row.role,
    active: row.user?.active ?? true,
    contact: contactFor(
      ageBandFor(row.user?.date_of_birth),
      row.role,
      row.user?.cellphone ?? '',
      caregiverLinksByPlayer[row.user_id]
    ),
    pending: false,
  }));

  // Append pending children (players, inactive, non-selectable — Req 5.10).
  for (const child of pendingChildren) {
    // Skip if the child already appears as a member (defensive).
    if (members.some((m) => m.userId === child.id)) continue;
    members.push({
      userId: child.id,
      displayName: `${child.first_name} ${child.last_name}`.trim(),
      role: 'player',
      active: false,
      contact:
        ageBandFor(child.date_of_birth) === 'child'
          ? selectCaregiverContact(caregiverLinksByPlayer[child.id] ?? [])
          : { kind: 'self', cellphone: '' },
      pending: true,
    });
  }

  const entries = groupAndSortRoster(members);

  // Manager count for the cap (Req 4.8/4.9) — distinct users holding manager.
  const managerCount = new Set(
    memberRows.filter((r) => r.role === 'manager').map((r) => r.user_id)
  ).size;

  // Roles the current user holds on this team (capability resolution, Req 4.1).
  const currentUserRoles = memberRows
    .filter((r) => r.user_id === currentUserId)
    .map((r) => r.role as PermissionRole);

  // Map each user's player membership id so promotion targets the right row.
  const playerMembershipIdByUser: Record<string, string> = {};
  for (const row of memberRows) {
    if (row.role === 'player') playerMembershipIdByUser[row.user_id] = row.id;
  }

  return {
    entries,
    ageBand,
    teamType,
    managerCount,
    currentUserRoles,
    playerMembershipIdByUser,
  };
}

/** Group `player_caregivers` (with caregiver details) by player id. */
async function fetchCaregiverLinks(
  playerIds: string[]
): Promise<Record<string, CaregiverLink[]>> {
  const byPlayer: Record<string, CaregiverLink[]> = {};
  if (playerIds.length === 0) return byPlayer;

  const { data, error } = await supabase
    .from('player_caregivers')
    .select(
      'player_id, created_at, caregiver:users!player_caregivers_caregiver_id_fkey(first_name, last_name, cellphone)'
    )
    .in('player_id', playerIds);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as any[]) {
    const caregiver = row.caregiver;
    if (!caregiver) continue;
    const link: CaregiverLink = {
      name: `${caregiver.first_name ?? ''} ${caregiver.last_name ?? ''}`.trim(),
      cellphone: caregiver.cellphone ?? '',
      isPrimary: false, // no primary flag exists yet; ties break on linkedAt
      linkedAt: row.created_at ?? '',
    };
    (byPlayer[row.player_id] ??= []).push(link);
  }

  return byPlayer;
}

function displayName(row: TeamMemberWithUser): string {
  const first = row.user?.first_name ?? '';
  const last = row.user?.last_name ?? '';
  const name = `${first} ${last}`.trim();
  return name || 'Unknown member';
}

/** Contact of record for a roster member by age band (Req 3.7, 3.8, 3.11). */
function contactFor(
  ageBand: AgeBand,
  role: TeamRole,
  cellphone: string,
  caregiverLinks: CaregiverLink[] | undefined
): ContactDisplay {
  // Adult band: everyone shows their own cellphone (Req 3.7).
  if (ageBand === 'adult') {
    return { kind: 'self', cellphone };
  }
  // Child band: players route through a caregiver (Req 3.8/3.11); coaches and
  // managers are adults and show their own number.
  if (role === 'player') {
    return selectCaregiverContact(caregiverLinks ?? []);
  }
  return { kind: 'self', cellphone };
}
