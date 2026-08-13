-- Migration 043: Allow unauthenticated (anon) users to read invite_codes
--
-- The lite user registration page (LiteLandingPage, /invite/:code) needs
-- to validate an invite code BEFORE the user has logged in - by definition,
-- the person clicking the link doesn't have an account yet. But the existing
-- RLS policy (from migration 036) only grants SELECT to authenticated users,
-- so the query returns nothing for anon users, and the page shows "Invalid
-- Code" regardless of whether the code actually exists.
--
-- Fix: add a SELECT policy for the anon role. This is safe because:
-- 1. Invite codes are designed to be shared publicly (emailed to recipients)
-- 2. The code itself is the secret — knowing the code IS the authorization
-- 3. We're only granting SELECT, not INSERT/UPDATE/DELETE
-- 4. The existing authenticated policy remains for logged-in admin views

CREATE POLICY "Allow anon users to validate invite codes"
  ON public.invite_codes
  FOR SELECT
  TO anon
  USING (true);
