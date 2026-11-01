import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp } from './support/app';
import type { App } from './support/app';
import { freshSeed, olderSundaysSeed } from './support/seeds';

const DATE = '2027-01-03';

const swap = (ministry: string, from: string, note = '') => ({
  date: DATE,
  ministry,
  from,
  note,
  status: 'open',
  cover: '',
  by: '',
  ts: '2026-10-28T08:00:00.000Z',
});

const landing = (page: Page, role: string) => page.locator(`[data-landing="${role}"]`);

test.describe('member layout', () => {
  async function openAsMember(page: Page): Promise<App> {
    const app = await openApp(page, olderSundaysSeed(), { as: 'member', landing: true });
    await app.elsewhere('people/demo-member', { name: 'Demo Member', family: 0, elig: ['tea'] });
    await app.elsewhere(`rosters/${DATE}`, { s: { tea: ['cy', 'eli', 'demo-member'] } });
    await expect(app.view).toContainText('Tea and Coffee');
    return app;
  }

  test('shows only their own Sundays, with both action buttons and no team or admin controls', async ({ page }) => {
    const app = await openAsMember(page);
    await expect(landing(page, 'member')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark Unavailability', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request a Swap', exact: true })).toBeVisible();
    await expect(app.view).not.toContainText('Security/Lock Up');
    await expect(app.view).not.toContainText('Swap requests to approve');
    await expect(page.locator('#gen')).toHaveCount(0);
    await expect(page.locator('[data-goto="h"]')).toHaveCount(0);
  });

  test('Mark Unavailability opens the Away tab and Request a Swap opens the Swaps tab', async ({ page }) => {
    await openAsMember(page);
    await page.getByRole('button', { name: 'Mark Unavailability', exact: true }).click();
    await expect(page.locator('nav button.on')).toHaveText('Away');
    await page.locator('nav button[data-t="m"]').click();
    await page.getByRole('button', { name: 'Request a Swap', exact: true }).click();
    await expect(page.locator('nav button.on')).toHaveText('Swaps');
  });
});

test.describe('team leader layout', () => {
  test('shows the full schedule of only the teams they lead, with oversight and swap cues', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'leader', landing: true });
    await app.elsewhere('swaps/s1', swap('tea', 'cy', 'Away for work'));
    await app.elsewhere('swaps/s2', swap('sec', 'bob'));

    await expect(landing(page, 'leader')).toBeVisible();
    await expect(app.view).toContainText('Team oversight');
    await expect(app.view).toContainText('Welcoming');
    await expect(app.view).toContainText('Tea and Coffee');
    await expect(app.view).toContainText('needs 1 more');
    await expect(app.view).not.toContainText('Security/Lock Up');
    await expect(app.view).not.toContainText('Creche');

    await expect(app.view).toContainText('Cy asks to be covered in Tea and Coffee');
    await expect(app.view).not.toContainText('Bob asks to be covered');
    await expect(page.locator('#gen')).toHaveCount(0);
    await expect(page.locator('[data-goto="h"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Review and approve', exact: true }).click();
    await expect(page.locator('nav button.on')).toHaveText('Swaps');
  });
});

test.describe('admin layout', () => {
  test('shows every team in one grid with the roster-wide actions', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { landing: true });
    await expect(landing(page, 'admin')).toBeVisible();
    for (const label of ['Security/Lock Up', 'Welcoming', 'Tea and Coffee', 'Creche']) {
      await expect(app.view.locator('table.rec th', { hasText: label })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Generate Roster', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Rotations', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Override Allocations', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Edit Rotations', exact: true }).click();
    await expect(page.locator('nav button.on')).toHaveText('Admin');
    await page.locator('nav button[data-t="m"]').click();
    await page.getByRole('button', { name: 'Override Allocations', exact: true }).click();
    await expect(page.locator('nav button.on')).toHaveText('Roster');
  });

  test('Generate Roster creates the missing Sundays', async ({ page }) => {
    const app = await openApp(page, freshSeed(), { landing: true });
    await app.idle();
    await page.getByRole('button', { name: 'Generate Roster', exact: true }).click();
    await expect.poll(async () => (await app.paths('rosters')).length).toBeGreaterThan(0);
    await expect(app.view.locator('table.rec')).toBeVisible();
  });

  test('lists swap requests for every team', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { landing: true });
    await app.elsewhere('swaps/s2', swap('sec', 'bob'));
    await expect(app.view).toContainText('Bob asks to be covered in Security/Lock Up');
  });
});

test.describe('changing role without a refresh', () => {
  test('the layout follows a role change made while signed in', async ({ page }) => {
    const app = await openApp(page, freshSeed(), { as: 'leader', landing: true });
    await expect(landing(page, 'leader')).toBeVisible();

    await app.elsewhere('people/demo-leader', { name: 'Demo Leader', family: 0, elig: [], role: 'admin', leads: [] });
    await expect(landing(page, 'admin')).toBeVisible();
    await expect(landing(page, 'leader')).toHaveCount(0);

    await app.elsewhere('people/demo-leader', { name: 'Demo Leader', family: 0, elig: [], role: 'member', leads: [] });
    await expect(landing(page, 'member')).toBeVisible();
    await expect(landing(page, 'admin')).toHaveCount(0);
    expect(app.errors).toEqual([]);
  });
});
