import { expect, test } from '@playwright/test';
import { openApp } from './support/app';
import { olderSundaysSeed } from './support/seeds';

test('locks Sundays that predate snapshots once, without changing who is assigned', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['meta']).toBeDefined();
  await expect.poll(async () => (await app.doc('rosters/2027-01-10'))['meta']).toBeDefined();

  expect((await app.doc('rosters/2027-01-03'))['s']).toEqual(olderSundaysSeed()['rosters/2027-01-03']?.['s']);
  expect((await app.doc('rosters/2027-01-10'))['s']).toEqual(olderSundaysSeed()['rosters/2027-01-10']?.['s']);
  await app.settle();
  expect((await app.history()).filter((m) => m.startsWith('Locked '))).toEqual([
    'Locked 2 existing Sunday(s) to their current ministry and people settings',
  ]);
});

test('a viewer who cannot write changes nothing', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed(), { canWrite: false });
  await app.tab('Roster');
  await app.settle();
  expect(await app.writes()).toEqual([]);
  expect((await app.doc('rosters/2027-01-03'))['meta']).toBeUndefined();
  expect(app.errors).toEqual([]);
});

test('renaming a ministry does not change how an existing Sunday looks', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['meta']).toBeDefined();
  await app.tab('Admin');
  const label = page.locator('input[data-mf="l"][data-mk="wel"]');
  await label.fill('Greeters');
  await label.blur();
  await expect(label).toHaveValue('Greeters');
  await expect.poll(async () => JSON.stringify((await app.doc('config/main'))['ministries'])).toContain('Greeters');

  await app.tab('Roster');
  await expect(app.card('2027-01-03')).toContainText('Welcoming');
  await expect(app.card('2027-01-03')).not.toContainText('Greeters');
});

test('removing a ministry keeps it, with its people, on Sundays that used it', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['meta']).toBeDefined();
  await app.tab('Admin');
  await page.locator('[data-mrm="sec"]').click();
  await page.locator('[data-mrm="sec"]').click();
  await expect
    .poll(async () => ((await app.doc('config/main'))['ministries'] as { k: string; gone?: boolean }[]).find((m) => m.k === 'sec')?.gone)
    .toBe(true);

  await app.tab('Roster');
  const card = app.card('2027-01-03');
  await expect(card).toContainText('Security/Lock Up');
  await expect(card).toContainText('Bob');
  await expect(card).toContainText('Communion Prep');
  await expect(card).toContainText('Gus');
});

test('changing someone\u2019s eligibility later does not flag an existing Sunday', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['meta']).toBeDefined();
  await app.tab('Admin');
  await page.locator('input[data-pe="sec"][data-pid="bob"]').uncheck();
  await expect.poll(async () => ((await app.doc('people/bob'))['elig'] as string[]).includes('sec')).toBe(false);

  await app.tab('Roster');
  await expect(app.chip('2027-01-03', 'sec')).toHaveText('Bob');
  await expect(app.chip('2027-01-03', 'sec')).not.toHaveClass(/bad/);
});

test('a person renamed later keeps their old name on Sundays that were already generated', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['meta']).toBeDefined();
  await app.tab('Admin');
  const name = page.locator('input[data-pf="name"][data-pid="ann"]');
  await name.fill('Annie');
  await name.blur();
  await expect.poll(async () => (await app.doc('people/ann'))['name']).toBe('Annie');

  await app.tab('Roster');
  await expect(app.chip('2027-01-03', 'wel')).toHaveText('Ann');
});
