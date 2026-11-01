import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { demoLogins } from '../../src/test-fixtures';
import { TABS, openApp, openLogin } from './support/app';
import type { LoginRole } from './support/app';
import { freshSeed, olderSundaysSeed } from './support/seeds';

const corner = { position: { x: 2, y: 2 } };

const navButton = (page: Page, tab: string) => page.locator(`nav button[data-t="${tab}"]`);

async function signInAs(page: Page, role: LoginRole): Promise<void> {
  await page.fill('#login-username', demoLogins[role].username);
  await page.fill('#login-password', demoLogins[role].password);
  await page.locator('#login-submit').click();
}

test.describe('the sign-in screen', () => {
  test('is shown first, and the app and its data stay hidden until sign-in', async ({ page }) => {
    const app = await openLogin(page, olderSundaysSeed());
    await expect(page.locator('#login')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    expect(await page.locator('#v').innerHTML()).toBe('');
    expect(app.errors).toEqual([]);
  });

  test('rejects a wrong password and an unknown username with the same message', async ({ page }) => {
    await openLogin(page, olderSundaysSeed());
    await page.fill('#login-username', demoLogins.admin.username);
    await page.fill('#login-password', 'not-the-password');
    await page.locator('#login-submit').click();
    await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');
    await expect(page.locator('#app')).toBeHidden();

    await page.fill('#login-username', 'nobody');
    await page.fill('#login-password', demoLogins.admin.password);
    await page.locator('#login-submit').click();
    await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');
    await expect(page.locator('#app')).toBeHidden();
  });

  test('asks for both fields when one is empty', async ({ page }) => {
    await openLogin(page, olderSundaysSeed());
    await page.fill('#login-username', demoLogins.admin.username);
    await page.locator('#login-submit').click();
    await expect(page.locator('#login-error')).toHaveText('Enter your username and password.');
    await expect(page.locator('#app')).toBeHidden();
  });

  test('accepts the username in any case with spaces around it', async ({ page }) => {
    await openLogin(page, olderSundaysSeed());
    await page.fill('#login-username', `  ${demoLogins.leader.username.toUpperCase()} `);
    await page.fill('#login-password', demoLogins.leader.password);
    await page.locator('#login-submit').click();
    await expect(page.locator('#who')).toHaveText('Demo Team Leader · Team Leader');
  });
});

test.describe('sessions', () => {
  test('survive a reload in the same tab', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'leader' });
    await page.reload();
    await expect(page.locator('#who')).toHaveText('Demo Team Leader · Team Leader');
    await expect(page.locator('#login')).toBeHidden();
    await expect(page.locator('#v .card').first()).toBeVisible();
    expect(app.errors).toEqual([]);
  });

  test('that have expired are not restored', async ({ page }) => {
    await openApp(page, olderSundaysSeed());
    await page.evaluate(() =>
      sessionStorage.setItem('walkerville.session', JSON.stringify({ token: '0'.repeat(32), userId: 'u-elder', issuedAt: 1, expiresAt: 2 })),
    );
    await page.reload();
    await expect(page.locator('#login')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });

  test('that are malformed are not restored', async ({ page }) => {
    await openApp(page, olderSundaysSeed());
    await page.evaluate(() => sessionStorage.setItem('walkerville.session', '{"userId":"u-elder"}'));
    await page.reload();
    await expect(page.locator('#login')).toBeVisible();
  });

  test('end on sign-out: the data is cleared and later updates do not redraw it', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await page.locator('#signout').click();
    await expect(page.locator('#login')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    expect(await page.locator('#v').innerHTML()).toBe('');

    await app.elsewhere('people/zed', { name: 'Zed', family: 0, elig: [] });
    await app.settle();
    expect(await page.locator('#v').innerHTML()).toBe('');
  });

  test('signing in as another role afterwards starts on My schedule with that role’s access', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.tab('Admin');
    await page.locator('#signout').click();
    await signInAs(page, 'leader');
    await expect(page.locator('#who')).toHaveText('Demo Team Leader · Team Leader');
    await expect(page.locator('nav button.on')).toHaveText('My schedule');
    await expect(navButton(page, 'h')).toBeHidden();
    await expect(page.locator('#v')).not.toContainText('Change log');
  });
});

test.describe('admin / elder', () => {
  test('sees every tab and every action', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await expect(page.locator('#who')).toHaveText('Demo Elder · Admin / Elder');
    for (const name of TABS) await expect(page.locator('nav').getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.locator('#sedit')).toBeVisible();
    await expect(page.locator('textarea[data-note]')).toBeVisible();
    await app.tab('Roster');
    await expect(page.locator('#gen')).toBeVisible();
    await expect(page.locator('#csv')).toBeVisible();
    await expect(page.locator('[data-regen="2027-01-03"]')).toBeVisible();
    await app.tab('Admin');
    await expect(page.locator('#madd')).toBeVisible();
    await expect(page.locator('#padd')).toBeVisible();
    expect(app.errors).toEqual([]);
  });
});

test.describe('team leader', () => {
  test('sees the full roster but not the Admin tab or generation controls', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'leader' });
    for (const tab of ['m', 's', 'r', 'a', 'v']) await expect(navButton(page, tab)).toBeVisible();
    await expect(navButton(page, 'h')).toBeHidden();

    await app.tab('Roster');
    await expect(page.locator('#csv')).toBeVisible();
    await expect(page.locator('#gen')).toHaveCount(0);
    await expect(page.locator('[data-regen]')).toHaveCount(0);
    expect(app.errors).toEqual([]);
  });

  test('can only drag names that sit in the ministries they manage', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'leader' });
    await app.tab('Roster');
    await expect(app.chip('2027-01-03', 'wel')).toHaveAttribute('draggable', 'true');
    await expect(app.chip('2027-01-03', 'sec')).toHaveAttribute('draggable', 'false');
  });

  test('can move people between the ministries they manage', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'leader' });
    await app.tab('Roster');
    await app.chip('2027-01-03', 'wel').click();
    await app.zone('2027-01-03', 'tea').click(corner);
    await expect.poll(async () => ((await app.doc('rosters/2027-01-03'))['s'] as Record<string, string[]>)['tea']).toContain('ann');
  });

  test('cannot move people into or out of a ministry they do not manage', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'leader' });
    await app.tab('Roster');
    await app.chip('2027-01-03', 'sec').click();
    await app.zone('2027-01-03', 'wel').click(corner);
    await expect(app.banner).toHaveText('Your role cannot change that ministry.');

    await app.chip('2027-01-03', 'wel').click();
    await app.zone('2027-01-03', 'cre').click(corner);
    await expect(app.banner).toHaveText('Your role cannot change that ministry.');

    const s = (await app.doc('rosters/2027-01-03'))['s'] as Record<string, string[]>;
    expect(s['sec']).toEqual(['bob']);
    expect(s['wel']).toEqual(['ann']);
    expect(s['cre']).toEqual(['dee', 'fay']);
  });

  test('gets editing controls on the Serving tab only for the ministries they manage', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'leader' });
    await page.locator('#sedit').click();
    await app.idle();
    await expect(page.locator('[data-sadd="wel"]')).toBeVisible();
    await expect(page.locator('[data-sadd="tea"]')).toBeVisible();
    await expect(page.locator('[data-sadd="sec"]')).toHaveCount(0);
    await expect(page.locator('[data-sadd="cre"]')).toHaveCount(0);
    await expect(page.locator('[data-srm^="sec|"]')).toHaveCount(0);
    await expect(page.locator('[data-srm^="wel|"]')).toHaveCount(1);
  });
});

test.describe('member', () => {
  test('sees only the Serving and Away tabs, with no editing controls', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'member' });
    await expect(page.locator('#who')).toHaveText('Demo Member · Member');
    await expect(navButton(page, 'm')).toBeVisible();
    await expect(navButton(page, 's')).toBeVisible();
    await expect(navButton(page, 'a')).toBeVisible();
    for (const tab of ['r', 'v', 'h']) await expect(navButton(page, tab)).toBeHidden();

    await expect(app.view).toContainText('Security/Lock Up');
    await expect(page.locator('#sedit')).toHaveCount(0);
    await expect(page.locator('textarea[data-verse]')).toHaveCount(0);
    await expect(page.locator('textarea[data-note]')).toHaveCount(0);
    expect(app.errors).toEqual([]);
  });

  test('can flag only the person their login is linked to, and sees only that person’s entries', async ({ page }) => {
    const app = await openApp(page, freshSeed(), { as: 'member' });
    await app.elsewhere('people/demo-member', { name: 'Demo Member', family: 0, elig: ['tea'] });
    await app.tab('Away');
    await expect(page.locator('#ap option')).toHaveText(['Demo Member']);
    await expect(app.view).not.toContainText('holiday');

    await app.idle();
    await page.fill('#af', '2027-02-07');
    await page.locator('#aadd').click();
    await expect.poll(async () => (await app.paths('away')).length).toBe(2);
    const entries = await Promise.all((await app.paths('away')).map((p) => app.doc(p)));
    expect(entries.map((e) => e['person']).sort()).toEqual(['ann', 'demo-member']);
  });

  test('is told when their login is not linked to anyone on the roster', async ({ page }) => {
    const app = await openApp(page, freshSeed(), { as: 'member' });
    await app.tab('Away');
    await expect(app.view).toContainText('There is nobody you can flag as unavailable yet.');
    await expect(page.locator('#aadd')).toHaveCount(0);
  });
});

test.describe('My schedule', () => {
  test('is the landing page for every role', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'member', landing: true });
    await expect(page.locator('nav button.on')).toHaveText('My schedule');
    await expect(app.view).toContainText('not linked to a person');
  });

  test('shows the signed-in person’s upcoming Sundays, teammates and away dates', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'member', landing: true });
    await app.elsewhere('people/demo-member', { name: 'Demo Member', family: 0, elig: ['tea'] });
    await app.elsewhere('rosters/2027-01-03', { s: { tea: ['cy', 'eli', 'demo-member'] } });
    await app.elsewhere('away/m1', { person: 'demo-member', from: '2027-02-07', to: '2027-02-07', note: 'wedding' });

    await expect(app.view).toContainText('Demo Member');
    await expect(app.view).toContainText('Tea and Coffee');
    await expect(app.view).toContainText('Cy, Eli');
    await expect(app.view).toContainText('wedding');
    await expect(app.view).not.toContainText('Security/Lock Up');
  });

  test('warns when the person is serving on a date they flagged away', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed(), { as: 'member', landing: true });
    await app.elsewhere('people/demo-member', { name: 'Demo Member', family: 0, elig: ['tea'] });
    await app.elsewhere('rosters/2027-01-03', { s: { tea: ['demo-member'] } });
    await app.elsewhere('away/m2', { person: 'demo-member', from: '2027-01-03', to: '2027-01-03', note: '' });
    await expect(app.view).toContainText('marked away');
  });
});

test.describe('assigning roles', () => {
  test('an admin can make a person a team leader of a ministry, and their login follows', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.elsewhere('people/demo-member', { name: 'Demo Member', family: 0, elig: ['tea'] });
    await app.tab('Admin');
    await app.idle();
    await page.locator('select[data-prole][data-pid="demo-member"]').selectOption('leader');
    await expect.poll(async () => (await app.doc('people/demo-member'))['role']).toBe('leader');
    await app.idle();
    await page.locator('input[data-plead="tea"][data-pid="demo-member"]').check();
    await expect.poll(async () => (await app.doc('people/demo-member'))['leads']).toEqual(['tea']);
    await expect.poll(async () => (await app.history()).some((m) => m.includes('now leads Tea and Coffee'))).toBe(true);
    await expect(page.locator('#v')).toContainText('Demo Member');

    await page.locator('#signout').click();
    await signInAs(page, 'member');
    await expect(page.locator('#who')).toHaveText('Demo Member · Team Leader');
    await expect(navButton(page, 'r')).toBeVisible();
    await expect(navButton(page, 'h')).toBeHidden();
  });

  test('a role change reaches a login that is already signed in', async ({ page }) => {
    const app = await openApp(page, freshSeed(), { as: 'leader', landing: true });
    await expect(navButton(page, 'r')).toBeVisible();
    await app.elsewhere('people/demo-leader', { name: 'Demo Leader', family: 0, elig: [], role: 'member', leads: [] });
    await expect(navButton(page, 'r')).toBeHidden();
    await expect(page.locator('#who')).toHaveText('Demo Team Leader · Member');
  });

  test('adding a ministry can name its team leader at the same time', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Admin');
    await page.fill('#mn', 'Sound');
    await page.selectOption('#ml', 'ann');
    await page.locator('#madd').click();
    await expect
      .poll(async () => ((await app.doc('config/main'))['ministries'] as { l: string }[]).some((m) => m.l === 'Sound'))
      .toBe(true);
    await expect.poll(async () => (await app.doc('people/ann'))['role']).toBe('leader');
    const ministries = (await app.doc('config/main'))['ministries'] as { k: string; l: string }[];
    const sound = ministries.find((m) => m.l === 'Sound');
    expect((await app.doc('people/ann'))['leads']).toEqual([sound?.k]);
    await expect(page.locator('#v')).toContainText('Ann');
  });
});
