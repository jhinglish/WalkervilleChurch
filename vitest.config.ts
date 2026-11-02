import { defineConfig } from 'vitest/config';

// Unit tests only. The browser tests in tests/e2e are run by Playwright.
// `__DEMO_ACCOUNTS__` is true here so the tests can sign in as the demo accounts; the production build sets it to false.
export default defineConfig({
  define: { __DEMO_ACCOUNTS__: 'true' },
  test: { include: ['src/**/*.test.ts'] },
});
