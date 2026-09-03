-- Migration 072: gant_outcomes — the guardrails feedback-loop signal log
--
-- Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 1.4)
-- Requirement 10 (guardrails feedback loop): DECIDED 2026-09-03 there is NO
-- in-app analytics/insights UI for this in v1 — the goal is clean, exportable
-- data an admin can pull out and hand to Claude (or similar) externally for
-- guardrails-improvement suggestions, not an in-app pattern-detection
-- feature. This table is that data, nothing more.
--
-- WHAT GETS LOGGED
-- One append-only row per RESOLVED gant_pending_entries row — written right
-- before that pending row is deleted (on both Tick and Cross), so the
-- outcome survives even though the pending entry itself does not
-- (design.md Section 2.4). `round_count` is the number of "Work on" rounds
-- the entry took before resolving (Req 4.6: no cap, so this can be any
-- size) — the two useful signals per Req 10.1 are exactly "how many rounds"
-- and "ticked or crossed."
--
-- No player name/email/DOB here, only player_id (nullable — team-scoped
-- entries have none), consistent with the privacy rule applied everywhere
-- else in this spec (Requirement 8).
--
-- Admin-only read; written server-side (by the approve()/discard() flow,
-- Task 3.1 — not directly insertable by an ordinary authenticated client
-- write, since it's meant to be an honest log of what the app itself did).
--
-- Run manually in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.gant_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('ticked', 'crossed')),
  round_count integer NOT NULL,
  resolved_by uuid NOT NULL REFERENCES public.users(id),
  resolved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gant_outcomes_resolved_at_idx
  ON public.gant_outcomes (resolved_at DESC);

ALTER TABLE public.gant_outcomes ENABLE ROW LEVEL SECURITY;

-- Admin-only read (this is the data an admin exports for external review).
DROP POLICY IF EXISTS "Admins can read gant outcomes" ON public.gant_outcomes;
CREATE POLICY "Admins can read gant outcomes"
  ON public.gant_outcomes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text = 'admin'
    )
  );

-- Any authenticated coach/manager/admin resolving their own pending entry
-- can write the corresponding outcome row — this happens as part of the
-- approve()/discard() flow (Task 3.1), not as a free-standing write.
DROP POLICY IF EXISTS "Resolvers can log an outcome" ON public.gant_outcomes;
CREATE POLICY "Resolvers can log an outcome"
  ON public.gant_outcomes
  FOR INSERT
  TO authenticated
  WITH CHECK (resolved_by = auth.uid());
