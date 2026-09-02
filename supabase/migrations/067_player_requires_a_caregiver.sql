-- Migration 067: a Junior player must always retain at least one caregiver
--
-- Spec: NEXT-SESSION-NOTES.md "V1.R" item E.
--
-- Nothing in the schema currently stops a caregiver link from being deleted
-- down to zero for a player under 16. Migration 062 deliberately widened who
-- may delete a player_caregivers row (self-removal, for a 16+ linked
-- person), and an admin/Coach/Manager has always been able to remove one via
-- the roster UI (caregiversApi.unlinkCaregiverFromPlayer, wired to
-- TeamPage.tsx's handleRemoveCaregiver). Neither path checks whether it's
-- removing that child's LAST caregiver.
--
-- This adds a BEFORE DELETE trigger enforcing the invariant: deleting a
-- player_caregivers row is blocked if (a) the linked player is under 16
-- (a NULL date_of_birth is treated as "unknown, protect it" -- the same
-- fail-safe direction as every other age check in this app, which routes an
-- unknown DOB to the Junior path) AND (b) this would be that player's last
-- remaining caregiver link. An Adult player (16+, matching
-- ADULT_AGE_THRESHOLD in add-player-logic.ts / roster-logic.ts /
-- redeem-invite's isAdult, and the exact boundary migration 062 already uses)
-- is unaffected -- adults are not required to have a caregiver at all, and
-- migration 062's self-removal path only ever applies to a 16+ player
-- removing their own caregiver, so it can never hit this block.
--
-- This does not change any existing removal flow's happy path: a child with
-- two or more caregivers can still have one removed; only dropping to zero
-- on an under-16 player is newly blocked. A replacement caregiver must be
-- added first, then the old one removed.
--
-- Run manually in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.enforce_player_has_a_caregiver()
RETURNS trigger AS $$
DECLARE
  player_dob date;
  is_adult boolean;
  remaining_links integer;
BEGIN
  SELECT date_of_birth INTO player_dob
  FROM public.users
  WHERE id = OLD.player_id;

  is_adult := player_dob IS NOT NULL AND player_dob <= (CURRENT_DATE - INTERVAL '16 years');

  IF is_adult THEN
    RETURN OLD;
  END IF;

  SELECT count(*) INTO remaining_links
  FROM public.player_caregivers
  WHERE player_id = OLD.player_id
    AND id <> OLD.id;

  IF remaining_links = 0 THEN
    RAISE EXCEPTION 'player_requires_a_caregiver'
      USING HINT = 'This is the child''s only caregiver. Add a replacement caregiver before removing this one.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS player_caregivers_require_one ON public.player_caregivers;
CREATE TRIGGER player_caregivers_require_one
  BEFORE DELETE ON public.player_caregivers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_player_has_a_caregiver();
