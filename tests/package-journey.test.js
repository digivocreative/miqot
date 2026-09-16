import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importJourneyModule() {
  const source = readFileSync(new URL('../src/utils/journey.ts', import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function makePackage(overrides = {}) {
  return {
    jadwalId: 'JBU1582',
    nama: "UMRAH EKONOMIS JUM'ATAIN PLUS TAIF 10HR",
    keberangkatan: { rute: 'CGK-DXB / DXB-MED' },
    kepulangan: { rute: 'JED-DXB / DXB-CGK' },
    ...overrides,
  };
}

test('authoritative JBU1582 itinerary order excludes Dubai transit and includes Taif', async () => {
  const { getPackageJourneySteps } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    journeyOrder: ['Madinah', 'Umroh', 'Tur Taif'],
    journeyOrderSource: 'itinerary',
  }));

  assert.deepEqual(steps.map(step => step.label), ['Madinah', 'Umroh', 'Tur Taif']);
});

test('authoritative itinerary order wins over misleading package name, hotel, and flight route', async () => {
  const { getPackageJourneySteps } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    nama: 'UMRAH PLUS DUBAI 11 HARI',
    journeyOrder: ['Madinah', 'Umroh', 'Tur Taif'],
    journeyOrderSource: 'itinerary',
  }), ['Dubai']);

  assert.deepEqual(steps.map(step => step.label), ['Madinah', 'Umroh', 'Tur Taif']);
});

test('authoritative itinerary can place a real Dubai tour after the Saudi journey', async () => {
  const { getPackageJourneySteps } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    journeyOrder: ['Madinah', 'Umroh', 'Tur Dubai'],
    journeyOrderSource: 'itinerary',
  }));

  assert.deepEqual(steps.map(step => step.label), ['Madinah', 'Umroh', 'Tur Dubai']);
});

test('legacy data without an authoritative marker keeps the safe package-name fallback', async () => {
  const { getPackageJourneySteps } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    nama: 'UMRAH PLUS DUBAI 11 HARI',
    journeyOrder: ['Madinah', 'Umroh'],
  }));

  assert.deepEqual(steps.map(step => step.label), ['Tur Dubai', 'Madinah', 'Umroh']);
});

// Paket baru belum punya cache itinerary, jadi kartunya memakai fallback
// nama+rute sampai parse pertama berjalan. Taif dijalankan dari Mekkah dan
// Badar dari Madinah, jadi keduanya harus menempel pada kotanya — bukan
// mengekor seluruh blok Saudi (JBU1623, 16 Sep 2026: kartu sempat menampilkan
// Umroh → Madinah → Tur Taif padahal itinerary menaruh Taif di hari ke-4).
test('fallback menambatkan Taif ke Mekkah dan Badar ke Madinah (paket Umroh dulu)', async () => {
  const { getPackageJourneySteps } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    jadwalId: 'JBU1623',
    nama: 'UMRAH HEMAT AKHIR TAHUN PLUS TAIF+BADAR 12HR',
    keberangkatan: { rute: 'CGK - JED' },
    kepulangan: { rute: 'MED - CGK' },
  }));

  assert.deepEqual(steps.map(step => step.label), ['Umroh', 'Tur Taif', 'Madinah', 'Ziarah Badar']);
});

test('fallback menambatkan Taif dan Badar juga pada paket Madinah dulu', async () => {
  const { getPackageJourneySteps } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    jadwalId: 'JBU1531',
    nama: "JUM'ATAIN PLUS TAIF + BADAR MIX PAKET UHUD & RAHMAH 12HR (KERETA CEPAT)",
    keberangkatan: { rute: 'CGK - MED' },
    kepulangan: { rute: 'JED - CGK' },
  }));

  assert.deepEqual(steps.map(step => step.label), ['Madinah', 'Ziarah Badar', 'Umroh', 'Tur Taif']);
});

// Red Sea sengaja TIDAK ditambatkan: ia tur Jeddah menjelang penerbangan
// pulang, jadi tempatnya memang di ekor rantai (JBU1610 hari ke-8).
test('fallback tetap menaruh Red Sea di ekor rantai', async () => {
  const { getPackageJourneySteps } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    jadwalId: 'JBU1610',
    nama: 'UMRAH PLUS REDSEA 9HR ( KERETA CEPAT)',
    keberangkatan: { rute: 'CGK - MED' },
    kepulangan: { rute: 'JED - CGK' },
  }));

  assert.deepEqual(steps.map(step => step.label), ['Madinah', 'Umroh', 'Tur Red Sea']);
});

// Tur luar Saudi tetap ditempatkan relatif terhadap blok Saudi, dan tur
// berpenambat menyisip di dalamnya tanpa saling menggeser.
test('fallback menggabungkan tur pra-Saudi dengan tur berpenambat', async () => {
  const { getPackageJourneySteps } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    jadwalId: 'JBU1562',
    nama: "PROMO JUM'ATAIN PLUS DUBAI+BADAR 11HR",
    keberangkatan: { rute: 'CGK-DXB / DXB-MED' },
    kepulangan: { rute: 'JED-DXB/DXB-CGK' },
  }), ['Dubai']);

  assert.deepEqual(steps.map(step => step.label), ['Tur Dubai', 'Madinah', 'Ziarah Badar', 'Umroh']);
});

test('getLandingStepIndex: rantai biasa mendarat di simpul pertama', async () => {
  const { getPackageJourneySteps, getLandingStepIndex } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    journeyOrder: ['Madinah', 'Umroh'],
    journeyOrderSource: 'itinerary',
    nama: 'UMRAH REGULER 9 HARI',
    keberangkatan: { rute: 'CGK-MED' },
    kepulangan: { rute: 'JED-CGK' },
  }));

  assert.equal(getLandingStepIndex(steps), 0);
});

test('getLandingStepIndex: tur pra-Saudi dilewati, bukan titik landing', async () => {
  const { getPackageJourneySteps, getLandingStepIndex } = await importJourneyModule();

  const steps = getPackageJourneySteps(makePackage({
    nama: 'UMRAH PLUS DUBAI 11 HARI',
    journeyOrder: ['Madinah', 'Umroh'],
  }));

  assert.deepEqual(steps.map(step => step.label), ['Tur Dubai', 'Madinah', 'Umroh']);
  assert.equal(getLandingStepIndex(steps), 1);
});

test('getLandingStepIndex: rantai kosong tidak punya simpul landing', async () => {
  const { getLandingStepIndex } = await importJourneyModule();

  assert.equal(getLandingStepIndex([]), -1);
});
