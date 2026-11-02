import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { demoLogins } from '../../src/test-fixtures';
import { openApp, openLogin } from './support/app';
import { SEEDED_LOGIN, freshSeed, withSeededLogin } from './support/seeds';

async function signInWith(page: Page, username: string, password: string): Promise<void> {
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.locator('#login-submit').click();
}

/** Fills in and submits the "choose your password" screen. */
async function chooseNewPassword(page: Page, first: string, second = first): Promise<void> {
  await page.fill('#setpw-new', first);
  await page.fill('#setpw-new2', second);
  await page.locator('#setpw-submit').click();
}

/** The temporary password the Admin tab shows once after creating or resetting a login. */
async function issuedPassword(page: Page): Promise<string> {
  await expect(page.locator('#lissued-pw')).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  return page.locator('#lissued-pw').innerText();
}

const lockedText = /Too many failed attempts\. Try again in \d+ minutes?\./;

test.describe('logins created in the Admin tab', () => {
  test('an admin creates a login with a random temporary password, and the person must choose their own', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Admin');
    await app.idle();
    await page.selectOption('#lperson', 'ann');
    await page.fill('#lname', ' Ann.W ');
    await page.locator('#ladd').click();
    const temporary = await issuedPassword(page);
    await expect.poll(async () => (await app.paths('logins')).length).toBe(1);

    const doc = await app.doc('logins/ann.w');
    expect(doc['personId']).toBe('ann');
    expect(doc['temp']).toBe(true);
    expect(JSON.stringify(doc)).not.toContain(temporary);
    expect(String(doc['hash'])).toMatch(/^[0-9a-f]{64}$/);
    await expect(app.view).toContainText('ann.w');
    await expect(app.view).toContainText('Temporary password, not yet changed');

    await page.locator('#signout').click();
    await signInWith(page, 'ann.w', temporary);
    await expect(page.locator('#setpw')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();

    await chooseNewPassword(page, 'Another-Pass-77', 'Different-Pass-1');
    await expect(page.locator('#setpw-error')).toContainText('do not match');
    await chooseNewPassword(page, 'short');
    await expect(page.locator('#setpw-error')).toContainText('at least 8 characters');
    await chooseNewPassword(page, temporary);
    await expect(page.locator('#setpw-error')).toContainText('different from the temporary one');
    await expect(page.locator('#app')).toBeHidden();

    await chooseNewPassword(page, 'Another-Pass-77');
    await expect(page.locator('#who')).toHaveText('Ann \u00b7 Member');
    await expect(page.locator('nav button.on')).toHaveText('My schedule');
    await expect(page.locator('nav button[data-t="h"]')).toBeHidden();
    await expect.poll(async () => (await app.doc('logins/ann.w'))['temp']).toBe(false);

    await page.locator('#signout').click();
    await signInWith(page, 'ann.w', temporary);
    await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');
    await signInWith(page, 'ann.w', 'Another-Pass-77');
    await expect(page.locator('#who')).toHaveText('Ann \u00b7 Member');
    await expect(page.locator('#setpw')).toBeHidden();
  });

  test('refuses a bad username, a taken username and a second login for the same person', async ({ page }) => {
    const app = await openApp(page, withSeededLogin(freshSeed()));
    await app.tab('Admin');
    await app.idle();
    await page.selectOption('#lperson', 'bob');
    await page.fill('#lname', 'B!');
    await page.locator('#ladd').click();
    await expect(app.banner).toContainText('Usernames are 3 to 32');

    await page.fill('#lname', 'elder');
    await page.locator('#ladd').click();
    await expect(app.banner).toContainText('That username is taken.');

    await page.fill('#lname', SEEDED_LOGIN.username);
    await page.locator('#ladd').click();
    await expect(app.banner).toContainText('That username is taken.');
    expect(await app.paths('logins')).toHaveLength(1);
    await expect(page.locator('#lissued')).toHaveCount(0);

    await expect(page.locator('#lperson option[value="ann"]')).toHaveCount(0);
  });

  test('the temporary password is shown once, and is gone after Done or a change of tab', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Admin');
    await app.idle();
    await page.selectOption('#lperson', 'ann');
    await page.fill('#lname', 'ann.w');
    await page.locator('#ladd').click();
    await issuedPassword(page);
    await page.locator('#lissued-ok').click();
    await expect(page.locator('#lissued')).toHaveCount(0);

    await app.idle();
    await page.selectOption('#lperson', 'bob');
    await page.fill('#lname', 'bob.s');
    await page.locator('#ladd').click();
    await issuedPassword(page);
    await app.tab('Roster');
    await app.tab('Admin');
    await expect(page.locator('#lissued')).toHaveCount(0);
  });

  test('a stored login survives a reload', async ({ page }) => {
    await openLogin(page, withSeededLogin(freshSeed()));
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#who')).toHaveText('Ann \u00b7 Member');
    await page.reload();
    await expect(page.locator('#who')).toHaveText('Ann \u00b7 Member');
    await expect(page.locator('#login')).toBeHidden();
  });

  test('a stored login takes the role an admin gives its person', async ({ page }) => {
    const app = await openApp(page, withSeededLogin(freshSeed()));
    await app.elsewhere('people/ann', { role: 'leader', leads: ['wel'] });
    await page.locator('#signout').click();
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#who')).toHaveText('Ann \u00b7 Team Leader');
    await expect(page.locator('nav button[data-t="r"]')).toBeVisible();
    await expect(page.locator('nav button[data-t="h"]')).toBeHidden();
  });

  test('an admin can reset a forgotten password to a new temporary one, and the old one stops working', async ({ page }) => {
    const app = await openApp(page, withSeededLogin(freshSeed()));
    await app.tab('Admin');
    await app.idle();
    await page.locator('[data-lreset="ann.w"]').click();
    await expect(app.banner).toContainText('Password reset.');
    const temporary = await issuedPassword(page);
    await expect.poll(async () => (await app.doc('logins/ann.w'))['salt']).not.toBe('seedsalt');
    expect((await app.doc('logins/ann.w'))['temp']).toBe(true);

    await page.locator('#signout').click();
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');
    await signInWith(page, SEEDED_LOGIN.username, temporary);
    await expect(page.locator('#setpw')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });

  test('an admin can remove a login after confirming, and it can no longer sign in', async ({ page }) => {
    const app = await openApp(page, withSeededLogin(freshSeed()));
    await app.tab('Admin');
    await app.idle();
    await page.locator('[data-lrm="ann.w"]').click();
    expect(await app.paths('logins')).toHaveLength(1);
    await page.locator('[data-lrm="ann.w"]').click();
    await expect.poll(async () => (await app.paths('logins')).length).toBe(0);

    await page.locator('#signout').click();
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');
  });

  test('removing someone from the roster stops their login working', async ({ page }) => {
    const app = await openApp(page, withSeededLogin(freshSeed()));
    await app.elsewhere('people/ann', { gone: true });
    await page.locator('#signout').click();
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');
  });
});

test.describe('the temporary password', () => {
  const temporarySeed = () => {
    const seed = withSeededLogin(freshSeed());
    const login = seed[`logins/${SEEDED_LOGIN.username}`] ?? {};
    return { ...seed, [`logins/${SEEDED_LOGIN.username}`]: { ...login, temp: true } };
  };

  test('lets the person do nothing but choose a new password, even after a reload', async ({ page }) => {
    const app = await openLogin(page, temporarySeed());
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#setpw')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    expect(await page.locator('#v').innerHTML()).toBe('');

    await page.reload();
    await expect(page.locator('#setpw')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    expect(app.errors).toEqual([]);
  });

  test('can be left with Sign out, and the next sign-in still asks for a new password', async ({ page }) => {
    await openLogin(page, temporarySeed());
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await page.locator('#setpw-signout').click();
    await expect(page.locator('#login')).toBeVisible();
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#setpw')).toBeVisible();
  });

  test('is asked for again when an admin resets the login while the person is signed in', async ({ page }) => {
    const app = await openLogin(page, withSeededLogin(freshSeed()));
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#who')).toHaveText('Ann \u00b7 Member');
    await app.elsewhere(`logins/${SEEDED_LOGIN.username}`, { temp: true });
    await expect(page.locator('#setpw')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });
});

test.describe('changing your own password', () => {
  async function openAsAnn(page: Page) {
    const app = await openApp(page, withSeededLogin(freshSeed()));
    await page.locator('#signout').click();
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#who')).toHaveText('Ann \u00b7 Member');
    await app.tab('Profile');
    return app;
  }

  test('works with the right current password, and the new one is needed from then on', async ({ page }) => {
    const app = await openAsAnn(page);
    await app.idle();
    await page.fill('#pw-cur', SEEDED_LOGIN.password);
    await page.fill('#pw-new', 'Another-Pass-77');
    await page.fill('#pw-new2', 'Another-Pass-77');
    await page.locator('#pwsave').click();
    await expect(app.banner).toContainText('Password changed.');
    await expect.poll(async () => (await app.doc('logins/ann.w'))['salt']).not.toBe('seedsalt');

    await page.locator('#signout').click();
    await signInWith(page, SEEDED_LOGIN.username, SEEDED_LOGIN.password);
    await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');
    await signInWith(page, SEEDED_LOGIN.username, 'Another-Pass-77');
    await expect(page.locator('#who')).toHaveText('Ann \u00b7 Member');
  });

  test('is refused when the current password is wrong, the new ones differ or the new one is too short', async ({ page }) => {
    const app = await openAsAnn(page);
    await app.idle();
    await page.fill('#pw-cur', 'not-it');
    await page.fill('#pw-new', 'Another-Pass-77');
    await page.fill('#pw-new2', 'Another-Pass-77');
    await page.locator('#pwsave').click();
    await expect(app.banner).toContainText('current password is not right');
    await expect(page.locator('#pw-new')).toHaveValue('Another-Pass-77');

    await page.fill('#pw-cur', SEEDED_LOGIN.password);
    await page.fill('#pw-new2', 'Different-Pass-1');
    await page.locator('#pwsave').click();
    await expect(app.banner).toContainText('do not match');

    await page.fill('#pw-new', 'short');
    await page.fill('#pw-new2', 'short');
    await page.locator('#pwsave').click();
    await expect(app.banner).toContainText('at least 8 characters');
    expect((await app.doc('logins/ann.w'))['salt']).toBe('seedsalt');
  });

  test('is not offered to the built-in demo accounts', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Profile');
    await expect(page.locator('#pwsave')).toHaveCount(0);
    await expect(app.view).toContainText('built-in demo account');
  });
});

test.describe('sign-in lockout', () => {
  test('locks a username after five wrong passwords, even for the right one', async ({ page }) => {
    await openLogin(page, freshSeed());
    for (let i = 0; i < 4; i++) {
      await signInWith(page, demoLogins.admin.username, `wrong-${i}`);
      await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');
    }
    await signInWith(page, demoLogins.admin.username, 'wrong-4');
    await expect(page.locator('#login-error')).toHaveText(lockedText);

    await signInWith(page, demoLogins.admin.username, demoLogins.admin.password);
    await expect(page.locator('#login-error')).toHaveText(lockedText);
    await expect(page.locator('#app')).toBeHidden();

    await signInWith(page, demoLogins.leader.username, demoLogins.leader.password);
    await expect(page.locator('#who')).toHaveText('Demo Team Leader \u00b7 Team Leader');
  });

  test('stays locked after a reload in the same tab', async ({ page }) => {
    await openLogin(page, freshSeed());
    for (let i = 0; i < 5; i++) await signInWith(page, demoLogins.member.username, `wrong-${i}`);
    await page.reload();
    await signInWith(page, demoLogins.member.username, demoLogins.member.password);
    await expect(page.locator('#login-error')).toHaveText(lockedText);
  });
});
