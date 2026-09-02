-- Migration 064: add is_coach to team_members (V1.R Part 1 -- role model fix)
--
-- Spec: NEXT-SESSION-NOTES.md "V1.R -- SCOPE LOCKED, 2026-09-01", item C
-- (Make Coach).
--
-- Context: a team's first Manager may also want to act as that team's Coach
-- on the very same team (e.g. "first thing they do after setting the team up
-- is click Make Coach"). team_members has UNIQUE(team_id, user_id) (migration
-- 021), so a second row for the same person on the same team is not possible
-- -- the existing `role` column can only ever hold ONE value per membership.
--
-- Rather than touch `role` itself, this adds a second, independent boolean
-- signal. `role` keeps its exact current meaning and existing values
-- ('player' | 'coach' | 'manager') completely untouched -- several live Edge
-- Functions (bulk-create-users, create-user, redeem-invite) still write
-- role='coach' directly, and several read paths (reporting-api.ts,
-- messaging-api.ts, usePermissions.ts) still filter on
-- role IN ('coach','manager'); none of those are changed by this patch --
-- is_coach is purely additive.
--
-- `is_coach = true` means "this member also has Coach authority on this
-- team," regardless of what `role` says. So a Manager who also coaches is
-- role='manager', is_coach=true. A plain Coach (today's only way to be a
-- coach) is unaffected: role='coach', is_coach=false. Every NEW check added
-- in this patch (RLS scoping, the role-sync trigger, roster UI) treats
-- "effectively a coach" as role IN ('coach','manager') OR is_coach = true.
--
-- Known small gap, flagged not fixed here: the three pre-existing read paths
-- named above will not (yet) recognise a role='manager', is_coach=true
-- member as a coach for their own purposes (e.g. a "message all coaches"
-- recipient list). Out of scope for this patch -- see NEXT-SESSION-NOTES.md.
--
-- Run manually in the Supabase SQL Editor.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS is_coach boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.team_members.is_coach IS
  'Additive Coach-authority flag, independent of `role`. Lets one person hold Manager (or Player) as their `role` AND Coach authority on the same team without violating UNIQUE(team_id, user_id). Does NOT replace role=''coach'', which keeps its existing meaning untouched. "Effectively a coach" for new authorization/derivation logic = role IN (''coach'',''manager'') OR is_coach = true.';
