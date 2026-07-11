import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;

test('browser builds one image-only share item and keeps the prompt compact for clipboard transport', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-share-payload-'));
  const bundlePath = join(dir, 'promptBuilder.js');
  await build({
    entryPoints: [join(root, 'src/components/brochure-prompt/buildBrochurePrompt.ts')],
    outfile: bundlePath,
    bundle: true,
    format: 'iife',
    globalName: 'PromptBuilder',
    platform: 'browser',
    logLevel: 'silent',
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ path: bundlePath });
    const result = await page.evaluate(async () => {
      const packages = Array.from({ length: 10 }, (_, index) => ({
        nama: `PAKET UMROH RAHMAH ${index + 1} 12HR`,
        tgl: `${index + 1} September 2026`,
        harga: `mulai Rp ${33 + index}.900.000`,
      }));
      const prompt = PromptBuilder.buildNativeSharePrompt({
        agent: { name: 'Agen Test', phone: '6281234567890', website: 'alhijaz.test' },
        schedule: { title: 'Brosur September', packages },
        contactSource: 'attached',
        extra: {},
        variant: 'redesign',
        kind: 'brosur',
        style: 'futuristic',
        ratio: '9:16',
        reserveQr: false,
      });
      const file = new File([new Uint8Array([137, 80, 78, 71])], 'brosur.png', { type: 'image/png' });
      const shareData = PromptBuilder.buildSingleImageShareData(file);
      let received = null;
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: candidate => candidate.files?.length === 1,
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async candidate => { received = candidate; },
      });
      if (!navigator.canShare({ files: [file] })) throw new Error('canShare rejected image');
      await navigator.share(shareData);
      return {
        keys: Object.keys(received),
        fileCount: received.files.length,
        fileName: received.files[0].name,
        prompt,
      };
    });

    assert.deepEqual(result.keys, ['files']);
    assert.equal(result.fileCount, 1);
    assert.equal(result.fileName, 'brosur.png');
    assert.ok(result.prompt.length <= 1_800);
    assert.match(result.prompt, /Buat ulang brosur jadwal/);
    assert.match(result.prompt, /AKURASI/);
    assert.match(result.prompt, /Rp 39\.4 Juta/);
  } finally {
    await browser.close();
  }
});
