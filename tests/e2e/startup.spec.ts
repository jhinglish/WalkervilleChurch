import { expect, test } from '@playwright/test';
import { TABS, openApp, openWithoutRuntime } from './support/app';
import { freshSeed, olderSundaysSeed } from './support/seeds';

test('asks the viewer to sign in when the claude.ai runtime is unavailable', async ({ page }) => {
  const app = await openWithoutRuntime(page);
  await expect(app.view).toContainText('Sign in to claude.ai to use the roster.');
  expect(app.errors).toEqual([]);
});

test('says nothing has been generated yet on a new database', async ({ page }) => {
  const app = await openApp(page, freshSeed());
  await expect(app.view).toContainText('No upcoming Sunday has been generated yet.');
});

test('every tab loads without errors, with and without Sundays', async ({ page }) => {
  for (const seed of [freshSeed(), olderSundaysSeed()]) {
    const app = await openApp(page, seed);
    for (const tab of TABS) {
      await app.tab(tab);
      await app.settle();
      await expect(app.view.locator('.card').first()).toBeVisible();
    }
    expect(app.errors).toEqual([]);
    await page.reload();
  }
});

test('the Serving tab shows the next Sunday with its people and verse', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await expect(app.view).toContainText('John 3:16');
  await expect(app.view).toContainText('Security/Lock Up');
  await expect(app.view).toContainText('Bob');
});
