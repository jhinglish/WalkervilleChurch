/**
 * Runs the original page (root index.html) and the TypeScript build (dist/index.html)
 * side by side against the same in-memory stand-in for the claude.ai runtime, drives
 * both through the same clicks and edits, and compares the page, the banner, the
 * highlighted tab, the database contents, saved files and PDF calls after every step.
 *
 * Needs a browser: run `npx playwright install chromium` once, then `npm run check:ui`.
 * Delete this folder, together with the root index.html, when the original is retired.
 *
 * One difference is expected and normalised: the original wrote the "Locked N
 * existing Sunday(s)" change-log line twice; the TypeScript build writes it once.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const seeds = require('./seed.cjs');
const ROOT = path.resolve(__dirname, '..', '..');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const CDN = fs.readFileSync(path.join(__dirname, 'cdn-stub.js'), 'utf8');
const PAGES = { legacy: 'file://' + path.join(ROOT, 'index.html'), port: 'file://' + path.join(ROOT, 'dist', 'index.html') };

async function open(browser, which, seed, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ contentType: 'application/javascript', body: CDN }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((s) => { window.__SEED__ = s; }, seed);
  if (opts.canWrite === false) await page.addInitScript(() => { window.__canWrite = false; });
  await page.addInitScript(MOCK);
  await page.goto(PAGES[which]);
  await page.waitForTimeout(250);
  return { page, errors, ctx };
}
const capture = (page) => page.evaluate(() => ({
  v: (() => { let seen = false; return document.querySelector('#v').innerHTML.replace(/<div class="l"><span class="mut">[^<]*<\/span> [^:<]*: Locked [^<]*<\/div>/g, (m) => (seen ? '' : ((seen = true), m))); })(),
  fl: document.querySelector('#fl').textContent,
  nav: [...document.querySelectorAll('nav button.on')].map((b) => b.textContent),
  db: (() => { const d = window.__dump(); let seen = false; for (const k of Object.keys(d).filter((k) => k.startsWith('history/')).sort()) { if (String(d[k].msg).startsWith('Locked ')) { if (seen) delete d[k]; seen = true; } } return d; })(),
  saves: window.__saves,
  pdf: window.__pdf ? window.__pdf.ops : null,
}));
function firstDiff(a, b) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  let i = 0; while (i < sa.length && sa[i] === sb[i]) i++;
  return `at ${i}\n  legacy: …${sa.slice(Math.max(0, i - 80), i + 160)}\n  port:   …${sb.slice(Math.max(0, i - 80), i + 160)}`;
}
const dc = (loc, page) => loc.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));

async function run(name, seed, steps, opts) {
  const browser = await chromium.launch();
  const A = await open(browser, 'legacy', seed, opts), B = await open(browser, 'port', seed, opts);
  let bad = 0, n = 0;
  const compare = async (label) => {
    const [x, y] = await Promise.all([capture(A.page), capture(B.page)]);
    n++;
    try { assert.deepStrictEqual(x, y); } catch { bad++; console.log(`MISMATCH [${name}] ${label}\n${firstDiff(x, y)}`); }
  };
  await compare('initial load');
  for (const [label, fn] of steps) {
    const res = [];
    for (const P of [A, B]) { try { await fn(P.page); res.push('ok'); } catch (e) { res.push('ERR ' + String(e).split('\n')[0]); } }
    if (res[0] !== res[1]) { bad++; console.log(`STEP RESULT DIFFERS [${name}] ${label}: legacy=${res[0]} port=${res[1]}`); }
    else if (res[0] !== 'ok') console.log(`(both failed) [${name}] ${label}: ${res[0]}`);
    await A.page.waitForTimeout(120); await B.page.waitForTimeout(120);
    await compare(label);
  }
  if (A.errors.length || B.errors.length) { console.log('page errors', { legacy: A.errors, port: B.errors }); }
  await browser.close();
  console.log(`${name}: ${n} states compared, ${bad} differences`);
  return bad + (B.errors.length ? 1 : 0);
}

const tab = (t) => (p) => p.click(`nav button[data-t="${t}"]`);
const click = (sel, o) => (p) => p.locator(sel).first().click(o);
const corner = { position: { x: 2, y: 2 } };
const fillChange = (sel, v) => async (p) => { const l = p.locator(sel).first(); await l.fill(String(v)); await dc(l, p); };

const scenarioA = [
  ['tab roster', tab('r')],
  ['generate', async (p) => { await p.click('#gen'); await p.waitForTimeout(500); }],
  ['tab serving', tab('s')],
  ['serving: edit on', click('#sedit')],
  ['serving: remove first name', click('[data-srm]')],
  ['serving: add person', async (p) => { await p.selectOption('#sa-wel', { index: 1 }); await p.click('button[data-sadd="wel"]'); }],
  ['serving: edit off', click('#sedit')],
  ['serving: verse', async (p) => { await p.fill('textarea[data-verse]', 'Psalm 23:1 The Lord is my shepherd'); await p.click('[data-vsave]'); }],
  ['serving: note', async (p) => { await p.fill('textarea[data-note]', 'Bring snacks'); await p.click('[data-nsave]'); }],
  ['serving: pdf', click('#pdf')],
  ['tab roster', tab('r')],
  ['roster: select chip', click('.chip[data-d="2027-01-10"][data-k="wel"]')],
  ['roster: move to tea', click('.drop[data-drop="tea"][data-d="2027-01-10"]', corner)],
  ['roster: select chip', click('.chip[data-d="2027-01-10"][data-k="tea"]')],
  ['roster: move to not serving', click('.drop[data-drop=""][data-d="2027-01-10"]', corner)],
  ['roster: deselect/select twice', async (p) => { const c = p.locator('.chip').first(); await c.click(); await c.click(); }],
  ['roster: regenerate (arm)', click('[data-regen="2027-01-17"]')],
  ['roster: regenerate (confirm)', click('[data-regen="2027-01-17"]')],
  ['roster: csv', click('#csv')],
  ['roster: show past', click('#past')],
  ['tab away', tab('a')],
  ['away: add', async (p) => { await p.selectOption('#ap', 'bob'); await p.fill('#af', '2027-01-24'); await p.fill('#at', '2027-01-31'); await p.fill('#an', 'trip <b>'); await p.click('#aadd'); }],
  ['away: add single day', async (p) => { await p.selectOption('#ap', 'cy'); await p.fill('#af', '2027-02-07'); await p.click('#aadd'); }],
  ['away: invalid range ignored', async (p) => { await p.fill('#af', '2027-03-07'); await p.fill('#at', '2027-03-01'); await p.click('#aadd'); }],
  ['away: remove first', click('[data-del]')],
  ['tab admin', tab('h')],
  ['admin: rename ministry', fillChange('input[data-mf="l"][data-mk="wel"]', 'Greeters')],
  ['admin: headcount', fillChange('input[data-mf="n"][data-mk="tea"]', 3)],
  ['admin: exclusive on', async (p) => { await p.locator('input[data-mf="x"][data-mk="wel"]').check(); }],
  ['admin: add ministry', async (p) => { await p.fill('#mn', 'Sound'); await p.fill('#mc', '2'); await p.check('#mx'); await p.click('#madd'); }],
  ['admin: remove ministry (arm)', click('[data-mrm="sec"]')],
  ['admin: remove ministry (confirm)', click('[data-mrm="sec"]')],
  ['admin: restore ministry', click('[data-mrs="com"]')],
  ['admin: add person', async (p) => { await p.fill('#pn', 'Lou Ann'); await p.fill('#pf', '3'); await p.click('#padd'); }],
  ['admin: add same name again', async (p) => { await p.fill('#pn', 'Lou Ann'); await p.click('#padd'); }],
  ['admin: eligibility on', async (p) => { await p.locator('input[data-pe="tea"][data-pid="gus"]').check(); }],
  ['admin: eligibility off', async (p) => { await p.locator('input[data-pe="tea"][data-pid="gus"]').uncheck(); }],
  ['admin: rename person', fillChange('input[data-pf="name"][data-pid="hal"]', 'Harold')],
  ['admin: family number', fillChange('input[data-pf="fam"][data-pid="hal"]', 5)],
  ['admin: remove person (arm)', click('[data-prm="ivy"]')],
  ['admin: remove person (confirm)', click('[data-prm="ivy"]')],
  ['admin: restore person', click('[data-prs="ivy"]')],
  ['tab record', tab('v')],
  ['record: open person', click('td[data-pick="ann"]')],
  ['record: threshold', fillChange('#thr', 2)],
  ['record: close person', click('td[data-pick="ann"]')],
  ['record: open flag', click('td[data-fl]')],
  ['record: remove in flag panel', click('[data-srm]')],
  ['record: add in flag panel', async (p) => { const sel = p.locator('select[id^="sa-"]').first(); await sel.selectOption({ index: 1 }); await p.locator('button[data-sadd]').first().click(); }],
  ['record: flag summary button', click('button[data-fl]')],
  ['record: choose Sunday for notes', async (p) => { const l = p.locator('#nsel'); await l.selectOption({ index: 2 }); await dc(l, p); }],
  ['record: verse+note', async (p) => { await p.fill('textarea[data-verse]', 'Romans 8'); await p.click('[data-vsave]'); await p.fill('textarea[data-note]', 'Note two'); await p.click('[data-nsave]'); }],
  ['busy: someone holds the lease', async (p) => { await p.evaluate(() => window.__hold('rosters/2027-01-24', true)); await p.selectOption('#nsel', '2027-01-24'); await p.fill('textarea[data-note]', 'x'); await p.click('[data-nsave]'); await p.waitForTimeout(400); }],
  ['busy: released', async (p) => { await p.evaluate(() => window.__hold('rosters/2027-01-24', false)); }],
  ['tab admin (change log)', tab('h')],
];

(async () => {
  let bad = 0;
  bad += await run('fresh', seeds.fresh(), scenarioA);
  bad += await run('legacy rosters (autoLock)', seeds.legacyRosters(), [['tab roster', tab('r')], ['tab record', tab('v')], ['tab serving', tab('s')], ['tab admin', tab('h')]]);
  bad += await run('viewer cannot write', seeds.legacyRosters(), [['tab roster', tab('r')]], { canWrite: false });
  console.log(bad === 0 ? '\nALL IDENTICAL' : `\n${bad} PROBLEM(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
