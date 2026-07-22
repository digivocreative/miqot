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
  assert.match(prompt, /mulai Rp 33\.9 Juta/);
  assert.match(prompt, /FORMAT HARGA: tampilkan harga dalam denominasi jutaan/);
  // Contoh format tidak boleh menyerupai angka harga & harus menegaskan sumbernya
  assert.match(prompt, /pola pada aturan ini cuma contoh penulisan, BUKAN harga/);
  assert.doesNotMatch(prompt, /Rp 33\.900\.000/);
  assert.match(prompt, /SAUDIA/);
  assert.match(prompt, /SOLD OUT/);
  assert.match(prompt, /1 paket lain tidak tampil di halaman ini/);
  assert.match(prompt, /kontak agen sudah ada di brosur terlampir/i);
  assert.doesNotMatch(prompt, /0812-3456-7890/);
});

test('buildBrochurePrompt embeds package brochure reference URL', async () => {
  const { buildBrochurePrompt } = await importPromptBuilder();
  const prompt = buildBrochurePrompt({
    agent: { name: 'Agen Test', phone: '6281234567890', website: 'alhijaz.test/agen' },
    pkg: {
      nama: 'REGULER 9HR',
      tgl: '12 Agustus 2026',
      harga: 'mulai Rp 30.500.000',
      mekkah: 'Movenpick (★★★★★)',
      madinah: 'Taiba Front (★★★★★)',
      maskapai: 'GARUDA',
    },
    schedule: null,
    referenceImageUrl: 'https://cdn.test/brosur/JBU1234.webp?v=abc123',
    contactSource: 'explicit',
    extra: {},
    variant: 'redesign',
    kind: 'brosur',
    style: 'modern',
    ratio: '4:5',
    reserveQr: false,
  });

  assert.match(prompt, /Saya sematkan link brosur paket umroh di bawah sebagai ACUAN ISI/);
  assert.match(prompt, /Link brosur referensi:\nhttps:\/\/cdn\.test\/brosur\/JBU1234\.webp\?v=abc123/);
  assert.match(prompt, /Jika link tidak bisa dibuka, jangan mengarang detail dari gambar/);
  assert.match(prompt, /REGULER 9 HARI/);
  assert.match(prompt, /mulai Rp 30\.5 Juta/);
  assert.match(prompt, /WhatsApp: 0812-3456-7890/);
  assert.doesNotMatch(prompt, /Saya lampirkan sebuah brosur paket umroh sebagai ACUAN ISI/);
});

test('brochure prompt exposes 12 distinct design styles', async () => {
  const { buildBrochurePrompt, DESIGN_STYLES } = await importPromptBuilder();
  assert.equal(DESIGN_STYLES.length, 12);
  assert.equal(new Set(DESIGN_STYLES.map(style => style.value)).size, 12);
  assert.equal(new Set(DESIGN_STYLES.map(style => style.label)).size, 12);
  for (const style of DESIGN_STYLES) {
    assert.ok(style.phrase.length >= 60, `${style.label} needs a specific visual direction`);
  }

  const prompt = buildBrochurePrompt({
    agent: { name: 'Agen Test', phone: '6281234567890', website: 'alhijaz.test/agen' },
    pkg: { nama: 'REGULER 9HR', harga: 'Rp 39.400.000' },
    extra: {},
    variant: 'redesign',
    kind: 'brosur',
    style: 'futuristic',
    ratio: '4:5',
    reserveQr: false,
  });
  assert.match(prompt, /Arah gaya terpilih — Futuristik glass \(WAJIB konsisten\)/);
  assert.match(prompt, /glassmorphism terkontrol/);
});

test('formatBrochurePrice normalizes full rupiah amounts into one-decimal millions', async () => {
  const { formatBrochurePrice } = await importPromptBuilder();
  assert.equal(formatBrochurePrice('Rp 39.400.000'), 'Rp 39.4 Juta');
  assert.equal(formatBrochurePrice('mulai Rp 33.950.000'), 'mulai Rp 34.0 Juta');
  assert.equal(formatBrochurePrice('Rp 39,4 juta'), 'Rp 39.4 Juta');
  assert.equal(formatBrochurePrice(30_500_000), 'Rp 30.5 Juta');
});

test('native share prompt stays safely inline and uses the attached image as source', async () => {
  const { buildNativeSharePrompt, CHATGPT_NATIVE_SHARE_SAFE_BUDGET } = await importPromptBuilder();
  const packages = Array.from({ length: 13 }, (_, index) => ({
    nama: `PROMO JUMATAIN PLUS TAIF DAN BADAR PAKET RAHMAH ${12 + (index % 3)}HR`,
    tgl: `${index + 1} September 2026`,
    hari: 12,
    seatSisa: 7 + index,
    harga: `mulai Rp ${33 + index}.900.000`,
    maskapai: 'SAUDIA AIRLINES',
    landing: 'Jeddah',
    hotel: ['Makkah: Movenpick Hajar Tower (★★★★★)', 'Madinah: Taiba Front Hotel (★★★★★)'],
  }));
  const prompt = buildNativeSharePrompt({
    agent: { name: 'Agen Test', phone: '6281234567890', website: 'alhijaz.test/agen' },
    schedule: { title: 'Brosur September 2026', displayMode: 'seat', packages },
    contactSource: 'attached',
    extra: {},
    variant: 'redesign',
    kind: 'brosur',
    style: 'futuristic',
    ratio: '9:16',
    reserveQr: false,
  });

  assert.ok(prompt.length <= CHATGPT_NATIVE_SHARE_SAFE_BUDGET, `native prompt is ${prompt.length} chars`);
  assert.match(prompt, /pertahankan SEMUA 13 baris paket dari gambar secara akurat/);
  assert.match(prompt, /HARGA — tampilkan dalam jutaan, satu desimal pakai titik/);
  assert.match(prompt, /ambil nilai dari SUMBER, jangan pakai angka contoh sebagai harga/);
  // Contoh format tidak boleh menyuntik angka harga konkret ke prompt
  assert.doesNotMatch(prompt, /39\.400\.000|39\.4 Juta/);
  assert.match(prompt, /Futuristik glass/);
  assert.doesNotMatch(prompt, /1\. PROMO JUMATAIN/);
});

test('ChatGPT native share payload contains the brochure image and prompt text', async () => {
  const { buildImageAndPromptShareData } = await importPromptBuilder();
  const image = { name: 'brosur.png', type: 'image/png' };
  const payload = buildImageAndPromptShareData(image, 'Buat ulang brosur ini.');

  assert.deepEqual(Object.keys(payload), ['files', 'text']);
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0], image);
  assert.equal(payload.text, 'Buat ulang brosur ini.');
});

test('PackageCard passes brochure URL into the AI recreate prompt', () => {
  const source = readFileSync(join(root, 'src/components/PackageCard.tsx'), 'utf8');

  assert.match(source, /<BrochurePromptModal/);
  assert.match(source, /referenceImageUrl=\{brosurImageUrl \|\| pkg\.brosurUrl \|\| null\}/);
});

test('BrochurePromptModal shares the image and prompt through the native share sheet', () => {
  const source = readFileSync(join(root, 'src/components/BrochurePromptModal.tsx'), 'utf8');

  assert.match(source, /function safeImageFilename/);
  assert.match(source, /async function fetchReferenceImageFile/);
  assert.match(source, /async function writeTextToClipboard/);
  assert.match(source, /function copyTextSynchronously/);
  assert.match(source, /getReferenceImageFile\?: \(\(\) => Promise<File \| null>\) \| null/);
  assert.match(source, /const canTryNativeChatGPTShare =/);
  assert.match(source, /Boolean\(toAbsoluteUrl\(referenceImageUrl\) \|\| getReferenceImageFile\)/);
  assert.match(source, /const nativeSharePrompt = useMemo/);
  assert.match(source, /buildNativeSharePrompt\(\{/);
  assert.match(source, /const file = getReferenceImageFile/);
  assert.match(source, /buildImageAndPromptShareData\(file, nativeSharePrompt\)/);
  assert.match(source, /navigator\.canShare\?\.\(shareData\)/);
  assert.match(source, /navigator\.share\(shareData\)/);
  assert.match(source, /file_count: shareData\.files\?\.length \|\| 0/);
  assert.match(source, /prompt_transport: 'share_text'/);
  assert.match(source, /payload_fields: Object\.keys\(shareData\)\.sort\(\)\.join\(','\)/);
  assert.match(source, /setPreparedReferenceFile\(file\)/);
  assert.doesNotMatch(source, /Pilih ChatGPT di menu berbagi/);
  assert.match(source, /isNativeSharePending[\s\S]{0,120}\? 'Menyiapkan\.\.\.'[\s\S]{0,80}: 'ChatGPT'/);
});

test('BrochureSchedulePage wires the AI recreate prompt modal', () => {
  const source = readFileSync(join(root, 'src/components/BrochureSchedulePage.tsx'), 'utf8');

  assert.match(source, /import\s+\{\s*BrochurePromptModal\s*\}\s+from\s+'\.\/BrochurePromptModal'/);
  assert.match(source, /useState<number \| null>\(null\)/);
  assert.match(source, /setPromptPageIndex\(index\)/);
  assert.match(source, />Buat Ulang AI</);
  assert.match(source, /async function buildPromptReferenceFile\(pageIndex: number\): Promise<File \| null>/);
  assert.match(source, /<BrochurePromptModal/);
  assert.match(source, /schedule=\{promptPage && promptPageIndex !== null \? buildSchedulePromptData\(promptPage, promptPageIndex\) : null\}/);
  assert.match(source, /getReferenceImageFile=\{promptPageIndex !== null \? \(\) => buildPromptReferenceFile\(promptPageIndex\) : null\}/);
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

test('brochure design style dropdown shows all style choices without search UI', () => {
  const modal = readFileSync(join(root, 'src/components/BrochurePromptModal.tsx'), 'utf8');
  const dropdown = readFileSync(join(root, 'src/components/FilterDropdown.tsx'), 'utf8');

  assert.match(modal, /ariaLabel="Gaya desain brosur"[\s\S]{0,180}searchable=\{false\}/);
  assert.match(dropdown, /searchable\?: boolean/);
  assert.match(dropdown, /const showSearch = searchable && !showAllOptions && options\.length >= 8/);
});
