-- Migration 069: additive Progress Notes columns on game_feedback
--
-- Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 1.2)
-- Design.md Section 2.2: reuse the live `game_feedback` table (migrations
-- 022 + 025) rather than a new table — its `game_id` already means "event
-- id" for any event type (games are events, project standard), and the
-- existing write path (`gamesApi.createGameFeedback`, `Games.tsx`) keeps
-- working unchanged. This migration only adds columns; nothing existing is
-- altered or removed.
--
-- event_type: capture context, matching gant_pending_entries (068). Nullable
-- so existing rows (predating this feature) are unaffected.
--
-- phase_tags: the phase-of-play tag(s) Gant's refinement assigned (Req 3.2,
-- 6.2). Empty array default so existing/non-Gant rows read cleanly as "no
-- tags" rather than NULL.
--
-- gant_assisted: internal/audit marker ONLY. Per Req 6.4 (revised
-- 2026-09-03): a coach/admin may know Gant by name in their own working
-- screens, but this column itself is never surfaced to a player/caregiver —
-- it exists for admin/reporting use (e.g. distinguishing Gant-assisted from
-- manually-typed-and-saved feedback, should that ever matter), not as a
-- disclosure mechanism.
--
-- round_count: carried over from the resolving `gant_pending_entries` row at
-- Tick time (design.md Section 4.2) — a historical record of how many
-- "Work on" rounds this entry took, for the guardrails feedback-loop signal
-- (Req 10, exported via gant_outcomes — see migration 071). NULL for
-- non-Gant rows (manually entered feedback never went through the loop).
--
-- No RLS changes here — that is migration 070 (player/caregiver read access)
-- and migration 072 (guardrails), kept separate for clarity.
--
-- Run manually in the Supabase SQL Editor.

ALTER TABLE public.game_feedback
  ADD COLUMN IF NOT EXISTS event_type text
    CHECK (event_type IN ('game', 'training', 'video_review')),
  ADD COLUMN IF NOT EXISTS phase_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gant_assisted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS round_count integer;

COMMENT ON COLUMN public.game_feedback.gant_assisted IS
  'Internal/admin-reporting marker only. Never surfaced to players or caregivers — see .kiro/specs/gant-ai-feedback-assistant/requirements.md Requirement 6.4.';
