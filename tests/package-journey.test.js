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
