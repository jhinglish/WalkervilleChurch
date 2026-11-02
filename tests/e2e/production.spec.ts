import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { demoLogins } from '../../src/test-fixtures';
import { openLogin } from './support/app';
import type { Seed } from './support/fake-runtime';
import { freshSeed } from './support/seeds';

/**
 * These tests open the production build (dist/index.html), the one that is published. It has no demo accounts,
 * so the only way in is a login stored in the database, and the first admin is a person with the admin role plus
 * one such login, seeded once by hand (README > Sign-in and roles > First admin).
 */

const FIRST_ADMIN = { personId: 'ann', username: 'first.admin', password: 'One-Off-Pass-1', salt: 'firstadminsalt' } as const;

/** Gives Ann the admin role and a stored login, the same documents the one-off seeding writes. */
function withFirstAdmin(seed: Seed): Seed {
  return {
    ...seed,
    [`people/${FIRST_ADMIN.personId}`]: { name: 'Ann', family: 1, elig: ['wel', 'tea'], role: 'admin', leads: [] },
    [`logins/${FIRST_ADMIN.username}`]: {
      personId: FIRST_ADMIN.personId,
      salt: FIRST_ADMIN.salt,
      hash: createHash('sha256').update(`${FIRST_ADMIN.salt}:${FIRST_ADMIN.password}`).digest('hex'),
    },
  };
}

async function signInWith(page: Page, username: string, password: string): Promise<void> {
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.locator('#login-submit').click();
}

test('the production page contains none of the demo accounts', async () => {
  const html = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
  for (const text of ['Demo Elder', 'wv-elder-1', 'Elder-Demo-2027', 'u-elder']) expect(html).not.toContain(text);
});

test('none of the demo accounts can sign in to the production page', async ({ page }) => {
  const app = await openLogin(page, withFirstAdmin(freshSeed()), { production: true });
  for (const login of Object.values(demoLogins)) {
    await signInWith(page, login.username, login.password);
    await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');
    await expect(page.locator('#app')).toBeHidden();
  }
  expect(app.errors).toEqual([]);
});

test('the seeded first admin signs in as an admin, with every tab', async ({ page }) => {
  const app = await openLogin(page, withFirstAdmin(freshSeed()), { production: true });
  await signInWith(page, FIRST_ADMIN.username, FIRST_ADMIN.password);
  await expect(page.locator('#who')).toHaveText('Ann \u00b7 Admin / Elder');
  await expect(page.locator('nav button[data-t="h"]')).toBeVisible();

  await page.locator('#v .card').first().waitFor();
  await app.idle();
  await app.tab('Admin');
  await expect(app.view).toContainText(FIRST_ADMIN.username);
  await expect(app.view).not.toContainText('Built in');
  expect(app.errors).toEqual([]);
});

test('the first admin can create the next login, and its person must choose their own password', async ({ page }) => {
  const app = await openLogin(page, withFirstAdmin(freshSeed()), { production: true });
  await signInWith(page, FIRST_ADMIN.username, FIRST_ADMIN.password);
  await page.locator('#v .card').first().waitFor();
  await app.idle();
  await app.tab('Admin');
  await page.selectOption('#lperson', 'bob');
  await page.fill('#lname', 'bob.s');
  await page.locator('#ladd').click();
  await expect(page.locator('#lissued-pw')).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  const temporary = await page.locator('#lissued-pw').innerText();
  await expect.poll(async () => (await app.paths('logins')).length).toBe(2);

  await page.locator('#signout').click();
  await signInWith(page, 'bob.s', temporary);
  await expect(page.locator('#setpw')).toBeVisible();
  await page.fill('#setpw-new', 'Sunday-Pass-1');
  await page.fill('#setpw-new2', 'Sunday-Pass-1');
  await page.locator('#setpw-submit').click();
  await expect(page.locator('#who')).toHaveText('Bob \u00b7 Member');
});

test('the only admin cannot be demoted, removed or have their login removed', async ({ page }) => {
  const app = await openLogin(page, withFirstAdmin(freshSeed()), { production: true });
  await signInWith(page, FIRST_ADMIN.username, FIRST_ADMIN.password);
  await page.locator('#v .card').first().waitFor();
  await app.idle();
  await app.tab('Admin');

  await page.locator('select[data-prole][data-pid="ann"]').selectOption('member');
  await expect(app.banner).toContainText('nobody who can sign in as an admin');
  expect((await app.doc('people/ann'))['role']).toBe('admin');

  await page.locator('[data-prm="ann"]').click();
  await page.locator('[data-prm="ann"]').click();
  await expect(app.banner).toContainText('nobody who can sign in as an admin');
  expect((await app.doc('people/ann'))['gone']).toBeUndefined();

  await page.locator(`[data-lrm="${FIRST_ADMIN.username}"]`).click();
  await page.locator(`[data-lrm="${FIRST_ADMIN.username}"]`).click();
  await expect(app.banner).toContainText('nobody who can sign in as an admin');
  expect(await app.paths('logins')).toHaveLength(1);
  expect(app.errors).toEqual([]);
});

test('an admin can be demoted once another admin can sign in', async ({ page }) => {
  const seed: Seed = {
    ...withFirstAdmin(freshSeed()),
    'people/bob': { name: 'Bob', family: 2, elig: ['sec', 'tea'], role: 'admin', leads: [] },
    'logins/bob.s': { personId: 'bob', salt: 'bobsalt', hash: 'f'.repeat(64) },
  };
  const app = await openLogin(page, seed, { production: true });
  await signInWith(page, FIRST_ADMIN.username, FIRST_ADMIN.password);
  await page.locator('#v .card').first().waitFor();
  await app.idle();
  await app.tab('Admin');
  await page.locator('select[data-prole][data-pid="ann"]').selectOption('member');
  await expect.poll(async () => (await app.doc('people/ann'))['role']).toBe('member');
});
