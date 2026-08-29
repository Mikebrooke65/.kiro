-- Migration 061: caregivers can read the team a still-PENDING linked child
-- is being added to
--
-- Found live 2026-08-28, immediately after migration 060: a fresh
-- child/caregiver pair (George Pig / Daddy Pig) confirmed that migration
-- 060 alone doesn't cover every caregiver case. Daddy Pig, right after
-- redeeming his caregiver invite, still saw "You are not a member of any
-- team yet" -- because George has no `team_members` row at all yet (a
-- pending child only exists as a `caregiver_approvals` row until someone
-- approves them -- see `TeamPage.tsx`'s `fetchRoster` comment: "Pending
-- children awaiting caregiver consent are not yet team_members"). Migration
-- 060's policy requires the linked child to already HAVE a `team_members`
-- row, so it has nothing to match for a still-pending child -- leaving a
-- brand-new caregiver with literally no way to ever open the team and reach
-- the roster's inline Accept/Deny row, since reaching it requires selecting
-- the team first.
--
-- `teamsApi.getMyTeams()` (this same commit) now also unions in the team of
-- any pending `add_child` approval for a linked child, via
-- `caregiver_approvals` instead of `team_members`. This migration is the
-- matching RLS grant that read needs: without it the `teams` embed for a
-- pending child's team still comes back NULL under RLS, same failure mode
-- as before migration 060.
--
-- Additive only, narrowly scoped: a user with no pending `add_child`
-- request naming them (via `player_caregivers`) gets no new access, and a
-- caregiver only ever sees a team a request they're actually named on
-- points at.

CREATE POLICY "Caregivers can read teams for their pending child requests"
  ON public.teams
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.caregiver_approvals ca
      JOIN public.player_caregivers pc ON pc.player_id = ca.player_id
      WHERE ca.team_id = teams.id
        AND ca.request_kind = 'add_child'
        AND ca.status = 'pending'
        AND pc.caregiver_id = auth.uid()
    )
  );
