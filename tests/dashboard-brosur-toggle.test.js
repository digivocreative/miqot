import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('../src/components/DashboardLayout.tsx', import.meta.url), 'utf8');

// Potongan sumber tombol HARI/SEAT di header Brosur: dari cabang render-nya
// sampai tombol dark mode (elemen header berikutnya yang punya penanda tetap).
//
// Sengaja TIDAK mengikat `&& (` sesudah nama tab: syaratnya sudah pernah
// bertambah (`readBrosurModeFromPath() === 'jadwal' &&`, mode Paket tidak punya
// kolom ke-3) dan pola lama diam-diam mengiris string kosong — assert di bawah
// tetap "lulus lewat" tanpa memeriksa apa pun sampai akhirnya gagal dengan
// pesan yang menyesatkan. Karena itu irisannya diperiksa lebih dulu.
const TOGGLE_BLOCK = /\{activeTab === 'brosur' &&[\s\S]*?\{\/\* Dark mode toggle \*\/\}/;

test('Brosur HARI/SEAT toggle buttons keep a small margin inside the toggle', () => {
  const toggleBlock = dashboardSource.match(TOGGLE_BLOCK)?.[0] ?? '';

  assert.ok(
    toggleBlock.includes("{mode === 'hari' ? 'HARI' : 'SEAT'}"),
    'jangkar irisan tidak lagi menemukan blok toggle HARI/SEAT di header Brosur — perbarui TOGGLE_BLOCK',
  );
  assert.match(toggleBlock, /className="flex items-center h-9 rounded-lg bg-gray-100 dark:bg-slate-800 p-0\.5 shrink-0"/);
  assert.match(toggleBlock, /className=\{`h-7 m-0\.5 px-2\.5 inline-flex items-center justify-center rounded-md/);
  assert.doesNotMatch(toggleBlock, /className=\{`h-full px-2\.5 inline-flex/);
  assert.doesNotMatch(toggleBlock, /className=\{`px-2\.5 py-1 rounded-md/);
});
