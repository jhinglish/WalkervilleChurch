import { expect, test } from '@playwright/test';
import { openApp } from './support/app';
import { freshSeed, olderSundaysSeed } from './support/seeds';

const hostile = '<img src=x onerror="window.__pwned=true">';

test('names and notes containing HTML are shown as text, never run', async ({ page }) => {
  const app = await openApp(page, freshSeed());
  await app.tab('Admin');
  await page.fill('#pn', hostile);
  await page.locator('#padd').click();
  await expect.poll(async () => (await app.paths('people')).length).toBe(12);
  await app.settle();

  await expect(page.locator('#v img')).toHaveCount(0);
  const values = await page.locator('input[data-pf="name"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(values).toContain(hostile);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
  expect(app.errors).toEqual([]);
});

test('an away note and a Sunday note containing HTML are escaped', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await page.locator('textarea[data-note]').fill(hostile);
  await page.locator('[data-nsave]').click();
  await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['note']).toBe(hostile);
  await app.tab('Away');
  await page.fill('#af', '2027-02-07');
  await page.fill('#an', hostile);
  await page.locator('#aadd').click();
  await expect.poll(async () => (await app.paths('away')).length).toBe(2);
  await app.tab('Service record');
  await app.settle();

  await expect(page.locator('#v img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
});
