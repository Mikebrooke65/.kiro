-- Allow the `manager` role on team_members and enforce a maximum of two Managers per team.
--
-- Context (V1.4 - post-registration-welcome-and-team-page):
--   * Migration 021 created team_members with role CHECK (role IN ('player', 'coach')),
--     but the Manager role is used elsewhere in the app. This makes `manager` a valid
--     team role (Requirement 6.1).
--   * The Manager cap (max 2 per team) must be enforced at the data layer so a promotion
--     that bypasses the UI is still rejected and the member's role is left unchanged
--     (Requirement 4.10).
--
-- Run manually in the Supabase SQL Editor. Do NOT run against a live database as part of
-- code generation.

-- 1. Replace the role check to allow 'manager'.
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('player', 'coach', 'manager'));

-- 2. Enforce the Manager cap (max 2 per team) via a BEFORE INSERT OR UPDATE trigger.
--    The check counts existing Manager rows on the same team excluding the row being
--    written, and raises `manager_cap_reached` when the cap is already met. Because the
--    trigger fires before the write, the member's existing role is left unchanged.
CREATE OR REPLACE FUNCTION enforce_manager_cap() RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'manager' THEN
    IF (SELECT count(*) FROM public.team_members
        WHERE team_id = NEW.team_id AND role = 'manager'
        AND id <> COALESCE(NEW.id, gen_random_uuid())) >= 2 THEN
      RAISE EXCEPTION 'manager_cap_reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_members_manager_cap ON public.team_members;
CREATE TRIGGER team_members_manager_cap
  BEFORE INSERT OR UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION enforce_manager_cap();
