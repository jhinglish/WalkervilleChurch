import { defineConfig } from 'vitest/config';

// Unit tests only. The browser tests in tests/e2e are run by Playwright.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
