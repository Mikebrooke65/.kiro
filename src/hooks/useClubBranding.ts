import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Club branding sourced from the single-row `club_settings` table.
 *
 * Every field is nullable on purpose (Requirement 1.7 / design "Branding
 * sourcing"): where a branding value is absent, consumers omit the dependent
 * UI element rather than substituting a hardcoded default. NO club name,
 * colour, logo, or URL is ever hardcoded on the client — it all flows from
 * `club_settings` through this hook.
 */
export interface ClubBranding {
  club_name: string | null;
  primary_color: string | null;
  logo_url: string | null;
  app_url: string | null;
}

/**
 * Empty branding: all fields null so that, before the row loads or if it is
 * absent/errors, consumers render nothing branded rather than a placeholder.
 */
const EMPTY_BRANDING: ClubBranding = {
  club_name: null,
  primary_color: null,
  logo_url: null,
  app_url: null,
};

export interface UseClubBrandingResult {
  branding: ClubBranding;
  loading: boolean;
  error: string | null;
}

/**
 * Reads the single-row `club_settings` table (migration 046) and exposes the
 * club's branding to the UI.
 *
 * Consumers (e.g. the Success Screen and Team Page) read individual fields and
 * omit any element whose value is null — see Requirements 1.9-1.11. While the
 * row is loading, or if it is missing or the query fails, all fields are null,
 * so nothing branded is shown and no default is invented.
 */
export function useClubBranding(): UseClubBrandingResult {
  const [branding, setBranding] = useState<ClubBranding>(EMPTY_BRANDING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // Single-row table: at most one row exists (PK fixed to true).
      // maybeSingle() returns null (not an error) when the row is absent.
      const { data, error: queryError } = await supabase
        .from('club_settings')
        .select('club_name, primary_color, logo_url, app_url')
        .maybeSingle();

      if (cancelled) return;

      if (queryError) {
        // On failure, keep branding empty so no hardcoded default leaks through.
        setBranding(EMPTY_BRANDING);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      setBranding({
        club_name: data?.club_name ?? null,
        primary_color: data?.primary_color ?? null,
        logo_url: data?.logo_url ?? null,
        app_url: data?.app_url ?? null,
      });
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { branding, loading, error };
}
