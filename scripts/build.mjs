/**
 * Builds the single self-contained page that claude.ai needs.
 *
 * Bundles src/main.ts into one script and inlines it into src/index.html at the
 * `<!-- @APP_SCRIPT@ -->` marker, writing dist/index.html. Run with `npm run build`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const MARKER = '<!-- @APP_SCRIPT@ -->';

const shell = await readFile(new URL('src/index.html', root), 'utf8');
if (!shell.includes(MARKER)) throw new Error(`src/index.html is missing the ${MARKER} marker`);

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('src/main.ts', root))],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  outdir: fileURLToPath(new URL('dist/', root)),
  legalComments: 'none',
  logLevel: 'warning',
});
const output = bundle.outputFiles[0];
if (!output) throw new Error('esbuild produced no output');

// A literal "</script" inside the bundle would end the inline script early.
const script = output.text.replace(/<\/script/gi, '<\\/script');
const html = shell.replace(MARKER, () => `<script>\n${script}</script>`);

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/index.html', root), html);
console.log(`Built dist/index.html (${html.length} characters).`);
