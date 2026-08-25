-- Migration 054: Add recipient name to invite_codes
--
-- Spec: `.kiro/specs/add-player-and-dob-age-model/` (UX follow-up — self-registration prefill)
--
-- The Manager already types the invitee's first/last name into Add Player
-- before the invite is sent (Requirement 1.2). Previously that name was used
-- only for the invite email greeting and then discarded — the invitee had to
-- retype it from scratch on the registration page, even though the address
-- is already verified (it's literally where the invite was delivered) and the
-- name was already captured. This adds two nullable columns so the
-- registration page (`LiteLandingPage.tsx`) can prefill (not lock) the name
-- fields, while the email field is locked to `recipient_email` — the invite's
-- verified address — rather than left freely editable.
--
-- Design notes:
-- - Nullable, no backfill: older invites created before this migration simply
--   have NULL here, and the registration page falls back to its existing
--   blank-field behaviour for those.
-- - Deliberately NOT extended to date_of_birth: the Manager's DOB entry on
--   Add Player is provisional routing only (Adult vs Junior), never the
--   record of truth. The invitee's own self-declared DOB at redemption
--   (Requirement 3.4) must stay a fresh, independently-typed value every
--   time — prefilling or rubber-stamping it would defeat the reason
--   self-declaration exists (a Manager's mistaken or gamed DOB could
--   otherwise sail through a confirm checkbox unchallenged).
-- - No RLS change: same reasoning as migration 053 — write access to
--   invite_codes is already scoped to generateInviteCode's caller
--   (a permitted team member) or the redeem-invite service role; neither
--   check depends on this column.

ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS recipient_first_name text;
ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS recipient_last_name text;

COMMENT ON COLUMN public.invite_codes.recipient_first_name IS
  'First name the Manager entered for this invitee in Add Player, captured so the registration page can prefill (editable, not locked) it. NULL for invites created before this migration.';

COMMENT ON COLUMN public.invite_codes.recipient_last_name IS
  'Last name the Manager entered for this invitee in Add Player, captured so the registration page can prefill (editable, not locked) it. NULL for invites created before this migration.';
