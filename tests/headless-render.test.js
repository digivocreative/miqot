import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEmbeddedFontCss, isAllowedAgentPhotoUrl, withRenderLock } from '../lib/headless-render.js';

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

test('agent photo host allow-list lives in one place for both renderers', () => {
  const cuacaRender = readFileSync(new URL('../lib/cuaca-share-render.js', import.meta.url), 'utf8');
  for (const [name, src] of [['card-export', cardExport], ['cuaca-share-render', cuacaRender]]) {
    assert.doesNotMatch(src, /new Set\(\['sb\.alhijaz\.co'/, `${name} menyimpan daftar host sendiri`);
    assert.match(src, /isAllowedAgentPhotoUrl/, `${name} tidak memakai pemeriksa bersama`);
  }
  assert.equal(isAllowedAgentPhotoUrl('https://sb.alhijaz.co/a.jpg'), true);
  assert.equal(isAllowedAgentPhotoUrl('https://ui-avatars.com/api/?name=A'), true);
  assert.equal(isAllowedAgentPhotoUrl('http://sb.alhijaz.co/a.jpg'), false);
  assert.equal(isAllowedAgentPhotoUrl('https://evil.example/a.jpg'), false);
});
