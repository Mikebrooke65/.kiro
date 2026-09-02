-- Migration 066: keep users.role in sync with team_members automatically
--
-- Spec: NEXT-SESSION-NOTES.md "V1.R" item D.
--
-- Context: `users.role` (a genuine Postgres ENUM, `user_role` -- migration
-- 001) is read directly by MainLayout.tsx's header and by
-- main-layout-logic.ts's `tabsForRole` to decide which bottom-nav tabs a
-- signed-in user sees. Confirmed live 2026-09-01 (see NEXT-SESSION-NOTES.md,
-- "Roster Remove" Variant 2): promoting Hewie Duck to role='coach' on
-- team_members correctly showed "[Coach]" on the roster, but his own header
-- and nav tabs still read "player" -- because nothing updates the global
-- users.role when a per-team team_members.role changes. That's a real
-- functional bug (missing Coaching/Games nav tabs), not cosmetic.
--
-- Fix: rather than scattering "also update users.role" calls across every
-- promotion/demotion/remove/make-coach call site (and missing any future
-- one, or a direct SQL edit), a single trigger on team_members recomputes
-- the affected user's global role after every INSERT, UPDATE, or DELETE.
-- This mirrors the established pattern of migration 048's enforce_manager_cap
-- BEFORE-trigger on the same table.
--
-- Precedence when computing the role (highest wins), across ALL of that
-- user's team_members rows on ANY team:
--   1. manager   -- role = 'manager' on any team
--   2. coach     -- role = 'coach' OR is_coach = true on any team
--   3. player    -- role = 'player' on any team
--   4. (no team_members rows at all) -- 'caregiver' if a player_caregivers
--      row links them as caregiver_id to anyone, else 'player'
--
-- 'admin' is deliberately never auto-derived -- an Admin's global role is a
-- manual, standing designation (per the user's steer, 2026-09-01: "admins
-- will only initially get involved with league teams... the admin would only
-- get involved to help them fix something"), so the trigger skips any user
-- whose CURRENT role is already 'admin' and leaves it untouched.
--
-- Runs SECURITY DEFINER because migration 004's users RLS policy
-- ("users_update_own") explicitly forbids a client-side UPDATE from changing
-- `role` at all (`role = (SELECT role FROM users WHERE id = auth.uid())`) --
-- this trigger is the one sanctioned path that changes it, on the server
-- side, in response to an actual team_members change.
--
-- Run manually in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.sync_user_role_from_team_membership()
RETURNS trigger AS $$
DECLARE
  affected_user_id uuid;
  current_role text;
  computed_role text;
  has_manager boolean;
  has_coach boolean;
  has_player boolean;
  has_caregiver_link boolean;
BEGIN
  affected_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT role::text INTO current_role
  FROM public.users
  WHERE id = affected_user_id;

  -- No matching user (shouldn't happen given the FK, but be defensive), or
  -- Admin is manual-only -- never auto-derive it away.
  IF current_role IS NULL OR current_role = 'admin' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    bool_or(role = 'manager'),
    bool_or(role = 'coach' OR is_coach = true),
    bool_or(role = 'player')
  INTO has_manager, has_coach, has_player
  FROM public.team_members
  WHERE user_id = affected_user_id;

  IF has_manager THEN
    computed_role := 'manager';
  ELSIF has_coach THEN
    computed_role := 'coach';
  ELSIF has_player THEN
    computed_role := 'player';
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.player_caregivers
      WHERE caregiver_id = affected_user_id
    ) INTO has_caregiver_link;

    computed_role := CASE WHEN has_caregiver_link THEN 'caregiver' ELSE 'player' END;
  END IF;

  IF computed_role IS DISTINCT FROM current_role THEN
    UPDATE public.users
    SET role = computed_role::user_role
    WHERE id = affected_user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS team_members_sync_user_role ON public.team_members;
CREATE TRIGGER team_members_sync_user_role
  AFTER INSERT OR UPDATE OR DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_role_from_team_membership();
