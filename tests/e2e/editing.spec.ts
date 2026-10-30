import { expect, test } from '@playwright/test';
import { openApp } from './support/app';
import { freshSeed, olderSundaysSeed } from './support/seeds';

const corner = { position: { x: 2, y: 2 } };

test.describe('moving people on the Roster tab', () => {
  test('tap a name, then a ministry, to move them', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.tab('Roster');
    await app.chip('2027-01-03', 'wel').click();
    await app.zone('2027-01-03', 'tea').click(corner);

    await expect.poll(async () => ((await app.doc('rosters/2027-01-03'))['s'] as Record<string, string[]>)['tea']).toContain('ann');
    const doc = await app.doc('rosters/2027-01-03');
    const s = doc['s'] as Record<string, string[]>;
    expect(s['wel']).toEqual([]);
    expect(s['sec']).toEqual(['bob']);
    expect(doc['manual']).toBe(true);
    await expect.poll(async () => (await app.history()).some((m) => m.includes('moved Ann from Welcoming to Tea and Coffee'))).toBe(true);
    await expect(app.card('2027-01-03')).toContainText('edited');
  });

  test('dropping a name on Not serving removes them', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.tab('Roster');
    await app.chip('2027-01-03', 'sec').click();
    await app.zone('2027-01-03', '').click(corner);
    await expect.poll(async () => ((await app.doc('rosters/2027-01-03'))['s'] as Record<string, string[]>)['sec']).toEqual([]);
  });

  test('tapping the same name twice deselects it and changes nothing', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.tab('Roster');
    const before = await app.doc('rosters/2027-01-03');
    await app.chip('2027-01-03', 'wel').click();
    await expect(app.chip('2027-01-03', 'wel')).toHaveClass(/on/);
    await app.chip('2027-01-03', 'wel').click();
    await expect(app.chip('2027-01-03', 'wel')).not.toHaveClass(/on/);
    expect(await app.doc('rosters/2027-01-03')).toEqual(before);
  });

  test('does not overwrite a change someone else made, and says so', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.tab('Roster');
    await app.mute();
    await app.elsewhere('rosters/2027-01-03', { s: { wel: [] } });
    await app.chip('2027-01-03', 'wel').click();
    await app.zone('2027-01-03', 'tea').click(corner);

    await expect(app.banner).toHaveText('Someone else already changed this. The latest version is shown.');
    const s = (await app.doc('rosters/2027-01-03'))['s'] as Record<string, string[]>;
    expect(s['tea']).toEqual(['cy', 'eli']);
  });

  test('tells you when someone else is editing the same Sunday', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.hold('rosters/2027-01-03');
    await page.locator('textarea[data-note]').fill('Bring extra chairs');
    await page.locator('[data-nsave]').click();
    await expect(app.banner).toHaveText('Someone else is editing right now. Please try again in a moment.');
    expect((await app.doc('rosters/2027-01-03'))['note']).toBe('Welcome new family');
  });
});

test.describe('the Serving tab', () => {
  test('removes and adds people while editing', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await page.locator('#sedit').click();
    await page.locator('[data-srm="wel|ann"]').click();
    await expect.poll(async () => ((await app.doc('rosters/2027-01-03'))['s'] as Record<string, string[]>)['wel']).toEqual([]);
    await expect(page.locator('[data-srm="wel|ann"]')).toHaveCount(0);
    await app.idle();

    await page.selectOption('#sa-wel', 'dee');
    await page.locator('button[data-sadd="wel"]').click();
    await expect.poll(async () => ((await app.doc('rosters/2027-01-03'))['s'] as Record<string, string[]>)['wel']).toEqual(['dee']);
  });

  test('saves the verse and the note, and keeps them with that Sunday', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await page.locator('textarea[data-verse]').fill('Psalm 23:1');
    await page.locator('[data-vsave]').click();
    await page.locator('textarea[data-note]').fill('Bring snacks');
    await page.locator('[data-nsave]').click();
    await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['verse']).toBe('Psalm 23:1');
    await expect.poll(async () => (await app.doc('rosters/2027-01-03'))['note']).toBe('Bring snacks');
    expect((await app.doc('rosters/2027-01-10'))['verse']).toBeUndefined();
  });

  test('unsaved typing survives a redraw', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await page.locator('textarea[data-note]').fill('Half-written');
    await app.elsewhere('away/zz', { person: 'jon', from: '2027-02-07', to: '2027-02-07', note: '' });
    await app.settle();
    await expect(page.locator('textarea[data-note]')).toHaveValue('Half-written');
  });
});

test.describe('the Away tab', () => {
  test('flags the person on Sundays that already exist', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.tab('Away');
    await page.selectOption('#ap', 'bob');
    await page.fill('#af', '2027-01-03');
    await page.fill('#an', 'work trip');
    await page.locator('#aadd').click();
    await expect.poll(async () => (await app.paths('away')).length).toBe(2);

    await app.tab('Roster');
    await expect(app.chip('2027-01-03', 'sec')).toHaveClass(/bad/);
    await expect(app.chip('2027-01-03', 'sec')).toHaveAttribute('title', 'Marked away');
  });

  test('ignores a range that ends before it starts', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.tab('Away');
    await page.fill('#af', '2027-03-07');
    await page.fill('#at', '2027-03-01');
    await page.locator('#aadd').click();
    await app.settle();
    expect(await app.paths('away')).toHaveLength(1);
  });

  test('removes an entry', async ({ page }) => {
    const app = await openApp(page, olderSundaysSeed());
    await app.tab('Away');
    await page.locator('[data-del]').first().click();
    await expect.poll(async () => (await app.paths('away')).length).toBe(0);
  });

  test('new generation skips someone who is away', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Roster');
    await page.locator('#gen').click();
    await expect.poll(async () => (await app.paths('rosters')).length).toBe(13);
    for (const date of ['2027-01-10', '2027-01-17']) {
      const s = (await app.doc(`rosters/${date}`))['s'] as Record<string, string[]>;
      expect(Object.values(s).flat()).not.toContain('ann');
    }
  });
});

test.describe('the Admin tab', () => {
  test('adds a person, with a unique id for a repeated name', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Admin');
    for (let i = 0; i < 2; i++) {
      await page.fill('#pn', 'Lou Ann');
      await page.fill('#pf', '3');
      await page.locator('#padd').click();
      await expect.poll(async () => (await app.paths('people')).length).toBe(12 + i);
      await app.idle();
    }
    expect(await app.doc('people/lou-ann')).toEqual({ name: 'Lou Ann', family: 3, elig: [] });
    expect(await app.doc('people/lou-ann-2')).toEqual({ name: 'Lou Ann', family: 3, elig: [] });
  });

  test('never overwrites an existing person who has the same name, even if the page has not caught up', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Admin');
    await app.mute();
    await app.elsewhere('people/zoe', { name: 'Zoe', family: 7, elig: ['wel'] });
    await page.fill('#pn', 'Zoe');
    await page.locator('#padd').click();

    await expect.poll(async () => (await app.paths('people')).includes('people/zoe-2')).toBe(true);
    expect(await app.doc('people/zoe')).toEqual({ name: 'Zoe', family: 7, elig: ['wel'] });
  });

  test('removing a person needs a second click, and they can be restored', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Admin');
    await page.locator('[data-prm="ivy"]').click();
    await expect(page.locator('[data-prm="ivy"]')).toHaveText('Confirm remove');
    await app.settle();
    expect((await app.doc('people/ivy'))['gone']).toBeUndefined();

    await page.locator('[data-prm="ivy"]').click();
    await expect.poll(async () => (await app.doc('people/ivy'))['gone']).toBe(true);
    await page.locator('[data-prs="ivy"]').click();
    await expect.poll(async () => (await app.doc('people/ivy'))['gone']).toBe(false);
  });

  test('ticking eligibility, changing a headcount and adding a ministry are saved', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Admin');
    await page.locator('input[data-pe="tea"][data-pid="gus"]').check();
    await expect.poll(async () => (await app.doc('people/gus'))['elig']).toEqual(['wel', 'tea']);
    await app.idle();

    const count = page.locator('input[data-mf="n"][data-mk="tea"]');
    await count.fill('3');
    await count.blur();
    await expect.poll(async () => JSON.stringify((await app.doc('config/main'))['ministries'])).toContain('"k":"tea","l":"Tea and Coffee","n":3');
    await app.idle();

    await page.fill('#mn', 'Sound');
    await page.fill('#mc', '2');
    await page.check('#mx');
    await page.locator('#madd').click();
    await expect.poll(async () => JSON.stringify((await app.doc('config/main'))['ministries'])).toContain('"l":"Sound","n":2,"x":1');
  });

  test('a change is written to the change log and shown on the Admin tab', async ({ page }) => {
    const app = await openApp(page, freshSeed());
    await app.tab('Admin');
    await page.fill('#pn', 'Zoe');
    await page.locator('#padd').click();
    await expect.poll(async () => (await app.history()).includes('Added person: Zoe')).toBe(true);
    await expect(app.view.locator('.card', { has: page.getByRole('heading', { name: 'Change log' }) })).toContainText('Added person: Zoe');
  });
});
