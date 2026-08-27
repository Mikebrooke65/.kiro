-- Migration 058: Consent-timeout auto-dropoff for add-a-junior requests
--
-- Spec: `.kiro/specs/streamlined-invites-and-child-access/` (Task 11,
-- Requirement 8.4)
--
-- requirements.md Section 8.4: while a child's caregiver consent is
-- outstanding, the child shows on the Manager's team list as "pending"
-- (already shipped — see `getRosterEntries` in `src/pages/TeamPage.tsx`,
-- which queries `caregiver_approvals` for `request_kind = 'add_child' AND
-- status = 'pending'` and appends those children to the roster with
-- `pending: true`, ahead of any `team_members` row existing for them). If
-- consent still hasn't come after a set period, the record is meant to
-- automatically drop off that list. The period was left open in
-- requirements.md ("proposed 2 months, possibly shorter, needs a final
-- call") and has now been decided: **30 days**.
--
-- How the drop-off actually happens: nothing needs to change in
-- TeamPage.tsx's query. It only ever surfaces rows where
-- `caregiver_approvals.status = 'pending'` — so the moment this job flips a
-- stale row's status away from 'pending', that child stops being returned
-- by that query and disappears from the team list on its own. No new UI
-- (matches design.md: "the Manager already sees the pending state today...
-- no new UI needed for the 'shows as pending' half of 8.4, only the
-- auto-expiry job itself is new").
--
-- What status to flip it to: the `caregiver_approvals.status` CHECK
-- constraint (migration 036) only allows
-- 'pending' | 'approved' | 'denied' | 'escalated' — there's no 'expired'
-- value, and adding one would mean widening that constraint plus touching
-- every place that already branches on status. "Consent never arrived in
-- time" is, functionally, a denial, so this reuses 'denied' and mirrors the
-- `respond-junior-approval` Edge Function's exact deny outcome: status ->
-- 'denied', responded_at set, child's `users.active` -> false (see that
-- function's `outcomeFor()` — deny already means `{ status: 'denied',
-- childActive: false }`). `responded_by` is deliberately left NULL (no
-- human responded) so this is distinguishable later from a caregiver's own
-- explicit decline. Not a hard delete — consistent with the data-retention
-- scoping already underway separately (`docs/data-retention-scoping.md`,
-- Decision 3c) rather than pre-empting it here.
--
-- Threshold storage: kept as a plain named constant inside the function
-- body (`threshold_days`), not a new settings-table row. This project
-- already has exactly this pattern for a similar "auto-expire after N
-- days" rule — see migration 009's announcement `expires_at` trigger, which
-- hardcodes `INTERVAL '7 days'` with a comment rather than a config table.
-- The one candidate table for a config value, `club_settings` (migration
-- 046), is a fixed single-row branding table (club_name/primary_color/
-- logo_url/app_url) — not a general key/value settings store — so bending
-- it to hold one unrelated number would be more schema churn than this
-- single value warrants. If a real settings mechanism gets built later for
-- other reasons, this constant is the one line to move.
--
-- Scheduling: runs daily via `pg_cron` (new to this project — not used
-- anywhere else in the codebase today). If `CREATE EXTENSION pg_cron` below
-- fails with a permissions error, enable it first via the Supabase
-- Dashboard: Database -> Extensions -> search "pg_cron" -> Enable, then
-- re-run this migration.

-- ---------------------------------------------------------------------------
-- 1. expire_stale_child_consents(): the actual auto-dropoff logic.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_stale_child_consents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Requirement 8.4's threshold, decided 2026-08-27: 30 days. This is the
  -- one line to change if that number is ever revisited.
  threshold_days CONSTANT int := 30;
BEGIN
  -- Single statement: deny every stale pending add-a-junior request, and in
  -- the same pass deactivate each affected child. Scoped tightly
  -- (request_kind + status + age) so re-running this function (e.g. two
  -- overlapping cron ticks) is a no-op the second time — nothing still
  -- matches `status = 'pending'` once the first run has flipped it.
  WITH expired AS (
    UPDATE public.caregiver_approvals
    SET status = 'denied',
        responded_at = now()
    WHERE request_kind = 'add_child'
      AND status = 'pending'
      AND created_at < now() - (threshold_days || ' days')::interval
    RETURNING player_id
  )
  UPDATE public.users
  SET active = false
  WHERE id IN (SELECT player_id FROM expired);
  -- Note: in the normal case this second UPDATE affects zero rows, because
  -- a still-pending add-a-junior child is created inactive to begin with
  -- and only ever flips to active on approval (see `applyConsentDecision`
  -- in src/lib/add-junior-logic.ts). It's included anyway so this function
  -- is correct on its own terms rather than relying on that always having
  -- been true.
END;
$$;

-- This is a maintenance function meant to be invoked only by the cron
-- schedule below (which runs as the role that owns the job, i.e. whoever
-- runs this migration in the SQL Editor — typically `postgres`), not by
-- app users. Supabase/PostgREST exposes every public-schema function as an
-- RPC endpoint by default, so without this, any authenticated user could
-- call it directly and force other users' pending consent requests to
-- expire early. Revoke the default PUBLIC execute grant to close that off.
REVOKE EXECUTE ON FUNCTION public.expire_stale_child_consents() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Schedule it to run daily via pg_cron.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent: unschedule any existing job of this name first, so re-running
-- this migration (or a future migration that changes the schedule) doesn't
-- error or leave duplicate jobs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-child-consents') THEN
    PERFORM cron.unschedule('expire-stale-child-consents');
  END IF;
END $$;

-- Daily at 03:00 UTC — comfortably outside any club's typical evening
-- training/game hours in any timezone this club operates in, and no
-- particular time-of-day sensitivity is called for by 8.4 beyond "daily".
SELECT cron.schedule(
  'expire-stale-child-consents',
  '0 3 * * *',
  $$SELECT public.expire_stale_child_consents();$$
);
