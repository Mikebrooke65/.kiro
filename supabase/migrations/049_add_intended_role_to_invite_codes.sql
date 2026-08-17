-- Migration 049: Add intended_role to invite_codes
--
-- Requirement 6.1: An invite code must carry an intended role for the invited
-- person, constrained to the valid set 'player', 'coach', or 'manager'.
--
-- This backs the redeem-invite role fix (Finding B): today redeem-invite
-- hardcodes role 'player', so Manager invitees land as players. The invite
-- must record the role it was created for so redemption can honour it.
--
-- Design notes:
-- - Nullable: a null (or otherwise invalid) value defaults to 'player' in
--   redeem-invite (Requirements 6.4/6.5), so existing invite rows remain valid.
-- - 'admin' is deliberately EXCLUDED from the CHECK set so an elevated admin
--   role can never be granted through invite redemption.

ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS intended_role text
  CHECK (intended_role IN ('player', 'coach', 'manager'));

COMMENT ON COLUMN public.invite_codes.intended_role IS
  'Role granted on redemption: player, coach, or manager. NULL defaults to player. admin is excluded by design.';
