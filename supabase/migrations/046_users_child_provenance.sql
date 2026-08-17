-- Migration 046: Add child provenance and sign-in capability columns to users
-- Supports the Add-a-Junior flow for the post-registration welcome and team page feature.
--
-- A child row carries is_child = true, a synthetic email, active = false until consent,
-- and a child_provenance recording its origin (Req 5.16). Caregivers remain ordinary
-- users rows with real emails that can sign in.
--
-- Requirements: 5.6, 5.16

-- ============================================================================
-- ADD is_child COLUMN
-- ============================================================================
-- Distinguishes child accounts (created via Add-a-Junior) from ordinary users.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_child boolean NOT NULL DEFAULT false;

-- ============================================================================
-- ADD child_provenance COLUMN
-- ============================================================================
-- Records the origin of a child record: a Club Tournament team or an External League team.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS child_provenance text
  CHECK (child_provenance IN ('club_tournament', 'external_league'));

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN public.users.is_child IS 'True for child accounts created via the Add-a-Junior flow; such rows use a synthetic email and remain active = false until caregiver consent.';
COMMENT ON COLUMN public.users.child_provenance IS 'Origin of a child record: club_tournament or external_league (Req 5.16).';
