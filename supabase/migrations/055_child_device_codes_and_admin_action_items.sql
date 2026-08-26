-- Migration 055: Schema foundation for streamlined-invites-and-child-access
--
-- Spec: `.kiro/specs/streamlined-invites-and-child-access/` (Task 1)
--
-- Two new, independent tables. Both are purely additive — nothing existing
-- reads or writes them yet, so this migration has no behavioural effect on
-- its own. See design.md, "Data Models", for the full rationale.
--
-- 1. child_device_codes (Requirement 7.4)
--    The caregiver-issued, single-use device-activation code that
--    establishes a session for a child's already-existing synthetic-email
--    auth user (created today via create-auth-user's can_sign_in: false
--    path). Kept separate from invite_codes rather than extending it: a
--    device code never names a team_id or role, and never produces a
--    team_members row — overloading invite_codes would mean adding
--    columns that don't apply to every other row in that table.
--
-- 2. admin_action_items (Requirement 7.5)
--    A deliberately generic admin-review queue ("kind" + "detail" jsonb)
--    rather than a single-purpose "caregiver_removed_notifications" table,
--    since a caregiver being removed from a child's link is unlikely to be
--    the only thing that ever needs an admin's attention. The first use is
--    Requirement 7.5's "removing a caregiver notifies an admin, who
--    decides whether to revoke the child's device access" — it does not,
--    by itself, revoke anything.
--
-- RLS design notes:
-- - Both tables are written/read by service-role Edge Functions for their
--   actual application logic (redeem-device-code, the caregiver-removal
--   path) — service role bypasses RLS entirely, so these policies only
--   govern what an ordinary authenticated user can see directly.
-- - child_device_codes: a caregiver can see the codes for a child they're
--   linked to (their own audit trail — "did I already send one?"). No
--   direct authenticated INSERT/UPDATE/DELETE policy: code generation and
--   redemption both go through service-role Edge Functions, matching how
--   invite_codes redemption already works.
-- - admin_action_items: admin-only, matching the existing club_settings
--   admin-only pattern (migration 046).

CREATE TABLE IF NOT EXISTS public.child_device_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  child_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS child_device_codes_child_user_id_idx
  ON public.child_device_codes(child_user_id);

COMMENT ON TABLE public.child_device_codes IS
  'Caregiver-issued, single-use codes that establish a session for a child''s existing synthetic-email auth user. Requirement 7.4 of streamlined-invites-and-child-access. Generating a new code for a child must invalidate any prior session for that child (see design.md) — enforced in redeem-device-code, not by this schema.';

ALTER TABLE public.child_device_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "linked caregivers can view a child's device codes"
  ON public.child_device_codes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.player_caregivers
      WHERE player_caregivers.player_id = child_device_codes.child_user_id
        AND player_caregivers.caregiver_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.admin_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  team_id uuid REFERENCES public.teams(id),
  player_id uuid REFERENCES public.users(id),
  detail jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'actioned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  actioned_by uuid REFERENCES public.users(id),
  actioned_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_action_items_status_idx
  ON public.admin_action_items(status);

COMMENT ON TABLE public.admin_action_items IS
  'Generic admin-review queue. First use: kind = ''caregiver_removed_review'' (Requirement 7.5 of streamlined-invites-and-child-access) — created when a caregiver is removed from a child''s link, so an admin can decide whether to revoke the child''s device access. Never auto-actioned.';

ALTER TABLE public.admin_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage admin action items"
  ON public.admin_action_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role::text = 'admin'
    )
  );
