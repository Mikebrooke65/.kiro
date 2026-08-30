-- Migration 062: a player 16 or older may remove their own caregiver link(s)
--
-- Spec: `.kiro/specs/streamlined-invites-and-child-access/` Task 12 item 4
-- follow-up (found live-testing Section 6.2 — "Child ticked, actually an
-- Adult" — 2026-08-30).
--
-- That section tried to detect, at invite-redemption time, when a Child-
-- ticked registration's declared date of birth actually belonged to an
-- adult, and convert the redeemer into the player in place. Live-testing
-- found that broken for a genuinely separate caregiver (as opposed to a
-- 16-17 year old who put their own email in as "the caregiver" for
-- themselves): the two cases are indistinguishable from the submitted form
-- data alone, so guessing wrong produced a player record built from the
-- caregiver's own name/email but the child's date of birth.
--
-- Resolution (product decision, 2026-08-30): stop guessing at redemption
-- time. A Child-ticked registration always proceeds as an ordinary pending
-- child, whatever date of birth was entered — nothing wrong with a 16+
-- person still being caregiver-linked, if that's how they came into the
-- system. Instead, once that person has their own login (via device-code
-- access), THEY get a self-service way to end the arrangement whenever
-- they choose — see `roster-logic.ts`'s `canSelfRemoveCaregiver` and
-- `RemoveMyCaregiverModal.tsx`. This migration is the data-layer half:
-- without it, the client-side `unlinkCaregiverFromPlayer` call the modal
-- makes would be rejected by RLS (previously admin-only — migrations
-- 036/057's "Allow admins to manage player_caregivers" FOR ALL policy).
--
-- Additive, not a replacement: Postgres OR's multiple policies of the same
-- command together, so this only WIDENS who may delete a `player_caregivers`
-- row — the existing admin-only path (migration 057) is completely
-- unaffected. `date_of_birth <= (CURRENT_DATE - INTERVAL '16 years')`
-- matches every other 16-year adult/child boundary in this app
-- (`add-player-logic.ts`'s `ADULT_AGE_THRESHOLD`, `roster-logic.ts`'s
-- `deriveAgeBandForPerson`, `redeem-invite/logic.ts`'s `isAdult`) — turning
-- 16 exactly today already counts as eligible, not just "born before this
-- calendar year 16 years ago."
--
-- No change needed to migration 056's removal-notification trigger: it
-- already fires on ANY `player_caregivers` DELETE regardless of who
-- performed it (`SECURITY DEFINER`, records `removed_by: auth.uid()`), so a
-- self-removal queues the exact same `admin_action_items` review row an
-- admin-initiated removal does today.

CREATE POLICY "Players 16 or older can remove their own caregiver"
  ON public.player_caregivers
  FOR DELETE
  TO authenticated
  USING (
    player_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.date_of_birth IS NOT NULL
        AND users.date_of_birth <= (CURRENT_DATE - INTERVAL '16 years')
    )
  );
