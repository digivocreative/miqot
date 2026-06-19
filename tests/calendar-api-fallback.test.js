import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScheduleFallbackDetails,
  parseCalendarJadwalIds,
} from '../lib/calendar-schedule-fallback.js';

const schedule = {
  jadwal_id: 'JBU1532',
  jadwal_nama: "PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)",
  seat_total: '47',
  seat_sisa: '1',
  maskapai: 'SAUDIA',
  berangkat_tgl: '2026-07-05',
  berangkat_jam: '00.40',
  berangkat_kode_penerbangan: 'SV 827',
  pulang_tgl: '2026-07-19',
  pulang_jam: '07.35',
  pulang_kode_penerbangan: 'SV 816',
  manasik_tgl: '2026-06-20',
  manasik_jam: '08:00:00',
};

test('parseCalendarJadwalIds extracts only JBU ids from calendar apalah', () => {
  assert.deepEqual(
    parseCalendarJadwalIds(' JBU1532,foo,JBU1496, '),
    ['JBU1532', 'JBU1496'],
  );
});

test('buildScheduleFallbackDetails builds displayable manasik detail from schedule data', () => {
  const details = buildScheduleFallbackDetails(
    { type: 'manasik', apalah: 'JBU1532' },
    new Map([[schedule.jadwal_id, schedule]]),
  );

  assert.equal(details.length, 1);
  assert.equal(details[0].jadwal_id, 'JBU1532');
  assert.equal(details[0].pesawat, 'SAUDIA - SV 827');
  assert.equal(details[0].jam, '08:00:00');
  assert.equal(details[0].paket, "05/07/2026PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)");
  assert.equal(details[0].pax, 47);
  assert.equal(details[0].pax_terisi, 46);
});

test('buildScheduleFallbackDetails refuses partial fallback when a schedule id is missing', () => {
  const details = buildScheduleFallbackDetails(
    { type: 'keberangkatan', apalah: 'JBU1532,JBU9999' },
    new Map([[schedule.jadwal_id, schedule]]),
  );

  assert.deepEqual(details, []);
});
