-- Migration 071: gant_guardrails — the admin-editable steering document
--
-- Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 1.3)
-- Requirements 9 (admin-editable, from the desktop), 13.3 (club-agnostic:
-- guardrails are data, not code).
--
-- WHAT THIS IS
-- The phases-of-play list, feedback model, tone guide, and continuity
-- language (Req 4.9) Gant's system prompt is built from. Editing this row
-- changes Gant's behaviour immediately, on the next request — no redeploy,
-- no app rebuild, no store review (Req 9.2). Single-row pattern, mirroring
-- `club_settings` (migration 046): PK is a boolean fixed to true, so at most
-- one row can ever exist.
--
-- SEEDING
-- Seeded here from docs/project/GANT-PLACEHOLDER-GUARDRAILS.md — a
-- research-grounded starting draft (Hattie & Timperley's feedback model, the
-- FA's England DNA phase framework, PCA's mastery language), NOT yet
-- reviewed by coaches. This is deliberate (Task 0, decided 2026-09-03):
-- rather than waiting for a coach workshop before any content exists, the
-- plan is to demo Gant working live to coaches on this placeholder and
-- refine it against real usage. Expect this row's content to be rewritten,
-- not just tweaked, once that happens.
--
-- RLS: any authenticated coach/admin may read (needed by the Edge Function
-- and by anyone using Gant); only admins may write — same pattern as
-- `club_settings`.
--
-- Run manually in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.gant_guardrails (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true), -- enforces a single row
  phases_of_play jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback_model text NOT NULL DEFAULT '',
  tone_guide text NOT NULL DEFAULT '',
  continuity_language text NOT NULL DEFAULT '',
  system_prompt_override text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gant_guardrails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches and admins can read guardrails" ON public.gant_guardrails;
CREATE POLICY "Coaches and admins can read guardrails"
  ON public.gant_guardrails
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role::text IN ('admin', 'coach')
    )
    OR EXISTS (
      -- A Manager holding coach authority on some team (is_coach) also
      -- needs to read this — same "coach authority" rule used throughout
      -- this spec (tabsForRole's showCoaching in main-layout-logic.ts).
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.is_coach = true
    )
  );

DROP POLICY IF EXISTS "Admins manage guardrails" ON public.gant_guardrails;
CREATE POLICY "Admins manage guardrails"
  ON public.gant_guardrails
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

-- Seed the single row with the placeholder draft (docs/project/GANT-PLACEHOLDER-GUARDRAILS.md).
-- phases_of_play is a jsonb array of { band, phases: [{ name, definition }] }
-- so the age-banded structure (younger vs older groups) survives as data.
INSERT INTO public.gant_guardrails (id, phases_of_play, feedback_model, tone_guide, continuity_language)
VALUES (
  true,
  '[
    {
      "band": "younger (U7-U10, placeholder)",
      "phases": [
        {"name": "In possession", "definition": "Our team/player has the ball. Covers first touch, dribbling, passing, and decision-making on the ball."},
        {"name": "Out of possession", "definition": "The other team has the ball. Covers positioning, pressure, and defending 1v1."},
        {"name": "Transition", "definition": "The moment possession changes, either way. Covers the immediate reaction to winning or losing the ball."}
      ]
    },
    {
      "band": "older (U11+, placeholder)",
      "phases": [
        {"name": "Build-up play", "definition": "Starting play from the back, under low pressure."},
        {"name": "Progressing through midfield", "definition": "Moving the ball forward against organised opposition."},
        {"name": "Final third / creating and finishing", "definition": "The last actions before a shot or goal-scoring opportunity."},
        {"name": "Defensive shape / pressing", "definition": "How the team organises without the ball."},
        {"name": "Transition to attack", "definition": "The moment of winning the ball back and turning it into an attacking opportunity."},
        {"name": "Transition to defence", "definition": "The moment of losing the ball and reorganising."},
        {"name": "Set pieces", "definition": "Attacking and defending throw-ins, free kicks, and corners."}
      ]
    }
  ]'::jsonb,
  'Every piece of feedback should name what the player did well or worked on, tie it to a specific phase of play, and — where there is a genuine next step — say what to try next time. If the observation is entirely positive, it is fine to leave it there; do not manufacture a work-on to force a "sandwich" shape. Team feedback and individual feedback follow the same shape, just scoped differently.',
  'Preferred language: developing, an area to keep building on, next step is, working on. Describe what TO do rather than only what not to do (e.g. "keep your head up" rather than "don''t look down"). Frame around effort and improvement, not fixed ability. Avoid: weakness, failed to, never, always, and any comparison to a specific teammate, sibling, or other named player. Never comment on body or fitness level except where directly tied to footballing behaviour. Scale directness to age: younger players (U7-U10) get simple, warm framing with a work-on presented as something exciting to try next; older players (U11-U15) get clear, specific, still effort-framed language; teens/Open (U16+) can be direct while staying respectful and development-focused. Do not force a compliment-sandwich structure — evidence does not support it, and it reads as insincere, especially to young athletes.',
  'When a player''s recent history (last 4 approved notes) is genuinely relevant, reference it naturally rather than treating every note as isolated — but only when relevant, not as a habitual opener. Example shapes: recurring/no change yet — "This is something we''ve touched on before, [specific point] is still one to keep building on"; improved — "Good to see progress here, [specific point] looked better than it has in recent sessions"; regressed/slipped back — "This came up as a strength recently, so worth keeping an eye on, [specific point] wasn''t quite there today"; genuinely new — no continuity language at all, just the standard feedback model.'
)
ON CONFLICT (id) DO NOTHING;
