-- Migration 070: player/caregiver read access to their own Progress Notes
--
-- Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 6.1)
-- Requirements 6.3, 6.5, 8.1-8.5 (as originally drafted; consolidated into
-- the current requirements.md Sections 6.3/6.5).
--
-- PROBLEM
-- `game_feedback`'s existing SELECT policies (migration 022) only cover
-- admins, coaches (via team_members.role='coach'), and managers (a
-- users.role='manager' who is also a team_members row on that team). There
-- is no policy letting a player read feedback about themselves, no policy
-- letting a team member read team-scoped feedback for their own team, and
-- no policy letting a caregiver read their linked child's feedback. Until
-- this migration, a player/caregiver cannot see ANY Progress Notes at all —
-- confirmed as a genuine gap during design (design.md Section 6.1), not a
-- pre-existing bug being fixed.
--
-- FIX — four additive SELECT policies, each narrowly scoped:
--
-- 1. A player reads their OWN individual notes (`player_id = auth.uid()`).
-- 2. A player reads TEAM notes for a team they belong to (via team_members).
-- 3. A caregiver reads their linked child's individual notes (via
--    player_caregivers — mirrors migration 060's pattern for `teams`).
-- 4. A caregiver reads TEAM notes for their linked child's team (same join,
--    team-scoped case).
--
-- A logged-in child (device-login model) is covered by policy 1/2 exactly
-- like any other player — `player_id = auth.uid()` doesn't distinguish an
-- adult player from a device-logged-in child, so no separate policy is
-- needed for that case (requirements.md Section 6.3, resolved 2026-09-03:
-- a logged-in child sees their own notes directly, same as their caregiver).
--
-- All four are purely additive (existing admin/coach/manager SELECT policies
-- untouched) and read-only — no INSERT/UPDATE/DELETE grant here. Write
-- access to game_feedback is unchanged: only a coach/manager/admin, and only
-- via the Gant review loop's approve() step, per Req 6.2.
--
-- Run manually in the Supabase SQL Editor.

-- 1. Player reads their own individual feedback.
DROP POLICY IF EXISTS "Players can read their own feedback" ON public.game_feedback;
CREATE POLICY "Players can read their own feedback"
  ON public.game_feedback
  FOR SELECT
  TO authenticated
  USING (
    feedback_type = 'player'
    AND player_id = auth.uid()
  );

-- 2. Any team member reads team-scoped feedback for their own team.
DROP POLICY IF EXISTS "Team members can read their team's feedback" ON public.game_feedback;
CREATE POLICY "Team members can read their team's feedback"
  ON public.game_feedback
  FOR SELECT
  TO authenticated
  USING (
    feedback_type = 'team'
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = game_feedback.team_id
        AND tm.user_id = auth.uid()
    )
  );

-- 3. A caregiver reads their linked child's individual feedback.
DROP POLICY IF EXISTS "Caregivers can read their linked child's feedback" ON public.game_feedback;
CREATE POLICY "Caregivers can read their linked child's feedback"
  ON public.game_feedback
  FOR SELECT
  TO authenticated
  USING (
    feedback_type = 'player'
    AND EXISTS (
      SELECT 1 FROM public.player_caregivers pc
      WHERE pc.player_id = game_feedback.player_id
        AND pc.caregiver_id = auth.uid()
    )
  );

-- 4. A caregiver reads team-scoped feedback for their linked child's team.
DROP POLICY IF EXISTS "Caregivers can read their linked child's team feedback" ON public.game_feedback;
CREATE POLICY "Caregivers can read their linked child's team feedback"
  ON public.game_feedback
  FOR SELECT
  TO authenticated
  USING (
    feedback_type = 'team'
    AND EXISTS (
      SELECT 1
      FROM public.team_members tm
      JOIN public.player_caregivers pc ON pc.player_id = tm.user_id
      WHERE tm.team_id = game_feedback.team_id
        AND pc.caregiver_id = auth.uid()
    )
  );
