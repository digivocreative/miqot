/**
 * Kartu penerbangan tampilan web harus sepakat dengan PDF "Rencana Perjalanan":
 * keduanya membaca lib/itinerary-pdf.js (flightLegView), jadi jam yang tampil
 * tidak boleh berbeda antar permukaan.
 *
 * Temuan T-2 (spec 2026-08-13-itinerary-pdf-versi-kita-design.md): `pulang_jam`
 * di banyak jadwal berisi jam TIBA di Jakarta, bukan jam berangkat dari Jeddah,
 * sehingga kartu menampilkan "JED 16.00 → CGK 16:00" — dua angka identik yang
 * hanya terlihat beda karena pemisahnya (temuan T-3). Karena itu tes memeriksa
 * DAFTAR jam yang tampil, bukan kehadiran satu string tertentu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFlightCard, samplePaket, legSides, legHtml, countText, timesIn } from './fixtures/flight-card-render.js';

test('jam kembar berdiri di sisi kedatangan, bukan keberangkatan (T-2)', async () => {
  const { kiri, kanan } = legSides(
    await renderFlightCard({ paket: samplePaket(), arrivals: { berangkat: '21:15', pulang: '16:00' } }),
    'Pulang',
  );
  assert.deepEqual(timesIn(kanan), ['16:00']);
  assert.deepEqual(timesIn(kiri), [], 'jam tiba masih dicetak di bawah bandara keberangkatan');
  assert.equal(countText(kiri, '—'), 1, 'sisi keberangkatan yang jamnya tak diketahui harus bertanda —');
});

test('jam jadwal memakai titik dua seperti jam itinerary (T-3)', async () => {
  const { kiri, kanan } = legSides(
    await renderFlightCard({ paket: samplePaket(), arrivals: { berangkat: '21:15', pulang: null } }),
    'Berangkat',
  );
  assert.deepEqual(timesIn(kiri), ['15:50']);
  assert.deepEqual(timesIn(kanan), ['21:15']);
});

test('jam tiba yang berbeda tetap tampil di sisinya masing-masing', async () => {
  const { kiri, kanan } = legSides(
    await renderFlightCard({ paket: samplePaket(), arrivals: { berangkat: '21:15', pulang: '06.40' } }),
    'Pulang',
  );
  assert.deepEqual(timesIn(kiri), ['16:00']);
  assert.deepEqual(timesIn(kanan), ['06:40']);
});

test('tanpa data jam tiba, jam jadwal tetap di sisi keberangkatan', async () => {
  const { kiri, kanan } = legSides(
    await renderFlightCard({ paket: samplePaket(), arrivals: undefined }),
    'Pulang',
  );
  assert.deepEqual(timesIn(kiri), ['16:00']);
  assert.deepEqual(timesIn(kanan), []);
});

test('penanda hari "(+7)" tidak menyamar jadi jam keberangkatan', async () => {
  const { kiri, kanan } = legSides(
    await renderFlightCard({
      paket: samplePaket({
        kepulangan: { tgl: '2026-09-13', jam: ' (+7)', rute: 'JED - CGK', kodePenerbangan: 'SV 818' },
      }),
      arrivals: { berangkat: '21:15', pulang: '16:00' },
    }),
    'Pulang',
  );
  assert.equal(countText(kiri, '(+7)'), 0, 'penanda hari masih dicetak di kolom keberangkatan');
  assert.equal(countText(kiri, '—'), 1);
  assert.deepEqual(timesIn(kanan), ['16:00']);
});

test('bandara asal, tujuan, dan transit tetap dirender', async () => {
  const html = await renderFlightCard({
    paket: samplePaket({
      keberangkatan: { tgl: '2026-09-05', jam: '10.25', rute: 'CGK-DXB / DXB-JED', kodePenerbangan: 'EK 357' },
    }),
    arrivals: { berangkat: null, pulang: null },
  });
  const berangkat = legHtml(html, 'Berangkat');
  assert.equal(countText(berangkat, 'CGK'), 1);
  assert.equal(countText(berangkat, 'JED'), 1);
  assert.equal(countText(berangkat, 'via DXB'), 1);
  assert.equal(countText(berangkat, 'EK 357'), 1);
});
