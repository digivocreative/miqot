import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEmbeddedFontCss, withRenderLock } from '../lib/headless-render.js';

const cardExport = readFileSync(new URL('../lib/card-export.js', import.meta.url), 'utf8');

test('render lock runs one job at a time and survives a failing job', async () => {
  const log = [];
  const job = (name, ms, fail) => () => new Promise((res, rej) => {
    log.push(`start ${name}`);
    setTimeout(() => { log.push(`end ${name}`); fail ? rej(new Error(name)) : res(name); }, ms);
  });
  const a = withRenderLock(job('a', 30, true));
  const b = withRenderLock(job('b', 5));
  await assert.rejects(a, /a/);
  assert.equal(await b, 'b');
  assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b']);
});

test('font css embeds each face as base64 woff2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  writeFileSync(join(dir, 'X.woff2'), Buffer.from('abc'));
  const css = getEmbeddedFontCss([['Inter', 800, 'X.woff2']], dir);
  assert.equal(css, "@font-face{font-family:'Inter';font-style:normal;font-weight:800;src:url(data:font/woff2;base64,YWJj) format('woff2');}");
});

test('card export uses the shared lock and font helper', () => {
  assert.match(cardExport, /from '\.\/headless-render\.js'/);
  assert.match(cardExport, /return withRenderLock\(run\);/);
  assert.doesNotMatch(cardExport, /let renderLock/);
});
