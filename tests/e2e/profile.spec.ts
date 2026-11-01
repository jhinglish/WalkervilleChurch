import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp } from './support/app';
import type { App } from './support/app';
import { olderSundaysSeed } from './support/seeds';

const DATE = '2027-01-03';

/** The demo member exists on the roster, serves Tea and Coffee on 3 Jan 2027 and served on 18 Oct 2026. */
async function openAsMember(page: Page): Promise<App> {
  const app = await openApp(page, olderSundaysSeed(), { as: 'member', landing: true });
  await app.elsewhere('people/demo-member', { name: 'Demo Member', family: 0, elig: ['tea'] });
  await app.elsewhere(`rosters/${DATE}`, { s: { tea: ['cy', 'eli', 'demo-member'] } });
  await app.elsewhere('rosters/2026-10-18', { date: '2026-10-18', s: { tea: ['demo-member', 'cy'] } });
  await expect(app.view).toContainText('Tea and Coffee');
  return app;
}

test.describe('My schedule', () => {
  test('lists the next Sunday, upcoming Sundays and past service', async ({ page }) => {
    const app = await openAsMember(page);
    await expect(app.view).toContainText('Next time you are serving');
    await expect(app.view).toContainText('With Cy, Eli');
    await expect(app.view).toContainText('Your service so far');
    await expect(app.view).toContainText('served 1 time on recorded Sundays');
    await expect(app.view).toContainText('With Cy');
    expect(app.errors).toEqual([]);
  });

  test('downloads a calendar file of the upcoming Sundays only', async ({ page }) => {
    const app = await openAsMember(page);
    await app.idle();
    await page.locator('#ics').click();
    await expect.poll(async () => (await app.saves()).length).toBe(1);
    const [saved] = await app.saves();
    expect(saved?.filename).toBe('my-roster.ics');
    const data = saved?.data ?? '';
    expect(data).toContain('BEGIN:VCALENDAR');
    expect(data).toContain('DTSTART;VALUE=DATE:20270103');
    expect(data).toContain('SUMMARY:Serving: Tea and Coffee');
    expect(data).toContain('DESCRIPTION:With Cy\\, Eli');
    expect(data).toContain('UID:2027-01-03-tea-demo-member@walkerville-roster');
    expect(data).not.toContain('20261018');
    expect(data.split('BEGIN:VEVENT')).toHaveLength(2);
  });

  test('has no calendar button when there is nothing upcoming', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'member', landing: true });
    await app.elsewhere('people/demo-member', { name: 'Demo Member', family: 0, elig: ['tea'] });
    await expect(app.view).toContainText('Demo Member');
    await expect(page.locator('#ics')).toHaveCount(0);
    await expect(app.view).toContainText('not on the roster for any upcoming Sunday');
  });
});

test.describe('Profile', () => {
  test('a member can change their own name and phone number', async ({ page }) => {
    const app = await openAsMember(page);
    await app.tab('Profile');
    await expect(app.view).toContainText('Tea and Coffee');
    await expect(page.locator('[data-prof="name"]')).toHaveValue('Demo Member');

    await page.locator('[data-prof="name"]').fill('Demi Member');
    await page.locator('[data-prof="name"]').blur();
    await expect.poll(async () => (await app.doc('people/demo-member'))['name']).toBe('Demi Member');

    await app.idle();
    await page.locator('[data-prof="phone"]').fill('082 555 0100');
    await page.locator('[data-prof="phone"]').blur();
    await expect.poll(async () => (await app.doc('people/demo-member'))['phone']).toBe('082 555 0100');
    await expect.poll(async () => (await app.history()).some((m) => m.includes('renamed themselves to Demi Member'))).toBe(true);
    expect(app.errors).toEqual([]);
  });

  test('ignores an emptied name, so a person cannot end up unnamed', async ({ page }) => {
    const app = await openAsMember(page);
    await app.tab('Profile');
    await app.idle();
    await page.locator('[data-prof="name"]').fill('   ');
    await page.locator('[data-prof="name"]').blur();
    await app.settle();
    expect((await app.doc('people/demo-member'))['name']).toBe('Demo Member');
  });

  test('is only about the signed-in person: a member cannot edit anyone else', async ({ page }) => {
    const app = await openAsMember(page);
    await app.tab('Profile');
    await expect(page.locator('[data-prof]')).toHaveCount(2);
    await expect(page.locator('[data-pf]')).toHaveCount(0);
    await expect(page.locator('[data-prole]')).toHaveCount(0);
  });

  test('tells a login that is not linked to a person that there is nothing to edit', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'member', landing: true });
    await app.tab('Profile');
    await expect(app.view).toContainText('not linked to a person');
    await expect(page.locator('[data-prof]')).toHaveCount(0);
  });
});
