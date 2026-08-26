-- Migration 057: Restore policies that never actually applied live
--
-- Follow-up to migration 056's discovery that the coach/manager
-- `invite_codes` INSERT policy was missing on the live database despite
-- being in migration 036's file. That prompted a full audit: every
-- CREATE POLICY across all 60 migration files, cross-checked against
-- `pg_policies` on the live project (pikrxkxpizdezazlwxhb), 2026-08-26.
--
-- Of 123 expected policies, 16 initially showed as "missing". Investigating
-- each individually found:
--   - 10 were false positives: the owning table was DROPPED and RECREATED
--     by a later migration (009 for announcements, 022 for game_feedback/
--     games, 010 for lessons/sessions), which naturally replaced the old
--     policy names with new ones that already exist live. Not gaps.
--   - 6 were false positives from the audit query itself: the Storage
--     policies on `objects` (migrations 008, 009) live in the `storage`
--     schema, not `public` -- the audit only checked `public`, so these
--     need (and got) a separate schema='storage' check before being ruled
--     out.
--   - 4 are real: two on `player_caregivers` (migration 036) and two on
--     `users` (migration 004) never actually applied live, the same
--     failure pattern as the `invite_codes` policy migration 056 already
--     fixed. Restored here verbatim (DROP POLICY IF EXISTS + CREATE
--     POLICY, idempotent), each exactly matching its origin migration's
--     definition -- no behavior change from what was always intended,
--     just actually applying it.
--
-- Of the two `users` gaps, "users_update_own" is the significant one: it's
-- what lets an authenticated user update their own profile row at all.
-- Its absence means no user could edit their own name/phone/etc. via the
-- app's normal client-side path. Worth an empirical check (edit your own
-- profile) after this runs.

-- ---------------------------------------------------------------------------
-- player_caregivers (migration 036)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow authenticated users to read player_caregivers"
  ON public.player_caregivers;

CREATE POLICY "Allow authenticated users to read player_caregivers"
  ON public.player_caregivers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admins to manage player_caregivers"
  ON public.player_caregivers;

CREATE POLICY "Allow admins to manage player_caregivers"
  ON public.player_caregivers FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role::text = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- users (migration 004)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_update_own" ON public.users;

CREATE POLICY "users_update_own"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        -- Prevent role changes by checking the role hasn't changed
        AND (
            role = (SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1)
            OR role IS NULL
        )
    );

DROP POLICY IF EXISTS "service_role_delete" ON public.users;

CREATE POLICY "service_role_delete"
    ON public.users FOR DELETE
    TO service_role
    USING (true);
