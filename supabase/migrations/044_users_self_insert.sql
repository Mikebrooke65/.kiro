-- Migration 044: Allow newly-signed-up users to insert their own profile row
--
-- The lite user self-registration flow (redeemInviteCode in invites-api.ts)
-- calls supabase.auth.signUp() then immediately inserts a row into the users
-- table. This runs client-side (not via service_role), so it needs an RLS
-- policy allowing the freshly-authenticated user to create their own row.
--
-- Previously only admins or service_role could INSERT into users (migrations
-- 002-004), which worked for the admin Edge Function but blocked
-- self-registration entirely ("new row violates row-level security policy").
--
-- This policy is safe: it restricts INSERT to rows where id = auth.uid(),
-- meaning a user can only ever create their own profile, not anyone else's.

CREATE POLICY "Users can insert own profile on signup"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Also need to allow the new user to insert themselves into team_members
-- (the next step after profile creation in redeemInviteCode). Existing
-- policies only allow coaches/managers/admins to add team members.

CREATE POLICY "Users can add themselves to a team via invite redemption"
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
