import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNikitaDemoFlights } from '../lib/demo-flights.js';
import { isNikitaFocusModeActive } from '../lib/nikita-focus-mode.js';

const at = iso => Date.parse(iso);
const statuses = nowMs => buildNikitaDemoFlights({ nowMs }).map(f => [f.flightNumber, f.status]);

test('demo 20 Okt 09:00–15:00 WIB: satu Terbang LIVE sepanjang jendela, satu Mendarat, dua Terjadwal', () => {
  for (const iso of ['2026-10-20T09:00:00+07:00', '2026-10-20T12:00:00+07:00', '2026-10-20T15:00:00+07:00']) {
    assert.deepEqual(statuses(at(iso)), [
      ['SV 824', 'landed'],
      ['SV 825', 'en-route'],
      ['GA 984', 'scheduled'],
      ['SV 826', 'scheduled'],
    ], iso);
  }
  const live = buildNikitaDemoFlights({ nowMs: at('2026-10-20T09:00:00+07:00') })[1];
  assert.equal(live.isLive, true);
  assert.ok(live.progress > 20 && live.progress < 40, `progress ${live.progress}`);
});

test('jadwal tetap per hari: progress hanya maju antar penyegaran, tak melompat mundur', () => {
  const a = buildNikitaDemoFlights({ nowMs: at('2026-10-20T10:00:00+07:00') })[1];
  const b = buildNikitaDemoFlights({ nowMs: at('2026-10-20T10:30:00+07:00') })[1];
  assert.equal(a.id, b.id);
  assert.equal(a.depTs, b.depTs);
  assert.ok(b.progress > a.progress);
});

test('jam & tanggal lokal bandara konsisten dengan durasi', () => {
  const [pulang, pergi, ga] = buildNikitaDemoFlights({ nowMs: at('2026-10-20T09:00:00+07:00') });
  // SV 824 JED 19 Okt 18:50 AST + 8j45 = 20 Okt 07:35 WIB.
  assert.equal(pulang.depDate, '2026-10-19T00:00:00');
  assert.equal(pulang.arrScheduled, '07:35');
  assert.equal(pulang.arrDate, '2026-10-20T00:00:00');
  // SV 825 CGK 06:30 WIB + 9j20 = 11:50 AST.
  assert.equal(pergi.arrScheduled, '11:50');
  // GA 984 CGK 17:30 WIB + 9j45 = 23:15 AST hari yang sama.
  assert.equal(ga.arrScheduled, '23:15');
  assert.equal(ga.arrDate, '2026-10-20T00:00:00');
  assert.equal(ga.depActual, null);
});

test('tak pernah Perlu Cek; WA jamaah = nomor agent; itinerary ikut paket asli', () => {
  const itin = { jadwalId: 'JBU1', itineraryUrl: 'https://x/a.pdf', itineraryTitle: 'PAKET' };
  for (const iso of ['2026-10-17T00:00:00+07:00', '2026-10-19T05:00:00+07:00', '2026-10-21T23:59:00+07:00']) {
    const flights = buildNikitaDemoFlights({ nowMs: at(iso), itineraries: { saudia: itin, garuda: itin }, waNumber: '62822900020' });
    for (const f of flights) {
      assert.notEqual(f.status, 'unverified');
      assert.ok(f.jamaah.length > 0);
      assert.ok(f.jamaah.every(j => j.wa === '62822900020'));
      assert.equal(f.itineraryUrl, 'https://x/a.pdf');
    }
  }
  assert.ok(buildNikitaDemoFlights({}).every(f => f.jamaah.every(j => j.wa === null)));
});

test('dummy hanya untuk nikita di jendela 17–21 Okt WIB', () => {
  assert.equal(isNikitaFocusModeActive('nikita', at('2026-10-20T09:00:00+07:00')), true);
  assert.equal(isNikitaFocusModeActive('bagas', at('2026-10-20T09:00:00+07:00')), false);
  assert.equal(isNikitaFocusModeActive('nikita', at('2026-10-22T00:00:00+07:00')), false);
});
