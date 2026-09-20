// airportCityName hidup di src/utils/journey.ts (TS, ber-alias '@'). Dibundel
// esbuild supaya tes paritas membandingkan dengan sumber ASLI, bukan salinan —
// kalau membandingkan dua salinan, keduanya bisa menyimpang bersama-sama tanpa
// tesnya pernah merah.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../..', import.meta.url).pathname;
const dir = await mkdtemp(join(tmpdir(), 'journey-city-'));
const outfile = join(dir, 'journey.mjs');
await build({
  entryPoints: [join(root, 'src/utils/journey.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  alias: { '@': join(root, 'src') },
  logLevel: 'silent',
});
export const { airportCityName } = await import(pathToFileURL(outfile).href);
