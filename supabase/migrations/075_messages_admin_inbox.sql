-- Migration 075: "Message the club admins" — team-less messages + a shared
-- admin inbox with two-way visibility for the original sender.
--
-- Spec: NEXT-SESSION-NOTES.md "V1.M — Messaging, send to Admins".
--
-- THE BUG
-- The compose form already offers a "Club Admin" target, and
-- messaging-api.resolveRecipients already resolves it to every admin — but a
-- message addressed to admins has no team, and `messages.team_id` was NOT
-- NULL with every messaging policy team-scoped. So:
--   1. The send failed — a club-admin message has no team, so `team_id` came
--      through empty and the insert was rejected (invalid/NOT NULL).
--   2. Even if it stored, the inbox query keys on team membership, so the
--      recipient admins would never see it.
--
-- THE MODEL (confirmed with the repo owner)
-- "Message admins" is a shared club inbox / support queue: any authenticated
-- user can send to the admins; all admins can see it (so whoever is around
-- picks it up); the ORIGINAL SENDER sees admin replies back. Admins are not
-- expected to "discuss" — they just share the inbox so nothing is missed.
--
-- THE FIX
--   a) `messages.team_id` becomes nullable — a club-admin message is genuinely
--      team-less.
--   b) INSERT policy also allows a team-less message from any authenticated
--      user (the "contact the club" path).
--   c) SELECT policy gains a clause so the thread's ROOT sender can read every
--      message in that thread — i.e. the coach/parent sees the admin's reply.
--      Done via a SECURITY DEFINER helper so the messages→messages lookup
--      bypasses RLS and cannot re-introduce the recursion migration 035 fixed.
--   d) Admin visibility is unchanged — the existing `role = 'admin'` clause in
--      the SELECT policy already lets admins read the shared inbox.
--
-- Run manually in the Supabase SQL Editor.

-- (a) team_id becomes optional. The FK stays; a NULL team just means
-- "not scoped to a team" (a club-admin message).
ALTER TABLE public.messages ALTER COLUMN team_id DROP NOT NULL;

-- Helper: the sender of a thread's ROOT (top-level) message, given any message
-- id in that thread. SECURITY DEFINER so the lookup runs without RLS — this is
-- the one sanctioned messages→messages read, and it breaks the recursion cycle
-- that a self-referential policy subquery would otherwise create (see mig 035).
CREATE OR REPLACE FUNCTION public.message_thread_root_sender(msg_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT root.sender_id
  FROM public.messages child
  JOIN public.messages root
    ON root.id = COALESCE(child.parent_message_id, child.id)
  WHERE child.id = msg_id;
$$;

-- (b) INSERT: team message (existing team-membership / admin checks) OR a
-- team-less message from any authenticated user (contact-the-club path).
DROP POLICY IF EXISTS "Team members can send messages to their team" ON public.messages;
CREATE POLICY "Team members can send messages to their team"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    messages.team_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = messages.team_id
      AND team_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_teams
      WHERE user_teams.team_id = messages.team_id
      AND user_teams.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role::text = 'admin'
    )
  );

-- (c) SELECT: sender of this row, OR a member of the row's team, OR an admin
-- (the shared-inbox clause), OR the ROOT sender of this thread (so the
-- original coach/parent sees admin replies). Team-less messages simply fail
-- the team-membership test and fall through to the admin / root-sender clauses.
DROP POLICY IF EXISTS "Users can read messages in their teams" ON public.messages;
CREATE POLICY "Users can read messages in their teams"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = messages.team_id
      AND team_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role::text = 'admin'
    )
    OR public.message_thread_root_sender(messages.id) = auth.uid()
  );
