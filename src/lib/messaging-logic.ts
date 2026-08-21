// Pure logic for message-recipient resolution.
//
// Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 7.1)
//
// Kept in its own file, importing nothing, for the same reason
// `roster-logic.ts` and `add-player-logic.ts` are: `messaging-api.ts`
// extends `ApiClient`, which imports `src/lib/supabase.ts`, which reads
// `import.meta.env` and throws at module load outside a Vite environment —
// so it cannot be imported by vitest (node). This file can be.

/**
 * Pure union for 'whole_team' recipient resolution.
 *
 * Requirement 6.3 — a caregiver never has their own `team_members` row on a
 * team (Requirement 6.1/6.2), so a `'whole_team'` send that reads only
 * `team_members` silently excludes every caregiver. This adds them back in:
 * the team's own `team_members` user ids, unioned with every caregiver whose
 * linked child holds an active `team_members` row on the same team.
 *
 * Deduplicated — a caregiver who happens to ALSO independently be a
 * `team_members` row on this team (e.g. also a Coach) is not double-counted.
 * This does not give the caregiver "their own separate roster row"
 * (Requirement 6.4 explicitly says that is not required) — it is only
 * recipient-id resolution for a message send.
 */
export function unionTeamAndCaregiverRecipients(
  teamMemberIds: readonly string[],
  caregiverIds: readonly string[]
): string[] {
  return Array.from(new Set([...teamMemberIds, ...caregiverIds]));
}
