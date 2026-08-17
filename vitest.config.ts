import { defineConfig } from 'vitest/config';

/**
 * Vitest config, kept separate from vite.config.ts so the React and Tailwind
 * plugins are not loaded for tests. The suites added by the
 * lite-user-registration-fix spec test pure decision logic only, so they run in
 * a plain node environment with no DOM.
 *
 * ALWAYS run with `npm test` (`vitest --run`). Never watch mode.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Predates vitest: a manual helper module that exports a function and
      // contains no test cases. It imports src/lib/supabase.ts, which needs
      // Vite's import.meta.env at module load, so it cannot be collected here.
      // Left untouched rather than rewritten — it is outside this spec's scope.
      'src/lib/__tests__/supabase-connection.test.ts',
    ],
    reporters: ['default'],
  },
});
