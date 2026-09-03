-- Migration 073: gant_player_summaries — cached Progress Notes auto-summary
--
-- Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 7.1)
-- Requirement 7.2: DECIDED 2026-09-03 — cached-on-approval, not live-on-open.
-- The summary at the top of a player's Progress Notes feed (last ~10 notes,
-- synthesised) is generated once, when a note is ticked (not every time the
-- screen opens), and simply read from here on view. Deliberately not forced
-- to regenerate on every visit — "don't want it being forced to update
-- without a reason" (repo owner, 2026-09-03).
--
-- One row per player who has at least one approved note. Upserted by the
-- approve() flow (Task 3.1 / Task 7.2) whenever a note is ticked for that
-- player — team-scoped ticks don't touch this table (no single player to
-- summarise for).
--
-- Read access mirrors game_feedback's player/caregiver/coach/admin read
-- rules (migration 070) — whoever can see a player's individual notes can
-- see their summary. Write access is server-side only (the approve() flow),
-- not a free client write.
--
-- Run manually in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.gant_player_summaries (
  player_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  summary_text text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gant_player_summaries ENABLE ROW LEVEL SECURITY;

-- Same viewers as an individual's game_feedback rows (migration 070):
-- the player themselves, their caregiver, and any coach/manager/admin.
DROP POLICY IF EXISTS "Players can read their own summary" ON public.gant_player_summaries;
CREATE POLICY "Players can read their own summary"
  ON public.gant_player_summaries
  FOR SELECT
  TO authenticated
  USING (player_id = auth.uid());

DROP POLICY IF EXISTS "Caregivers can read their linked child's summary" ON public.gant_player_summaries;
CREATE POLICY "Caregivers can read their linked child's summary"
  ON public.gant_player_summaries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.player_caregivers pc
      WHERE pc.player_id = gant_player_summaries.player_id
        AND pc.caregiver_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Coaches and admins can read any summary" ON public.gant_player_summaries;
CREATE POLICY "Coaches and admins can read any summary"
  ON public.gant_player_summaries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text IN ('admin', 'coach', 'manager')
    )
  );

-- Written server-side by the approve() flow (Task 3.1/7.2) on behalf of the
-- resolving coach/manager/admin — not a free-standing client write.
DROP POLICY IF EXISTS "Coaches and admins can upsert summaries" ON public.gant_player_summaries;
CREATE POLICY "Coaches and admins can upsert summaries"
  ON public.gant_player_summaries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text IN ('admin', 'coach', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text IN ('admin', 'coach', 'manager')
    )
  );
