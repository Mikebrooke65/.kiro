-- Migration 074: a resolver can read back their own gant_outcomes row
--
-- Found live 2026-09-03: a coach ticking/discarding a Progress Notes entry
-- got "new row violates row-level security policy for table gant_outcomes"
-- (42501) even though the row was genuinely being inserted successfully.
--
-- ROOT CAUSE: `gant-api.ts`'s approve()/discard() call `ApiClient.insert()`,
-- which always does `.insert(record).select().single()` to return the
-- created row to the caller. Postgres RLS requires an INSERT ... RETURNING
-- to also satisfy the table's SELECT policy for the newly-inserted row —
-- if no SELECT policy matches, Postgres raises exactly this "new row
-- violates row-level security policy" error, even though the INSERT's own
-- WITH CHECK passed. Migration 072 only granted SELECT to admins
-- ("Admins can read gant outcomes"), so any non-admin coach/manager
-- resolving an entry hit this every time.
--
-- FIX: an additive SELECT policy letting a resolver read back only the
-- outcome rows THEY logged (`resolved_by = auth.uid()`) — harmless (it's
-- just their own audit trail, not anyone else's) and unblocks the
-- insert-then-return pattern used consistently across this codebase's API
-- layer. The existing admin-wide read policy is untouched.
--
-- Run manually in the Supabase SQL Editor.

DROP POLICY IF EXISTS "Resolvers can read their own outcomes" ON public.gant_outcomes;
CREATE POLICY "Resolvers can read their own outcomes"
  ON public.gant_outcomes
  FOR SELECT
  TO authenticated
  USING (resolved_by = auth.uid());
