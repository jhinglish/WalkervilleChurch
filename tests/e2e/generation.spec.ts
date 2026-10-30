import { expect, test } from '@playwright/test';
import { openApp } from './support/app';
import { freshSeed, olderSundaysSeed } from './support/seeds';

test('generates the three-month window, each Sunday filled and locked with a snapshot', async ({ page }) => {
  const app = await openApp(page, freshSeed());
  await app.tab('Roster');
  await page.locator('#gen').click();
  await expect.poll(async () => (await app.paths('rosters')).length).toBe(13);

  const paths = (await app.paths('rosters')).sort();
  expect(paths[0]).toBe('rosters/2027-01-03');
  expect(paths.at(-1)).toBe('rosters/2027-03-28');

  const first = await app.doc('rosters/2027-01-03');
  expect(first['gen']).toBe(true);
  expect(first['meta']).toBeDefined();
  const s = first['s'] as Record<string, string[]>;
  expect(s['sec']).toHaveLength(1);
  expect(s['wel']).toHaveLength(1);
  expect(s['tea']).toHaveLength(2);
  expect(s['cre']).toHaveLength(2);
  await expect.poll(async () => (await app.history()).some((m) => m.startsWith('Generated 13 Sunday(s):'))).toBe(true);
});

test('never overwrites a Sunday that already exists', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  const before = { a: (await app.doc('rosters/2027-01-03'))['s'], b: (await app.doc('rosters/2027-01-10'))['s'] };
  await app.tab('Roster');
  await page.locator('#gen').click();
  await expect.poll(async () => (await app.paths('rosters')).length).toBe(13);
  expect((await app.doc('rosters/2027-01-03'))['s']).toEqual(before.a);
  expect((await app.doc('rosters/2027-01-10'))['s']).toEqual(before.b);
});

test('does not create a Sunday that someone else created in the meantime', async ({ page }) => {
  const app = await openApp(page, freshSeed());
  await app.tab('Roster');
  await app.mute();
  await app.elsewhere('rosters/2027-01-03', { date: '2027-01-03', s: { wel: ['gus'] }, gen: true, manual: true });
  await page.locator('#gen').click();
  await expect.poll(async () => (await app.paths('rosters')).length).toBe(13);
  expect((await app.doc('rosters/2027-01-03'))['s']).toEqual({ wel: ['gus'] });
});

test('regenerating one Sunday keeps its note and verse and clears the edited flag', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await app.tab('Roster');
  await page.locator('[data-regen="2027-01-03"]').click();
  await expect(page.locator('[data-regen="2027-01-03"]')).toHaveText('Confirm: replace this Sunday');
  await page.locator('[data-regen="2027-01-03"]').click();
  await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['meta']).toBeDefined();

  const doc = await app.doc('rosters/2027-01-03');
  expect(doc['note']).toBe('Welcome new family');
  expect(doc['verse']).toBe('John 3:16');
  expect(doc['manual']).toBe(false);
  expect(Object.keys(doc['s'] as object)).not.toContain('com');
});

test('the first click on Regenerate only asks for confirmation', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await app.tab('Roster');
  const before = (await app.doc('rosters/2027-01-10'))['s'];
  await page.locator('[data-regen="2027-01-10"]').click();
  await app.settle();
  expect((await app.doc('rosters/2027-01-10'))['s']).toEqual(before);
});
