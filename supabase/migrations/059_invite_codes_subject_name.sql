-- Migration 059: Add subject (child) name to invite_codes
--
-- Spec: `.kiro/specs/streamlined-invites-and-child-access/` (Decision 2)
--
-- Mirrors migration 054's recipient_first_name/recipient_last_name exactly,
-- for the child side of a Caregiver invite instead of the caregiver side.
-- The Manager already typed the child's name into Add Player (or, for
-- addCaregiverToExistingChild, it's the child's own already-recorded name)
-- before the invite was ever generated — previously that name was captured
-- nowhere on the invite itself, so LiteLandingPage.tsx's caregiver
-- registration form always asked the caregiver to type the child's name
-- into a blank field from scratch, with nothing to check it against. Live
-- testing on 2026-08-28 found this genuinely confusing (a caregiver who has
-- never met the child's own account has no way to know they typed the name
-- correctly), and the decision was made to reverse that original design
-- choice: prefill (never lock) the name, and require an explicit
-- confirmation checkbox on submit instead of relying on independent retyping
-- as the only safeguard.
--
-- Design notes:
-- - Nullable, no backfill: an invite created before this migration simply
--   has NULL here, and the registration page falls back to its existing
--   blank-field behaviour for those, same as migration 054.
-- - Deliberately NOT extended to a subject date-of-birth column: unlike the
--   child's name, Add Player's Junior path still collects no DOB at all
--   (confirmed against the current AddPlayerModal.tsx), so there is nothing
--   yet to store here for a brand-new child. The one path that DOES already
--   have a real recorded DOB — addCaregiverToExistingChild, for a child who
--   already exists — reads it directly from that child's own `users` row at
--   invite-generation time rather than duplicating it onto invite_codes.
-- - No RLS change: same reasoning as migrations 053/054 — write access to
--   invite_codes is already scoped to generateInviteCode's caller (a
--   permitted team member) or the redeem-invite service role; neither check
--   depends on this column. Read access is unchanged too: this column rides
--   along on the exact same invite_codes row LiteLandingPage.tsx's
--   validateInviteCode already reads today (recipient_first_name/
--   recipient_last_name), so no new RLS exposure is introduced.

ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS subject_first_name text;
ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS subject_last_name text;

COMMENT ON COLUMN public.invite_codes.subject_first_name IS
  'For a caregiver-intended invite only: the child''s first name, captured so the registration page can prefill (editable, not locked) it. NULL for invites created before this migration, or for every other invite type.';

COMMENT ON COLUMN public.invite_codes.subject_last_name IS
  'For a caregiver-intended invite only: the child''s last name, captured so the registration page can prefill (editable, not locked) it. NULL for invites created before this migration, or for every other invite type.';
