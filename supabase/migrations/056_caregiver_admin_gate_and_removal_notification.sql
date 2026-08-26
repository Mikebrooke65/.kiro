-- Migration 056: Admin-only gate on additional caregivers + removal notification
--
-- Spec: `.kiro/specs/streamlined-invites-and-child-access/` (Task 9,
-- Requirement 7.5)
--
-- Two independent, additive changes:
--
-- 1. Admin-only gate on a SECOND-OR-LATER caregiver for a child. A child's
--    first caregiver is added via the normal Add Player / caregiver-invite
--    flow (unaffected — a Coach/Manager still creates that one exactly as
--    today). Any caregiver beyond the first must be added by a club admin
--    (requirements.md Section 7.5).
--
--    There are two distinct write paths that attach a caregiver to a child,
--    and both need this gate — a client-side check alone would only cover
--    the UI, not someone calling either path directly:
--      a. `invite_codes` INSERT with intended_role = 'caregiver' — for a
--         caregiver who doesn't have an account yet. Gate added directly to
--         the existing "Allow coaches and managers to create invite codes
--         for their teams" policy (migration 036) via ALTER POLICY, so the
--         policy keeps its name and history; only its WITH CHECK expression
--         changes.
--      b. The `link-player-caregiver` Edge Function — for a caregiver who
--         already has an account (used today by `caregiversApi.addJunior`'s
--         existing-user branch, always a brand-new child with zero existing
--         caregivers today, so this gate has no effect on that call site).
--         Gated in the function body itself (service role bypasses RLS, so
--         this can't be enforced at the DB layer for that path) — see that
--         file's own diff for the added check.
--
--    "Second or later" is judged on the CURRENT count of linked caregivers
--    at the moment of the write, not a historical "was there ever a first"
--    count — so a child whose caregiver count has dropped back to zero
--    (e.g. after an admin's removal-driven revocation) can have a new first
--    caregiver added by a Coach/Manager again, consistent with equal-rights
--    (Section 7.5) never distinguishing "the original" caregiver from any
--    other.
--
-- 2. Caregiver-removed admin notification (Requirement 7.5's last bullet).
--    A `BEFORE`-style side effect isn't needed — nothing here can affect
--    the DELETE itself succeeding or not — so this is a plain AFTER DELETE
--    trigger on `player_caregivers` that inserts one `admin_action_items`
--    row per removal, kind = 'caregiver_removed_review'. `SECURITY DEFINER`
--    so the insert succeeds regardless of who performed the delete (today
--    that's always a club admin per the existing admin-only RLS on
--    `player_caregivers` writes — migrations 002 and 036 — but this stays
--    correct if a future service-role path ever deletes a link too).
--    Deliberately does NOT revoke the child's device access itself
--    (Correctness Property 5, design.md) — only flags it for an admin to
--    decide on, via the new admin screen (Task 9) calling the new
--    `revoke-child-device-access` Edge Function.

-- ---------------------------------------------------------------------------
-- 1a. invite_codes: admin-only for a second-or-later caregiver invite
-- ---------------------------------------------------------------------------

ALTER POLICY "Allow coaches and managers to create invite codes for their teams"
  ON public.invite_codes
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = invite_codes.team_id
          AND team_members.user_id = auth.uid()
          AND team_members.role IN ('coach', 'manager')
      )
      -- The one added restriction: a Coach/Manager may create every invite
      -- type as before, EXCEPT a caregiver invite for a child that already
      -- has at least one linked caregiver. Every other row this policy used
      -- to allow (any non-caregiver invite, or a caregiver invite for a
      -- child with none yet) is completely unaffected.
      AND NOT (
        invite_codes.intended_role = 'caregiver'
        AND invite_codes.subject_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.player_caregivers
          WHERE player_caregivers.player_id = invite_codes.subject_user_id
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. admin_action_items: notify on caregiver removal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_caregiver_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
BEGIN
  -- Best-effort: one team this child plays on, purely so the admin screen
  -- can show/filter by team. Nullable on the table already — a child with
  -- no resolvable team membership (shouldn't normally happen) still gets a
  -- notification, just without a team_id.
  SELECT team_id INTO v_team_id
  FROM public.team_members
  WHERE user_id = OLD.player_id
  LIMIT 1;

  INSERT INTO public.admin_action_items (kind, team_id, player_id, detail)
  VALUES (
    'caregiver_removed_review',
    v_team_id,
    OLD.player_id,
    jsonb_build_object(
      'removed_caregiver_id', OLD.caregiver_id,
      'removed_by', auth.uid(),
      'removed_at', now()
    )
  );

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.handle_caregiver_removed() IS
  'Requirement 7.5 (streamlined-invites-and-child-access): removing a caregiver from a child does not itself revoke the child''s device access — it only queues an admin_action_items row (kind = caregiver_removed_review) so a club admin can decide.';

DROP TRIGGER IF EXISTS on_player_caregiver_removed ON public.player_caregivers;
CREATE TRIGGER on_player_caregiver_removed
  AFTER DELETE ON public.player_caregivers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_caregiver_removed();
