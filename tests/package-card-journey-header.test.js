import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPackageCard, samplePackage } from './fixtures/package-card-render.js';

/**
 * Kartu "Perjalanan" menggabungkan tiga hal yang dulu tersebar: judul rantai,
 * chip manasik, dan penanda landing. Tes ini membaca HASIL render (harness SSR),
 * bukan teks sumber, karena yang harus dikunci adalah apa yang terbaca jamaah —
 * bukan ejaan kelas Tailwind-nya.
 */

/** Potong HTML ke isi satu simpul rantai supaya assert tidak kena simpul lain. */
function landingStepHtml(html) {
  const start = html.indexOf('data-landing-step="true"');
  assert.notEqual(start, -1, 'tidak ada simpul ber-atribut data-landing-step');
  // Simpul berikutnya (atau konektor sesudahnya) menandai batas aman.
  const rest = html.slice(start);
  const next = rest.indexOf('<div class="mt-4 flex w-full');
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * Teks yang benar-benar terbaca — tag beserta atributnya dibuang. Perlu karena
 * lencana menyimpan "Mendarat di Madinah" di `title`, dan itu bukan kemubaziran
 * yang sedang diuji.
 */
function visibleText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

test('chip manasik memuat kata "Manasik" beserta tanggalnya', async () => {
  const { html } = await renderPackageCard({
    package: samplePackage({ manasikTanggal: '2026-08-16' }),
  });

  assert.match(html, /Manasik/);
  assert.match(html, /16 Agu 26/);
});

test('manasik tanpa tanggal tetap berlabel, isinya TBA', async () => {
  const { html } = await renderPackageCard({
    package: samplePackage({ manasikTanggal: '' }),
  });

  assert.match(html, /Manasik/);
  assert.match(html, /TBA/);
});

test('rute berakhir MED: lencana di simpul pertama, tanpa menulis "Madinah" dua kali', async () => {
  const { html } = await renderPackageCard({
    package: samplePackage({
      keberangkatan: { ...samplePackage().keberangkatan, rute: 'CGK - MED' },
      kepulangan: { ...samplePackage().kepulangan, rute: 'JED - CGK' },
    }),
  });

  const step = landingStepHtml(html);
  // Keterangan bandara ditekan karena sama dengan label simpulnya: "Madinah"
  // hanya boleh terbaca sekali di simpul ini.
  assert.equal(visibleText(step).match(/Madinah/g).length, 1);
  assert.match(step, /Mendarat di Madinah/);
});

test('rute berakhir JED: lencana di simpul "Umroh" dan bandaranya ditulis', async () => {
  const { html } = await renderPackageCard({
    package: samplePackage({
      keberangkatan: { ...samplePackage().keberangkatan, rute: 'CGK - JED' },
      kepulangan: { ...samplePackage().kepulangan, rute: 'MED - CGK' },
    }),
  });

  assert.match(visibleText(landingStepHtml(html)), /Umroh\s+Jeddah/);
});

test('tur pra-Saudi tidak mencuri lencana dari simpul Saudi pertama', async () => {
  const { html } = await renderPackageCard({
    package: samplePackage({
      nama: 'UMROH PLUS DUBAI 12 HARI',
      keberangkatan: { ...samplePackage().keberangkatan, rute: 'CGK - DXB / DXB - JED' },
      kepulangan: { ...samplePackage().kepulangan, rute: 'MED - CGK' },
    }),
  });

  // Tur Dubai dirender lebih dulu, tapi lencananya milik simpul Saudi pertama.
  assert.ok(html.indexOf('Tur Dubai') < html.indexOf('data-landing-step="true"'));
  assert.match(landingStepHtml(html), /Umroh/);
});

test('rantai kosong: kartu tetap membawa landing dan manasik', async () => {
  // Berangkat & pulang sama-sama lewat JED -> getSaudiLabelsFromRoute menyerah,
  // journeySteps kosong. Dulu kartunya disembunyikan; sekarang kartunya wajib
  // tetap ada, kalau tidak dua informasi ini hilang sama sekali.
  const { html } = await renderPackageCard({
    package: samplePackage({
      keberangkatan: { ...samplePackage().keberangkatan, rute: 'CGK - JED' },
      kepulangan: { ...samplePackage().kepulangan, rute: 'JED - CGK' },
    }),
  });

  assert.doesNotMatch(html, /data-landing-step/);
  assert.match(html, /Landing di/);
  assert.match(html, /Jeddah/);
  assert.match(html, /Manasik/);
});
