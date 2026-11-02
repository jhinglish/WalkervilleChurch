/**
 * Build-time constants, substituted by esbuild's `define` option (scripts/build.mjs) and by Vitest (vitest.config.ts).
 *
 * This file has no imports or exports on purpose, so its declarations are global.
 */

/**
 * True only in the browser-test build (`npm run build:e2e`) and in the unit tests. The production build sets it to
 * false, which removes the demo accounts from the published page (see MOCK_USERS in auth.ts).
 */
declare const __DEMO_ACCOUNTS__: boolean;
