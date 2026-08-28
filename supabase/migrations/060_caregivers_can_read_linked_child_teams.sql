-- Migration 060: caregivers can read the teams their linked children play on
--
-- Found live 2026-08-28 while re-testing Task 12 item #2 (Child happy path)
-- after tonight's earlier 6-patch fix: Mortimer (caregiver) still saw "You
-- are not a member of any team yet" on the Team page, even though Mickey
-- (his linked child) is an active member of Open Riverhead Frogs.
--
-- Root cause: a `teams` SELECT policy that exists LIVE on this database but
-- was never captured in any migration file --
--
--   "Members can read their teams"
--   USING (EXISTS (SELECT 1 FROM team_members tm
--                  WHERE tm.team_id = teams.id AND tm.user_id = auth.uid()))
--
-- -- requires the REQUESTING user (auth.uid()) to have their own
-- `team_members` row on that team. `teamsApi.getMyTeams()` (fixed earlier
-- tonight, commit 6dcc185) correctly looks up a caregiver's linked children
-- via `player_caregivers` and reads THEIR `team_members` rows, joined to
-- `teams` -- but that join is still subject to this same policy, evaluated
-- against the CAREGIVER's auth.uid(), not the child's. A caregiver never has
-- their own `team_members` row (only their linked child does), so the
-- `teams` embed silently comes back NULL for every row, `buildTeamSelection`
-- treats a null `.team` as "skip this membership", and the caregiver ends up
-- with zero options -- exactly the "not a member of any team" screen, for a
-- caregiver who very much has an active child on the roster.
--
-- This is the confirmed live-database policy list as of 2026-08-28 (via
-- `pg_policy`, not the migration files, since this table's policies have
-- drifted from what's committed before -- see migration 057's own note on
-- this same drift, in the other direction):
--   - "Admins can manage teams" (admin, all)
--   - "Allow anon users to read teams with a live invite" (anon, select)
--   - "Members can read their teams" (select, via team_members)
--   - "Users can view assigned teams" (select, via `user_teams` -- a table
--     nothing in this app's code has ever written a row to; dead policy)
--
-- Same blind spot, same fix needed, in every place that calls
-- `teamsApi.getMyTeams()` and reads `.team` off the result: TeamPage.tsx
-- (the roster), Games.tsx (fixtures/results), and Coaching.tsx all filter
-- out a null `.team` the same way, so all three would have shown "no teams"
-- for a caregiver today, not just the Team page. `MessagingContext.tsx`
-- only reads `.team_id` off the same rows (never `.team`), so it was never
-- affected by this specific gap.
--
-- Fix: a new, narrowly-scoped SELECT policy mirroring "Members can read
-- their teams", but keyed off the requesting user's `player_caregivers`
-- links instead of their own `team_members` row. Additive only -- grants
-- nothing to a user with no caregiver links (an ordinary Player/Coach/
-- Manager/Admin keeps exactly the access the existing policies already
-- gave them), and only ever exposes a team a linked child is actually on.

CREATE POLICY "Caregivers can read their linked children's teams"
  ON public.teams
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      JOIN public.player_caregivers pc ON pc.player_id = tm.user_id
      WHERE tm.team_id = teams.id
        AND pc.caregiver_id = auth.uid()
    )
  );
