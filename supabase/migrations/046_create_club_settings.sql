-- Migration 046: Create the single-row club_settings branding table
--
-- Spec: .kiro/specs/post-registration-welcome-and-team-page/ (task 1.1)
-- Requirement 1.7: the client must source all club branding (name, colour,
-- logo, application URL) from useClubBranding() / club_settings and never from
-- hardcoded literals. This table is the single source of truth that hook reads.
--
-- Design ("club_settings (new — minimal branding source)"): a single-row table
-- whose primary key is a boolean fixed to true, so at most one settings row can
-- ever exist. Every branding column is nullable so that where a value is absent
-- the UI omits the dependent element (Req 1.9-1.11) rather than substituting a
-- hardcoded default.
--
-- RLS:
-- 1. Any authenticated user may READ the branding (needed to render the success
--    screen and team page).
-- 2. Only club admins (users.role = 'admin') may INSERT/UPDATE/DELETE it.
-- There is no anon access; branding is only shown to authenticated users.

CREATE TABLE IF NOT EXISTS public.club_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true), -- enforces a single row
  club_name text,
  primary_color text,
  logo_url text,
  app_url text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone authenticated can read club settings"
  ON public.club_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admins manage club settings"
  ON public.club_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role::text = 'admin'
    )
  );
