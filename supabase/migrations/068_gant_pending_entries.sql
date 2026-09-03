-- Migration 068: gant_pending_entries — the Progress Notes capture queue
--
-- Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 1.1)
-- Requirements 3 (capture), 4 (review), 5 (pending queue).
--
-- WHAT THIS IS
-- Capture and review are deliberately two separate steps (design.md Section
-- 1). A coach/admin captures a raw observation about a player or a team —
-- possibly several in quick succession, pitch-side, with no obligation to
-- review any of them immediately (Req 3.1.3). Each capture becomes one row
-- here. It sits in the queue, visible only to the capturing coach (and
-- admins), until it is resolved via the tick/cross/Work-on review loop
-- (Section 4) — at which point it is either promoted into an approved
-- `game_feedback` row (Tick) or deleted outright with nothing saved (Cross).
-- Nothing here is meant to be long-lived: every row either becomes real
-- feedback or disappears. See design.md Section 2.1 for the full rationale,
-- including why this needs to be a real server-side table (surviving app
-- restarts and different sessions) rather than client-local state.
--
-- raw_text SHAPE
-- A jsonb array of rounds, oldest first: [{ "text": "...", "at": "<iso ts>" }].
-- The first element is the original capture; each subsequent element is one
-- "Work on" round (Req 4.5) — the coach can add as many rounds as needed,
-- no cap (Req 4.6). Kept as an array (not a single concatenated string) so
-- round_count and history are unambiguous and don't require re-parsing text.
--
-- REFINE-ON-OPEN, NOT REFINE-ON-CAPTURE (Req 3.1.2, decided 2026-09-03)
-- No Gant call happens at insert time. `last_gant_response` starts NULL and
-- is only populated the first time a coach opens this entry in Review, or
-- after they add a new "Work on" round — never eagerly. This keeps quick-fire
-- capture free of API round-trips. Re-opening an entry whose response is
-- already cached (nothing added since) should render that cached response
-- with no repeat call — see design.md Section 4.1.
--
-- RLS
-- Visible/writable only to the capturing coach (`captured_by = auth.uid()`)
-- or an admin — mirrors the "visible only to that coach (and admin)" rule
-- carried from the original Gant requirements docs. This is deliberately
-- narrower than `game_feedback`'s coach/manager/admin read rule: an
-- unresolved pending entry is one coach's in-progress work, not yet
-- something any coach/manager on the team should see.
--
-- Run manually in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.gant_pending_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  -- NULL = team-scoped entry (Req 3.1: "the coach selects one player, or the team").
  player_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  -- Video review reuses this same capture flow unchanged — it's purely a
  -- label, not a different code path (requirements.md Section 12, resolved).
  event_type text CHECK (event_type IN ('game', 'training', 'video_review')),
  -- Often NULL for a video-review entry not tied to a scheduled event
  -- (Req 5.3 — still an open detail, left nullable so either shape works).
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  raw_text jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_gant_response jsonb,
  round_count integer NOT NULL DEFAULT 0,
  captured_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gant_pending_entries_captured_by_idx
  ON public.gant_pending_entries (captured_by);
CREATE INDEX IF NOT EXISTS gant_pending_entries_team_id_idx
  ON public.gant_pending_entries (team_id);
CREATE INDEX IF NOT EXISTS gant_pending_entries_player_id_idx
  ON public.gant_pending_entries (player_id);

ALTER TABLE public.gant_pending_entries ENABLE ROW LEVEL SECURITY;

-- The capturing coach can see/manage their own pending entries...
DROP POLICY IF EXISTS "Coaches manage their own pending entries" ON public.gant_pending_entries;
CREATE POLICY "Coaches manage their own pending entries"
  ON public.gant_pending_entries
  FOR ALL
  TO authenticated
  USING (captured_by = auth.uid())
  WITH CHECK (captured_by = auth.uid());

-- ...and an admin can see/manage every pending entry (oversight, and so an
-- admin covering for an absent coach isn't locked out).
DROP POLICY IF EXISTS "Admins manage all pending entries" ON public.gant_pending_entries;
CREATE POLICY "Admins manage all pending entries"
  ON public.gant_pending_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text = 'admin'
    )
  );
