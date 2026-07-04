import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url).pathname;

async function importPromptBuilder() {
  const dir = await mkdtemp(join(tmpdir(), 'brochure-prompt-'));
  const outfile = join(dir, 'buildBrochurePrompt.mjs');
  await build({
    entryPoints: [join(root, 'src/components/brochure-prompt/buildBrochurePrompt.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

test('buildBrochurePrompt embeds schedule brochure package data', async () => {
  const { buildBrochurePrompt } = await importPromptBuilder();
  const prompt = buildBrochurePrompt({
    agent: { name: 'Agen Test', phone: '6281234567890', website: 'alhijaz.test/agen' },
    pkg: null,
    schedule: {
      title: 'Brosur Paket Umroh Juli',
      filterLabel: 'Juli 2026 tersedia',
      pageIndex: 1,
      pageCount: 2,
      displayMode: 'seat',
      packages: [
        {
          nama: "PROMO JUM'ATAIN PLUS TAIF 12HR",
          tgl: '5 Juli 2026',
          hari: 12,
          seatSisa: 7,
          harga: 'mulai Rp 33.900.000',
          maskapai: 'SAUDIA',
          landing: 'Jeddah',
          hotel: ['Makkah: Movenpick (★★★★★)'],
        },
        {
          nama: 'RAHMAH 9HR',
          tgl: '12 Juli 2026',
          soldOut: true,
        },
      ],
      truncatedCount: 1,
    },
    contactSource: 'attached',
    extra: {},
    variant: 'redesign',
    kind: 'brosur',
    style: 'modern',
    ratio: '4:5',
    reserveQr: false,
  });

  assert.match(prompt, /Brosur Paket Umroh Juli/);
  assert.match(prompt, /vertical story 9:16/);
  assert.match(prompt, /visual-rich, cinematic, dan eye-catching/);
  assert.match(prompt, /filter Juli 2026 tersedia/);
  assert.match(prompt, /halaman 1 dari 2/);
  assert.match(prompt, /PROMO JUM'ATAIN PLUS TAIF 12 HARI/);
  assert.match(prompt, /7 seat/);
  assert.match(prompt, /mulai Rp 33\.900\.000/);
  assert.match(prompt, /SAUDIA/);
  assert.match(prompt, /SOLD OUT/);
  assert.match(prompt, /1 paket lain tidak tampil di halaman ini/);
  assert.match(prompt, /kontak agen sudah ada di brosur terlampir/i);
  assert.doesNotMatch(prompt, /0812-3456-7890/);
});

test('BrochureSchedulePage wires the AI recreate prompt modal', () => {
  const source = readFileSync(join(root, 'src/components/BrochureSchedulePage.tsx'), 'utf8');

  assert.match(source, /import\s+\{\s*BrochurePromptModal\s*\}\s+from\s+'\.\/BrochurePromptModal'/);
  assert.match(source, /useState<number \| null>\(null\)/);
  assert.match(source, /setPromptPageIndex\(index\)/);
  assert.match(source, />Buat Ulang AI</);
  assert.match(source, /<BrochurePromptModal/);
  assert.match(source, /schedule=\{promptPage && promptPageIndex !== null \? buildSchedulePromptData\(promptPage, promptPageIndex\) : null\}/);
  assert.match(source, /context="schedule"/);
});

test('BrochurePromptModal simplifies controls in schedule context', () => {
  const source = readFileSync(join(root, 'src/components/BrochurePromptModal.tsx'), 'utf8');

  assert.match(source, /const isScheduleContext = context === 'schedule'/);
  assert.match(source, /const promptRatio = isScheduleContext \? '9:16' : ratio/);
  assert.match(source, /contactSource: isScheduleContext \? 'attached' : 'explicit'/);
  assert.match(source, /\{!isScheduleContext && \(/);
  assert.match(source, /!isScheduleContext && \(\s*<div>[\s\S]*ariaLabel="Rasio brosur"/);
});
