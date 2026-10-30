import { expect, test } from '@playwright/test';
import { openApp } from './support/app';
import { olderSundaysSeed, shortCrecheSeed } from './support/seeds';

test('flags an upcoming Sunday with a problem, and only upcoming ones', async ({ page }) => {
  const app = await openApp(page, shortCrecheSeed());
  await app.tab('Service record');
  await expect(page.locator('td[data-fl="2027-01-03"]')).toHaveText('\u2691 1');
  await expect(page.locator('td[data-fl="2026-10-04"]')).toHaveCount(0);
  await expect(app.view).toContainText('1 upcoming Sunday needs attention');
});

test('opens the Sunday from its flag, shows the problem and lets you fix it', async ({ page }) => {
  const app = await openApp(page, shortCrecheSeed());
  await app.tab('Service record');
  await page.locator('td[data-fl="2027-01-03"]').click();
  await expect(app.view).toContainText('Creche needs 1 more');

  await page.selectOption('#sa-cre', 'eve');
  await page.locator('button[data-sadd="cre"]').click();
  await expect.poll(async () => ((await app.doc('rosters/2027-01-03'))['s'] as Record<string, string[]>)['cre']).toEqual(['ann', 'eve']);
  await expect(app.view).toContainText('No issues on this Sunday.');
  await expect(page.locator('td[data-fl="2027-01-03"]')).toHaveCount(0);
  await expect(app.view).toContainText('No upcoming Sundays have problems.');
});

test('a flag can be closed again', async ({ page }) => {
  const app = await openApp(page, shortCrecheSeed());
  await app.tab('Service record');
  await page.locator('td[data-fl="2027-01-03"]').click();
  await expect(app.view).toContainText('Creche needs 1 more');
  await page.locator('.card button[data-fl="2027-01-03"]', { hasText: 'Close' }).click();
  await expect(app.view.locator('ul.warn')).toHaveCount(0);
});

test('lists a person who is serving twice, and the exclusive clash', async ({ page }) => {
  const seed = shortCrecheSeed();
  seed['rosters/2027-01-03'] = { date: '2027-01-03', s: { tea: ['ann'], cre: ['ann', 'eve'] }, gen: true, manual: true };
  const app = await openApp(page, seed);
  await app.tab('Service record');
  await page.locator('td[data-fl="2027-01-03"]').click();
  await expect(app.view).toContainText('Double-booked: Tea and Coffee + Creche');
  await expect(app.view).toContainText('Exclusive ministry clash');
});

test('highlights long runs when a threshold is set, and opens a person\u2019s history', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await app.tab('Service record');
  await page.locator('td[data-pick="ann"]').click();
  await expect(app.view.locator('.card', { hasText: 'Last served' })).toContainText('Ann');
  await app.idle();
  const threshold = page.locator('#thr');
  await threshold.fill('1');
  await threshold.blur();
  await expect(page.locator('td[data-pick="ann"] .fl')).toHaveCount(1);
});
