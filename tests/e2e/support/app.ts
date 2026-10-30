import type { Locator, Page } from '@playwright/test';
import { installFakeRuntime, installPdfStub } from './fake-runtime';
import type { FakeControls, Seed } from './fake-runtime';

/** The built page that every test opens. Run `npm run build` first (the `test:e2e` script does). */
const APP_URL = new URL('../../../dist/index.html', import.meta.url).href;

export type TabName = 'Serving' | 'Roster' | 'Away' | 'Service record' | 'Admin';
export const TABS: readonly TabName[] = ['Serving', 'Roster', 'Away', 'Service record', 'Admin'];

type Fake = FakeControls;
type Doc = Record<string, unknown>;

/** A handle on the running page, with the helpers the tests share. */
export class App {
  /** Uncaught errors thrown in the page. Every test expects this to stay empty. */
  readonly errors: string[] = [];

  constructor(readonly page: Page) {
    page.on('pageerror', (e) => this.errors.push(String(e)));
  }

  /** The tab's content area. */
  get view(): Locator {
    return this.page.locator('#v');
  }

  /** The error banner at the top of the page. */
  get banner(): Locator {
    return this.page.locator('#fl');
  }

  async tab(name: TabName): Promise<void> {
    await this.page.locator('nav').getByRole('button', { name, exact: true }).click();
    await this.idle();
  }

  /**
   * Waits until the page has stopped redrawing. The app redraws the whole tab after every database
   * update, which resets form fields, so fill a form only once the page is quiet. (The wait is 200 ms
   * because the fake runtime shortens timers of 250-600 ms.)
   */
  async idle(): Promise<void> {
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const view = document.querySelector('#v');
          if (!view) return resolve();
          const quiet = 200;
          let timer = window.setTimeout(done, quiet);
          const observer = new MutationObserver(() => {
            window.clearTimeout(timer);
            timer = window.setTimeout(done, quiet);
          });
          function done(): void {
            observer.disconnect();
            resolve();
          }
          observer.observe(view, { childList: true, subtree: true, characterData: true, attributes: true });
        }),
    );
  }

  /** Gives the page time to receive database updates and redraw. */
  async settle(): Promise<void> {
    await this.page.waitForTimeout(150);
  }

  /** Every document in the fake database, keyed by path. */
  db(): Promise<Record<string, Doc>> {
    return this.page.evaluate(() => (window as unknown as { __fake: Fake }).__fake.dump());
  }

  async doc(path: string): Promise<Doc> {
    const doc = (await this.db())[path];
    if (!doc) throw new Error(`No document at ${path}`);
    return doc;
  }

  /** Paths of the documents in a collection. */
  async paths(collection: string): Promise<string[]> {
    return Object.keys(await this.db()).filter((p) => p.startsWith(`${collection}/`));
  }

  /** The text of every change-log entry. */
  async history(): Promise<string[]> {
    const db = await this.db();
    return Object.entries(db)
      .filter(([p]) => p.startsWith('history/'))
      .map(([, d]) => String(d['msg']));
  }

  saves(): Promise<{ filename: string; data: string }[]> {
    return this.page.evaluate(() => (window as unknown as { __fake: Fake }).__fake.saves);
  }

  writes(): Promise<[string, string][]> {
    return this.page.evaluate(() => (window as unknown as { __fake: Fake }).__fake.writes);
  }

  pdfOps(): Promise<unknown[][]> {
    return this.page.evaluate(() => (window as unknown as { __pdfOps: unknown[][] }).__pdfOps);
  }

  /** Pretends someone else holds the lease on a document. */
  hold(path: string, on = true): Promise<void> {
    return this.page.evaluate(([p, o]) => (window as unknown as { __fake: Fake }).__fake.hold(p as string, o as boolean), [path, on]);
  }

  /** Stops the page receiving updates, so it shows stale data. */
  mute(on = true): Promise<void> {
    return this.page.evaluate((o) => (window as unknown as { __fake: Fake }).__fake.mute(o), on);
  }

  /** Simulates another person writing to a document. */
  elsewhere(path: string, data: Doc): Promise<void> {
    return this.page.evaluate(([p, d]) => (window as unknown as { __fake: Fake }).__fake.write(p as string, d as Doc), [path, data] as const);
  }

  /** The Roster card for one Sunday. */
  card(date: string): Locator {
    return this.page.locator('section.card', { has: this.page.locator(`[data-regen="${date}"]`) });
  }

  /** A person's chip on the Roster tab. */
  chip(date: string, ministry: string): Locator {
    return this.page.locator(`.chip[data-d="${date}"][data-k="${ministry}"]`);
  }

  /** The drop zone for a ministry ("" means Not serving) on the Roster tab. */
  zone(date: string, ministry: string): Locator {
    return this.page.locator(`.drop[data-drop="${ministry}"][data-d="${date}"]`);
  }
}

/** Opens the built page with the fake runtime and the given data. */
export async function openApp(page: Page, seed: Seed, options: { canWrite?: boolean } = {}): Promise<App> {
  const app = new App(page);
  await page.route('https://cdnjs.cloudflare.com/**', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.addInitScript(installPdfStub);
  await page.addInitScript(installFakeRuntime, { seed, canWrite: options.canWrite ?? true });
  await page.goto(APP_URL);
  await page.locator('#v .card').first().waitFor();
  await app.idle();
  return app;
}

/** Opens the built page where the claude.ai runtime is not available (the viewer is not signed in). */
export async function openWithoutRuntime(page: Page): Promise<App> {
  const app = new App(page);
  await page.route('https://cdnjs.cloudflare.com/**', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.addInitScript(() => {
    (window as unknown as { claude: unknown }).claude = { use: async () => null };
  });
  await page.goto(APP_URL);
  await page.locator('#v').waitFor();
  return app;
}
