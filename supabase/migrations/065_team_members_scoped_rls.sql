-- Migration 065: scope team_members write access to the acting user's own team
--
-- Spec: NEXT-SESSION-NOTES.md "V1.R" item A.
--
-- Problem: migration 036's "Allow admins and managers to manage team members"
-- policy checks ONLY the acting user's GLOBAL users.role:
--
--   USING (EXISTS (SELECT 1 FROM public.users
--                   WHERE users.id = auth.uid()
--                   AND users.role::text IN ('admin', 'coach', 'manager')))
--
-- That's completely unscoped to team_id -- anyone whose GLOBAL role happens
-- to be coach or manager (because of their role on ANY one team) can write
-- to team_members rows on ANY OTHER team, not just their own.
--
-- Fix: replace it with a policy scoped to the specific team_id being written,
-- via a SECURITY DEFINER helper function rather than a raw self-referencing
-- subquery on team_members from within its own policy -- a raw self-join
-- there risks Postgres/Supabase's "infinite recursion detected in policy"
-- failure mode (see migration 035's note on the same class of problem, there
-- caused by a different, cross-table recursion). A SECURITY DEFINER function
-- executes with the privileges of its owner (the migration-running role,
-- which owns the tables), so its internal team_members lookup does not
-- re-enter this policy and cannot recurse.
--
-- Additive to (not a replacement of) migration 044's separate, narrower
-- "Users can add themselves to a team via invite redemption" INSERT policy,
-- which is untouched -- Postgres ORs multiple policies for the same command.
--
-- Run manually in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.user_can_edit_team(target_team_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = target_team_id
        AND team_members.user_id = auth.uid()
        AND (team_members.role IN ('coach', 'manager') OR team_members.is_coach = true)
    );
$$;

COMMENT ON FUNCTION public.user_can_edit_team(uuid) IS
  'True if the current auth.uid() may manage team_members rows on target_team_id: a global admin, or a Coach/Manager/is_coach member of that SPECIFIC team. SECURITY DEFINER so its internal team_members lookup does not re-enter RLS on team_members and risk policy recursion.';

DROP POLICY IF EXISTS "Allow admins and managers to manage team members" ON public.team_members;

CREATE POLICY "Allow admins and this team's coaches/managers to manage team members"
  ON public.team_members
  FOR ALL
  TO authenticated
  USING (public.user_can_edit_team(team_id))
  WITH CHECK (public.user_can_edit_team(team_id));
