/**
 * Desktop admin console feature toggles (V1.8).
 *
 * Product configuration, NOT club branding — every club gets the same launch
 * feature set, so a code constant is the right home (flipping one back on is a
 * one-line change + redeploy, which is fine for launch-gating).
 *
 * See NEXT-SESSION-NOTES.md — "V1.8 — Admin console correctness pass" and the
 * "V2.8 Admin Reporting suite" deferral note.
 *
 * A flag controls BOTH the sidebar nav item (in DesktopLayout) and the route
 * registration (in routes/index.tsx), so a hidden feature can't be reached
 * even by typing its URL.
 */
export const desktopFeatures = {
  /**
   * The 6-page reporting suite. Deferred to V2.8 for the V1 launch trial —
   * built and working, just hidden. Flip back to `true` to re-enable.
   */
  reporting: false,
} as const;
