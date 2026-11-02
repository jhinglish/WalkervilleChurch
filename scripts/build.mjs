/**
 * Builds the single self-contained page that claude.ai needs.
 *
 *   node scripts/build.mjs          production build -> dist/index.html (committed and published; no demo accounts)
 *   node scripts/build.mjs --e2e    browser-test build -> dist-e2e/index.html (keeps the demo accounts; never published)
 *
 * Bundles src/main.ts into one script and inlines it into src/index.html at the `<!-- @APP_SCRIPT@ -->` marker.
 * The only difference between the two builds is the `__DEMO_ACCOUNTS__` constant (see src/build-flags.d.ts),
 * which esbuild's `define` option sets to false for production, so the demo accounts in src/auth.ts are removed.
 * The script then checks the result: the production page must not contain the demo accounts and the browser-test
 * page must, so a build that is wrong either way stops here instead of being published or tested by mistake.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const MARKER = '<!-- @APP_SCRIPT@ -->';

/** Text that exists only in the demo accounts in src/auth.ts: their display names, salts and password hashes. */
const DEMO_MARKERS = [
  'Demo Elder',
  'Demo Team Leader',
  'Demo Member',
  'wv-elder-1',
  'wv-leader-1',
  'wv-member-1',
  '1440851cacd7b12eedcceca71057739c07f9908945e53cfc011caa1d4fd186fd',
  '126154c6af9883d15f288cda99789a023d7a6afb40de4c3cccc498ee25d6e380',
  '7820064a13c399dedd44d4a011cdf815a1894dee45f6d46f2715e6f8365f8c14',
];

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--e2e');
if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(' ')}. The only option is --e2e.`);
const e2e = args.includes('--e2e');
const outDir = e2e ? 'dist-e2e/' : 'dist/';

const shell = await readFile(new URL('src/index.html', root), 'utf8');
if (!shell.includes(MARKER)) throw new Error(`src/index.html is missing the ${MARKER} marker`);

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('src/main.ts', root))],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  outdir: fileURLToPath(new URL(outDir, root)),
  legalComments: 'none',
  logLevel: 'warning',
  define: { __DEMO_ACCOUNTS__: String(e2e) },
  // Folds `false ? DEMO_USERS : []` so the demo accounts are dropped. Does not rename or shorten anything.
  minifySyntax: true,
});
const output = bundle.outputFiles[0];
if (!output) throw new Error('esbuild produced no output');

const found = DEMO_MARKERS.filter((marker) => output.text.includes(marker));
if (e2e && found.length !== DEMO_MARKERS.length) {
  const missing = DEMO_MARKERS.filter((marker) => !found.includes(marker));
  throw new Error(
    `The browser-test build is missing the demo accounts (${missing.join(', ')}). If src/auth.ts changed them, update DEMO_MARKERS in scripts/build.mjs.`,
  );
}
if (!e2e && found.length > 0) {
  throw new Error(`The production build still contains the demo accounts (${found.join(', ')}). It must not be published.`);
}

// A literal "</script" inside the bundle would end the inline script early.
const script = output.text.replace(/<\/script/gi, '<\\/script');
const html = shell.replace(MARKER, () => `<script>\n${script}</script>`);

await mkdir(new URL(outDir, root), { recursive: true });
await writeFile(new URL(`${outDir}index.html`, root), html);
console.log(`Built ${outDir}index.html (${html.length} characters, ${e2e ? 'with' : 'without'} the demo accounts).`);
