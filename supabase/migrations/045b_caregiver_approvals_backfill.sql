-- Migration 045b: Backfill the caregiver_approvals table (recovery migration)
--
-- WHY THIS EXISTS
-- Migration 036 (user_role_management) was only PARTIALLY applied to the
-- production database: its earlier objects (competitions, competition_teams,
-- invite_codes, player_caregivers) exist, but section 6 — the
-- `caregiver_approvals` table — was never created. This was discovered on
-- 2026-08-18 when migration 051 (which ALTERs caregiver_approvals) failed with
-- `relation "public.caregiver_approvals" does not exist`.
--
-- This migration re-creates the table exactly as migration 036 section 6
-- defined it, so that:
--   * the existing "add a caregiver to a player" flow works, and
--   * migration 051 (add_child consent columns) can apply on top of it.
--
-- It is idempotent (CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS guards)
-- and must be applied BEFORE migration 051.
--
-- Numbered 045b so it sorts ahead of the 046-051 feature migrations for the
-- post-registration-welcome-and-team-page spec.
--
-- Run manually in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.caregiver_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.users(id),
  new_caregiver_email text NOT NULL,
  new_caregiver_first_name text NOT NULL,
  new_caregiver_last_name text NOT NULL,
  requested_by uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'escalated')),
  responded_by uuid REFERENCES public.users(id),
  responded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS caregiver_approvals_player_id_idx ON public.caregiver_approvals(player_id);
CREATE INDEX IF NOT EXISTS caregiver_approvals_status_idx ON public.caregiver_approvals(status);

ALTER TABLE public.caregiver_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read caregiver_approvals" ON public.caregiver_approvals;
CREATE POLICY "Allow authenticated users to read caregiver_approvals"
  ON public.caregiver_approvals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow caregivers to respond to approvals" ON public.caregiver_approvals;
CREATE POLICY "Allow caregivers to respond to approvals"
  ON public.caregiver_approvals FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.player_caregivers
      WHERE player_caregivers.player_id = caregiver_approvals.player_id
      AND player_caregivers.caregiver_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text = 'admin'
    )
  );

DROP POLICY IF EXISTS "Allow coaches/managers to create caregiver approvals" ON public.caregiver_approvals;
CREATE POLICY "Allow coaches/managers to create caregiver approvals"
  ON public.caregiver_approvals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.user_id = auth.uid()
      AND team_members.role IN ('coach', 'manager')
    )
  );
