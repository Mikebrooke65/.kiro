-- Migration 045: Allow unauthenticated (anon) users to read the ONE team an
-- invite code points at
--
-- DELIBERATE DEVIATION FROM DESIGN DECISION D2
-- Spec: .kiro/specs/lite-user-registration-fix/ (task 3.3, preservation
-- deviation 5 recorded in tasks.md "Preservation findings (task 2)").
-- The design states "no new migration is required (D2)". Task 2 observation
-- proved that is not quite true: nothing grants `anon` SELECT on public.teams,
-- so the `team:teams(*)` embed in validateInviteCode() comes back NULL and the
-- invite page heading and success screen render "undefined undefined" for an
-- anonymous visitor. validateInviteCode() stays client-side and anonymous under
-- the fix, so without this policy preservation requirements 3.8 (team name
-- renders as `{age_group} {name}`) and 2.5 (success screen names the team) fail
-- after the fix. Adding the policy was chosen over returning the team from the
-- Edge Function because the heading has to render BEFORE registration, when
-- there is nothing to call the function with.
--
-- Scope: this is NOT a blanket read grant. Mirroring migration 043, the code is
-- the secret — but unlike 043 the policy is narrowed further, to teams that are
-- referenced by an invite code which is still unredeemed and unexpired. So an
-- anonymous visitor can read a team row only while a live invitation to that
-- team exists, and never the rest of the club's teams.
--
-- Safe because:
-- 1. SELECT only — no INSERT/UPDATE/DELETE for anon
-- 2. Restricted by EXISTS to teams with a live (unredeemed, unexpired) invite
-- 3. Reveals only what an invited person is already being told: the name of the
--    team they have been invited to
-- 4. Existing authenticated/admin policies (migration 002) are untouched
--
-- The subquery reads public.invite_codes, which anon may already SELECT under
-- migration 043, so no additional grant is needed for it to evaluate.

CREATE POLICY "Allow anon users to read teams with a live invite"
  ON public.teams
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.invite_codes ic
      WHERE ic.team_id = teams.id
        AND ic.redeemed_by IS NULL
        AND ic.expires_at > now()
    )
  );

-- Keeps the EXISTS check above cheap; also serves the pending-invite lookups in
-- invites-api.ts.
CREATE INDEX IF NOT EXISTS invite_codes_team_id_idx
  ON public.invite_codes(team_id);
