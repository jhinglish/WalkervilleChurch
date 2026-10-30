import { defineConfig } from '@playwright/test';

/** Browser regression tests for the built page (dist/index.html), run against an in-memory stand-in for the claude.ai runtime. */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    viewport: { width: 1100, height: 900 },
    trace: 'retain-on-failure',
  },
});
