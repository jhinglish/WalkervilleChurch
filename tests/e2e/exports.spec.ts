import { expect, test } from '@playwright/test';
import { openApp } from './support/app';
import { olderSundaysSeed } from './support/seeds';

test('exports a PDF of the next Sunday with the verse and note', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await page.locator('#pdf').click();
  await expect.poll(async () => (await app.saves()).map((s) => s.filename)).toEqual(['serving-2027-01-03.pdf']);

  const drawn = (await app.pdfOps()).filter((op) => op[0] === 'text').map((op) => JSON.stringify(op[1]));
  const text = drawn.join(' ');
  expect(text).toContain('John 3:16');
  expect(text).toContain('Walkerville Church Plant');
  expect(text).toContain('Security/Lock Up');
  expect(text).toContain('Bob');
  expect(text).toContain('Welcome new family');
});

test('exports the whole roster as CSV, including a removed ministry that has people', async ({ page }) => {
  const app = await openApp(page, olderSundaysSeed());
  await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['meta']).toBeDefined();
  await app.tab('Roster');
  await page.locator('#csv').click();
  await expect.poll(async () => (await app.saves()).map((s) => s.filename)).toEqual(['sunday-roster.csv']);

  const csv = (await app.saves())[0]?.data ?? '';
  const [header, first] = csv.split('\n');
  expect(header).toBe('"Date","Security/Lock Up","Welcoming","Tea and Coffee","Creche","Communion Prep"');
  expect(first).toBe('"2027-01-03","Bob","Ann","Cy & Eli","Dee & Fay","Gus"');
});
