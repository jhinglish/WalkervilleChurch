import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { demoLogins } from '../../src/test-fixtures';
import { openApp } from './support/app';
import type { App } from './support/app';
import { olderSundaysSeed } from './support/seeds';

const DATE = '2027-01-03';

async function signInAs(page: Page, role: keyof typeof demoLogins): Promise<void> {
  await page.fill('#login-username', demoLogins[role].username);
  await page.fill('#login-password', demoLogins[role].password);
  await page.locator('#login-submit').click();
}

const rosterOf = async (app: App, date = DATE): Promise<Record<string, string[]>> =>
  (await app.doc(`rosters/${date}`))['s'] as Record<string, string[]>;

/** The demo member serves on Tea and Coffee on 3 Jan 2027, with Cy and Eli. Hal is eligible and free. */
async function openAsServingMember(page: Page): Promise<App> {
  const app = await openApp(page, olderSundaysSeed(), { as: 'member', landing: true });
  await app.elsewhere('people/demo-member', { name: 'Demo Member', family: 0, elig: ['tea'] });
  await app.elsewhere(`rosters/${DATE}`, { s: { tea: ['cy', 'eli', 'demo-member'] } });
  await expect(page.locator('[data-swapfor]').first()).toBeVisible();
  return app;
}

test.describe('requesting a swap', () => {
  test('a member asks for cover from My schedule and sees the request', async ({ page }) => {
    const app = await openAsServingMember(page);
    await page.locator(`[data-swapfor="${DATE}|tea"]`).click();
    await expect(page.locator('nav button.on')).toHaveText('Swaps');
    await expect(page.locator('#swslot')).toHaveValue(`${DATE}|tea`);

    await app.idle();
    await page.fill('#swnote', 'Away for work');
    await page.locator('#swreq').click();
    await expect(app.banner).toContainText('Swap requested');
    await expect.poll(async () => (await app.paths('swaps')).length).toBe(1);

    const swap = await app.doc((await app.paths('swaps'))[0] ?? '');
    expect(swap).toMatchObject({ date: DATE, ministry: 'tea', from: 'demo-member', status: 'open', note: 'Away for work', cover: '' });
    await expect(app.view).toContainText('waiting for a team leader');
    await expect(app.view).toContainText('Away for work');
    expect(await rosterOf(app)).toMatchObject({ tea: ['cy', 'eli', 'demo-member'] });
  });

  test('a member cannot ask twice for the same Sunday', async ({ page }) => {
    const app = await openAsServingMember(page);
    await app.tab('Swaps');
    await page.locator('#swreq').click();
    await expect.poll(async () => (await app.paths('swaps')).length).toBe(1);
    await expect(page.locator('#swreq')).toHaveCount(0);
    await expect(app.view).toContainText('no upcoming Sundays without an open request');
  });

  test('a member can cancel their own open request', async ({ page }) => {
    const app = await openAsServingMember(page);
    await app.tab('Swaps');
    await page.locator('#swreq').click();
    await expect.poll(async () => (await app.paths('swaps')).length).toBe(1);
    await page.locator('[data-swcancel]').click();
    await expect.poll(async () => (await app.doc((await app.paths('swaps'))[0] ?? ''))['status']).toBe('cancelled');
    await expect(app.view).toContainText('cancelled');
    await expect(page.locator('[data-swcancel]')).toHaveCount(0);
  });

  test('a member never sees decision controls or other people’s requests', async ({ page }) => {
    const app = await openAsServingMember(page);
    await app.elsewhere('swaps/other', {
      date: DATE,
      ministry: 'tea',
      from: 'cy',
      note: 'secret reason',
      status: 'open',
      cover: '',
      by: '',
      ts: '2026-10-28T08:00:00.000Z',
    });
    await app.tab('Swaps');
    await expect(page.locator('[data-swok]')).toHaveCount(0);
    await expect(page.locator('[data-swno]')).toHaveCount(0);
    await expect(app.view).not.toContainText('Requests to decide');
    await expect(app.view).not.toContainText('secret reason');
  });

  test('a person who is not linked to anyone cannot request', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.tab('Swaps');
    await expect(app.view).toContainText('not linked to a person');
    await expect(page.locator('#swreq')).toHaveCount(0);
  });
});

test.describe('deciding a swap', () => {
  async function requestAsMember(page: Page): Promise<App> {
    const app = await openAsServingMember(page);
    await app.tab('Swaps');
    await page.locator('#swreq').click();
    await expect.poll(async () => (await app.paths('swaps')).length).toBe(1);
    await page.locator('#signout').click();
    return app;
  }

  test('a team leader approves it, choosing the cover, and the roster changes', async ({ page }) => {
    const app = await requestAsMember(page);
    await signInAs(page, 'leader');
    await app.tab('Swaps');
    await app.idle();
    await expect(page.locator('[data-swok]')).toHaveCount(1);
    await expect(app.view).toContainText('Demo Member');
    await expect(page.locator('select[id^="swc-"] option[value="hal"]')).toHaveCount(1);
    await expect(page.locator('select[id^="swc-"] option[value="cy"]')).toHaveCount(0);
    await expect(page.locator('select[id^="swc-"] option[value="demo-member"]')).toHaveCount(0);

    await page.locator('select[id^="swc-"]').selectOption('hal');
    await page.locator('[data-swok]').click();
    await expect.poll(async () => (await rosterOf(app))['tea']).toEqual(['cy', 'eli', 'hal']);
    const swap = await app.doc((await app.paths('swaps'))[0] ?? '');
    expect(swap).toMatchObject({ status: 'approved', cover: 'hal', by: 'leader' });
    expect((await app.doc(`rosters/${DATE}`))['manual']).toBe(true);
    await expect(page.locator('[data-swok]')).toHaveCount(0);
    await expect.poll(async () => (await app.history()).some((m) => m.includes('Swap approved'))).toBe(true);
  });

  test('a team leader declines it and the roster is untouched', async ({ page }) => {
    const app = await requestAsMember(page);
    await signInAs(page, 'leader');
    await app.tab('Swaps');
    await page.locator('[data-swno]').click();
    await expect.poll(async () => (await app.doc((await app.paths('swaps'))[0] ?? ''))['status']).toBe('declined');
    expect((await rosterOf(app))['tea']).toEqual(['cy', 'eli', 'demo-member']);

    await page.locator('#signout').click();
    await signInAs(page, 'member');
    await app.tab('Swaps');
    await expect(app.view).toContainText('declined');
  });

  test('an admin can decide it too', async ({ page }) => {
    const app = await requestAsMember(page);
    await signInAs(page, 'admin');
    await app.tab('Swaps');
    await app.idle();
    await page.locator('select[id^="swc-"]').selectOption('hal');
    await page.locator('[data-swok]').click();
    await expect.poll(async () => (await rosterOf(app))['tea']).toEqual(['cy', 'eli', 'hal']);
  });

  test('a leader does not see requests for ministries they do not manage', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'leader', landing: true });
    await app.elsewhere('swaps/sec1', {
      date: DATE,
      ministry: 'sec',
      from: 'bob',
      note: '',
      status: 'open',
      cover: '',
      by: '',
      ts: '2026-10-28T08:00:00.000Z',
    });
    await app.tab('Swaps');
    await expect(app.view).toContainText('Requests to decide');
    await expect(page.locator('[data-swok]')).toHaveCount(0);
    await expect(page.locator('[data-swno]')).toHaveCount(0);
    await expect(app.view).toContainText('Nothing waiting.');
  });

  test('a leader cannot decide their own request, but sees it under My requests', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'leader', landing: true });
    await app.elsewhere('people/demo-leader', { name: 'Demo Leader', family: 0, elig: ['tea'] });
    await app.elsewhere(`rosters/${DATE}`, { s: { tea: ['cy', 'eli', 'demo-leader'] } });
    await app.tab('Swaps');
    await app.idle();
    await page.locator('#swreq').click();
    await expect.poll(async () => (await app.paths('swaps')).length).toBe(1);
    await expect(app.view).toContainText('waiting for a team leader');
    await expect(page.locator('[data-swok]')).toHaveCount(0);
    await expect(app.view).toContainText('Nothing waiting.');
  });

  test('approving fails cleanly when the requester has already been moved off the team', async ({ page }) => {
    const app = await requestAsMember(page);
    await app.elsewhere(`rosters/${DATE}`, { s: { tea: ['cy', 'eli'] } });
    await signInAs(page, 'leader');
    await app.tab('Swaps');
    await app.idle();
    await page.locator('select[id^="swc-"]').selectOption('hal');
    await page.locator('[data-swok]').click();
    await expect(app.banner).toContainText('no longer on that team');
    expect((await rosterOf(app))['tea']).toEqual(['cy', 'eli']);
    expect((await app.doc((await app.paths('swaps'))[0] ?? ''))['status']).toBe('open');
  });
});
