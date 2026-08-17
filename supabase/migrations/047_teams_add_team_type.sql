-- Migration 047: Add team_type classification to public.teams
--
-- Feature: post-registration-welcome-and-team-page (V1.4), task 1.2
-- Requirements: 4.3, 5.14, 5.17
--
-- WHY
-- The Team Page's editability and the add-a-junior consent path both key off a
-- stable per-team classification. Two team types are distinguished:
--   'club_tournament' - app-managed teams; rosters are editable by Coach/Manager
--                       /Admin, and adding a junior requires caregiver consent.
--   'external_league' - imported rosters; always read-only regardless of role,
--                       and children are linked without a consent step.
--
-- Defaulting to 'club_tournament' keeps every existing app-managed team editable
-- after this migration; imported rosters are explicitly marked 'external_league'.
--
-- NOTE: This is the team_type on public.teams, distinct from lessons.team_type
-- added in migration 027 (which classifies lesson programmes, not teams).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_type text
  NOT NULL DEFAULT 'club_tournament'
  CHECK (team_type IN ('club_tournament', 'external_league'));

COMMENT ON COLUMN public.teams.team_type IS
  'Team classification: club_tournament (app-managed, editable roster, consent required to add juniors) or external_league (imported, read-only roster, no consent step). Drives Team Page editability (Req 4.3) and add-a-junior path (Req 5.14/5.17).';
