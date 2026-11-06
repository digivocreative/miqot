import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { buildSync } from 'esbuild';

// flightDelay.ts mengimpor modul .ts lain, jadi bundel dulu (transform saja
// meninggalkan import relatif yang tak bisa di-resolve dari data: URL).
async function importTsModule(path) {
  const entry = new URL(`../${path}`, import.meta.url).pathname;
  const { outputFiles } = buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}

const MODULE = 'src/lib/flightDelay.ts';

test('pesawat yang sudah terbang memakai delay tiba, bukan delay lepas landas', async () => {
  const { flightPhaseDelay } = await importTsModule(MODULE);

  // EK358 6 Nov 2026: lepas landas +3 menit, tiba 27 menit lebih awal.
  assert.equal(flightPhaseDelay({ status: 'en-route', delayed: 3, depDelayed: 3, arrDelayed: 0, depActual: '10:48' }), null);
  assert.deepEqual(
    flightPhaseDelay({ status: 'en-route', delayed: 3, depDelayed: 3, arrDelayed: 20 }),
    { minutes: 20, phase: 'arrival' },
  );
  assert.deepEqual(
    flightPhaseDelay({ status: 'landed', depDelayed: 40, arrDelayed: 25 }),
    { minutes: 25, phase: 'arrival' },
  );
});

test('sebelum berangkat memakai delay keberangkatan', async () => {
  const { flightPhaseDelay } = await importTsModule(MODULE);

  assert.deepEqual(
    flightPhaseDelay({ status: 'delayed', depDelayed: 45, arrDelayed: 30 }),
    { minutes: 45, phase: 'departure' },
  );
  // `delayed` = alias lama untuk payload tanpa depDelayed.
  assert.deepEqual(
    flightPhaseDelay({ status: 'scheduled', delayed: 15 }),
    { minutes: 15, phase: 'departure' },
  );
  // depActual terisi = sudah lepas landas walau status belum menyusul.
  assert.equal(flightPhaseDelay({ status: 'scheduled', depActual: '10:48', depDelayed: 3, arrDelayed: 0 }), null);
});

test('batal, nol, negatif, dan sampah tidak menampilkan delay', async () => {
  const { flightPhaseDelay } = await importTsModule(MODULE);

  assert.equal(flightPhaseDelay({ status: 'cancelled', depDelayed: 60 }), null);
  assert.equal(flightPhaseDelay({ status: 'scheduled', depDelayed: 0, delayed: 0 }), null);
  assert.equal(flightPhaseDelay({ status: 'en-route', arrDelayed: -27 }), null);
  assert.equal(flightPhaseDelay({ status: 'scheduled', depDelayed: 'x' }), null);
  assert.equal(flightPhaseDelay(null), null);
});

test('lepas landas dikenali dari status atau jam lepas landas aktual', async () => {
  const { flightHasDeparted } = await importTsModule(MODULE);

  assert.equal(flightHasDeparted({ status: 'en-route' }), true);
  assert.equal(flightHasDeparted({ status: 'landed' }), true);
  assert.equal(flightHasDeparted({ status: 'scheduled', depActual: '10:48' }), true);
  assert.equal(flightHasDeparted({ status: 'delayed' }), false);
  assert.equal(flightHasDeparted({ status: 'unverified' }), false);
  assert.equal(flightHasDeparted(null), false);
});

test('hint menyebut fase yang benar', async () => {
  const { flightDelayHint } = await importTsModule(MODULE);

  assert.equal(flightDelayHint({ minutes: 20, phase: 'arrival' }), 'Diperkirakan tiba terlambat 20 menit');
  assert.equal(flightDelayHint({ minutes: 45, phase: 'departure' }), 'Keberangkatan terlambat 45 menit');
});
