-- Migration 051: Extend caregiver_approvals to serve as the add-a-child consent record
-- Supports the Add-a-Junior flow for the post-registration welcome and team page feature.
--
-- The table already models "add a caregiver to an existing player" via its new_caregiver_*
-- columns, which are retained. For the add-a-junior flow the same row becomes the child's
-- consent record: player_id is the newly created child, requested_by is the adding Manager,
-- and the caregiver being asked is resolved via player_caregivers. request_kind disambiguates
-- the two uses and team_id records the add_child context.
--
-- Requirements: 5.8, 5.13

-- ============================================================================
-- ADD request_kind COLUMN
-- ============================================================================
-- Distinguishes an add-a-caregiver request from an add-a-child consent record.
ALTER TABLE public.caregiver_approvals ADD COLUMN IF NOT EXISTS request_kind text
  NOT NULL DEFAULT 'add_caregiver'
  CHECK (request_kind IN ('add_caregiver', 'add_child'));

-- ============================================================================
-- ADD team_id COLUMN
-- ============================================================================
-- Records the team context for an add_child consent request.
ALTER TABLE public.caregiver_approvals ADD COLUMN IF NOT EXISTS team_id uuid
  REFERENCES public.teams(id);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN public.caregiver_approvals.request_kind IS 'Disambiguates the row: add_caregiver (add a caregiver to an existing player) or add_child (consent record for a newly added child) (Req 5.8).';
COMMENT ON COLUMN public.caregiver_approvals.team_id IS 'Team context for an add_child consent request (Req 5.13).';
