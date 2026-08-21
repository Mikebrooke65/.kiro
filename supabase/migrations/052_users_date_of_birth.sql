-- Migration 052: Add date_of_birth to users
--
-- Spec: `.kiro/specs/add-player-and-dob-age-model/` (Requirement 2, 7.1)
--
-- Adult/Junior classification moves from teams.age_group (an approximation
-- from the team someone plays for) to each person's own date of birth.
-- Requirement 2.1: 16 years or older as of today => Adult; under 16 => Junior.
--
-- Design notes:
-- - Nullable, no default: every existing row stays NULL (Requirement 2.3/2.4).
--   This feature does not backfill DOB for existing users (Requirement 9.1) —
--   `deriveAgeBandForPerson` falls back to the teams.age_group-based rule
--   whenever a row has no date_of_birth, so no existing roster's contact
--   display changes on deploy.
-- - Populated by the redeem-invite Edge Function for a self-registering Adult
--   (self-declared at redemption, Requirement 3.4), or by caregivers-api for a
--   Junior added via Add Player (Requirement 4.1). Never populated for a
--   'caregiver'-role user by this feature.
-- - Visibility of a Junior's date_of_birth is scoped to that team's
--   Coach(es)/Manager(s)/Admin at the query layer (Requirement 4.2) — this
--   migration does not add column-level RLS for that; see the roster query
--   changes in this spec's tasks.md task 6.3.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS date_of_birth date;

COMMENT ON COLUMN public.users.date_of_birth IS
  'Self-declared (adult) or Manager-entered (junior) date of birth. NULL for every user added before this feature and never backfilled. Determines Adult (16+) vs Junior classification per add-player-and-dob-age-model Requirement 2.1, falling back to teams.age_group when absent.';
