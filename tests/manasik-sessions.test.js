import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManasikSessions,
  normalizeManasikJam,
  pickDefaultSection,
  wibTodayKey,
  MANASIK_WINDOW_DAYS,
  MANASIK_MAX_LEAD_DAYS,
} from '../lib/manasik-sessions.js';
import { BERANGKAT_MENDATANG_WINDOW_DAYS } from '../lib/laporan-stats.js';

const TODAY = '2026-08-14';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function plusDays(n) {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

// Bentuknya mengikuti keluaran buildBerangkatGroups() apa adanya.
function grp({ paket, manasik_tgl, manasik_jam = '08:00:00', namas = ['A'], berangkat = plusDays(20) }) {
  return {
    key: `${paket}|${manasik_tgl}|${manasik_jam}`,
    jadwal_id: paket,
    itinerary_ready: false,
    paket,
    count: namas.length,
    tour_leader: null,
    manasik_tgl,
    manasik_jam,
    tgl_berangkat: berangkat,
    berangkat_kode_penerbangan: null,
    items: namas.map(nama => ({
      nama, paket, jk: 'L', tgl_berangkat: berangkat,
      hari_lagi: 20, lunas: true, sisa: 0, wa: null,
    })),
  };
}

test('paket berbeda pada tanggal + jam yang sama menjadi SATU sesi', () => {
  // Ini alasan pengelompokannya per tanggal+jam, bukan per paket: pada data
  // 2026-08-14, 8 dari 11 tanggal manasik dihadiri lebih dari satu paket.
  const sessions = buildManasikSessions([
    grp({ paket: 'PROMO PLUS BADAR 10HR', manasik_tgl: plusDays(1), namas: ['BUDI', 'ANI'] }),
    grp({ paket: 'PROMO UMRAH 9HR', manasik_tgl: plusDays(1), namas: ['CITRA'] }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].count, 3);
  assert.equal(sessions[0].groups.length, 2);
  assert.equal(sessions[0].items.length, 3);
});

test('jam berbeda pada tanggal yang sama menjadi DUA sesi', () => {
  // 19 Sep 2026 punya sesi 08:00 (4 paket) dan 08:30 (1 paket) di data nyata.
  const sessions = buildManasikSessions([
    grp({ paket: 'REGULER 9HR', manasik_tgl: plusDays(5), manasik_jam: '08:00:00' }),
    grp({ paket: 'PROMO PLUS DUBAI 10 HARI', manasik_tgl: plusDays(5), manasik_jam: '08:30:00' }),
  ], TODAY);

  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map(s => s.manasik_jam), ['08:00', '08:30']);
});

test('manasik dengan tanggal sentinel atau cacat dibuang', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'WAITINGLIST', manasik_tgl: '0000-00-00' }),
    grp({ paket: 'UMRAH PRIVAT 9HR', manasik_tgl: null }),
    grp({ paket: 'TANGGAL NGACO', manasik_tgl: '2026-02-31' }),
    grp({ paket: 'REGULER 9HR', manasik_tgl: plusDays(3) }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].groups[0].paket, 'REGULER 9HR');
});

test('manasik kemarin dibuang, manasik hari ini ikut dengan hari_lagi 0', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'SUDAH LEWAT', manasik_tgl: plusDays(-1) }),
    grp({ paket: 'HARI INI', manasik_tgl: TODAY }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].groups[0].paket, 'HARI INI');
  assert.equal(sessions[0].hari_lagi, 0);
});

test('batas jendela: hari terakhir ikut, sehari sesudahnya dibuang', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'TEPAT DI BATAS', manasik_tgl: plusDays(MANASIK_WINDOW_DAYS) }),
    grp({ paket: 'LEWAT BATAS', manasik_tgl: plusDays(MANASIK_WINDOW_DAYS + 1) }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].groups[0].paket, 'TEPAT DI BATAS');
  assert.equal(sessions[0].hari_lagi, MANASIK_WINDOW_DAYS);
});

test('jendela manasik tetap TURUNAN dari jendela berangkat, bukan angka dipaku', () => {
  // INVARIAN INTI, dan sengaja dirumuskan begini. Versi "MANASIK_WINDOW_DAYS +
  // MANASIK_MAX_LEAD_DAYS <= BERANGKAT_MENDATANG_WINDOW_DAYS" TIDAK BISA GAGAL:
  // karena jendelanya diturunkan (60 - X), asersinya jadi (60 - X) + X <= 60,
  // benar untuk X apa pun — guard hampa yang terlihat seperti perlindungan.
  //
  // Yang benar-benar bisa rusak adalah orang memaku 42 sebagai literal lalu
  // jendela berangkat digeser; sejak itu sesi di ujung jendela hilang diam-diam
  // karena jamaahnya tak pernah ter-fetch. Identitas inilah yang menahannya.
  assert.equal(
    MANASIK_WINDOW_DAYS,
    BERANGKAT_MENDATANG_WINDOW_DAYS - MANASIK_MAX_LEAD_DAYS,
    'MANASIK_WINDOW_DAYS harus diturunkan dari BERANGKAT_MENDATANG_WINDOW_DAYS, '
    + 'bukan ditulis sebagai angka tetap',
  );
  assert.ok(MANASIK_WINDOW_DAYS > 0, 'jendela manasik harus positif');
  assert.ok(
    MANASIK_MAX_LEAD_DAYS > 0 && MANASIK_MAX_LEAD_DAYS < BERANGKAT_MENDATANG_WINDOW_DAYS,
    'lead maks harus masuk akal terhadap jendela berangkat',
  );
});

test('manasik_jam kosong tidak menghilangkan sesi', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'TANPA JAM', manasik_tgl: plusDays(2), manasik_jam: null }),
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].manasik_jam, null);
  assert.equal(sessions[0].count, 1);
});

test('items terurut nama, count sama dengan jumlah items, sesi terurut tanggal', () => {
  const sessions = buildManasikSessions([
    grp({ paket: 'PAKET B', manasik_tgl: plusDays(9), namas: ['ZAINAL'] }),
    grp({ paket: 'PAKET A', manasik_tgl: plusDays(4), namas: ['SITI', 'AHMAD'] }),
  ], TODAY);

  assert.deepEqual(sessions.map(s => s.manasik_tgl), [plusDays(4), plusDays(9)]);
  assert.deepEqual(sessions[0].items.map(i => i.nama), ['AHMAD', 'SITI']);
  assert.equal(sessions[0].count, sessions[0].items.length);
});

test('normalizeManasikJam memangkas detik dan menolak nilai kosong', () => {
  assert.equal(normalizeManasikJam('08:00:00'), '08:00');
  assert.equal(normalizeManasikJam('08:30'), '08:30');
  assert.equal(normalizeManasikJam(''), null);
  assert.equal(normalizeManasikJam(null), null);
});

test('wibTodayKey memakai tanggal WIB, bukan UTC', () => {
  // 14 Agu 22:30 UTC = 15 Agu 05:30 WIB. Memakai tanggal perangkat/UTC
  // membuat batas jendela dan hari_lagi meleset sehari.
  assert.equal(wibTodayKey(new Date('2026-08-14T22:30:00Z')), '2026-08-15');
  assert.equal(wibTodayKey(new Date('2026-08-14T10:00:00Z')), '2026-08-14');
});

test('tour_leaders memuat TL berbeda dari semua paket dalam sesi, tanpa duplikat', () => {
  const sessions = buildManasikSessions([
    { ...grp({ paket: 'PAKET A', manasik_tgl: plusDays(3) }), tour_leader: 'BIRRUL SETIANINGSIH' },
    { ...grp({ paket: 'PAKET B', manasik_tgl: plusDays(3) }), tour_leader: 'AZIZAH MUKMININ' },
    { ...grp({ paket: 'PAKET C', manasik_tgl: plusDays(3) }), tour_leader: 'AZIZAH MUKMININ' },
  ], TODAY);

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].tour_leaders, ['AZIZAH MUKMININ', 'BIRRUL SETIANINGSIH']);
});

test('tour_leaders membuang yang null — placeholder sudah dibuang cleanTourLeader di hulu', () => {
  const sessions = buildManasikSessions([
    { ...grp({ paket: 'PAKET A', manasik_tgl: plusDays(3) }), tour_leader: null },
    { ...grp({ paket: 'PAKET B', manasik_tgl: plusDays(3) }), tour_leader: 'SISKA FADIA NURI' },
  ], TODAY);

  assert.deepEqual(sessions[0].tour_leaders, ['SISKA FADIA NURI']);

  const tanpaTl = buildManasikSessions([
    { ...grp({ paket: 'PAKET A', manasik_tgl: plusDays(3) }), tour_leader: null },
  ], TODAY);
  assert.deepEqual(tanpaTl[0].tour_leaders, []);
});

// ── pickDefaultSection: tab default kartu kalender ──
// Permintaan user 2026-08-16: tab yang tampil harus yang ADA datanya. Hari ini
// manasik diturunkan dari grup berangkat sehingga "berangkat kosong, manasik
// isi" belum bisa terjadi — tapi aturannya ditulis dari kedua daftar, bukan
// dari asumsi derivasi itu, supaya tetap benar kalau sumber manasik berubah.

test('pickDefaultSection memilih berangkat selama ada datanya', () => {
  const group = grp({ paket: 'REGULER 9HR', manasik_tgl: plusDays(3) });
  const sessions = buildManasikSessions([group], TODAY);
  assert.equal(pickDefaultSection([group], sessions), 'berangkat');
  assert.equal(pickDefaultSection([group], []), 'berangkat');
});

test('pickDefaultSection jatuh ke manasik saat berangkat kosong tapi manasik isi', () => {
  // Skenario yang diminta user: "tidak ada jamaah yang berangkat, namun di
  // manasik ada → yang ditampilkan adalah tab Manasik".
  const sessions = buildManasikSessions([
    grp({ paket: 'REGULER 9HR', manasik_tgl: plusDays(3) }),
  ], TODAY);
  assert.equal(pickDefaultSection([], sessions), 'manasik');
});

test('pickDefaultSection null saat dua-duanya kosong — section tak dirender', () => {
  // "Jika dua-duanya kosong, tidak perlu munculin 2 tab tersebut, biar
  // calendar saja" — null-lah yang dipakai komponen sebagai gerbang render.
  assert.equal(pickDefaultSection([], []), null);
  // Masukan cacat (fetch gagal → state belum berupa array) luruh ke null juga,
  // bukan melempar — section pelengkap tak boleh merusak kartu kalender.
  assert.equal(pickDefaultSection(null, undefined), null);
});

test('shares_date menandai sesi yang berbagi tanggal dengan sesi lain', () => {
  // 19 Sep 2026 punya sesi 08:00 DAN 08:30. Tanpa penanda ini, baris ringkas
  // keduanya tampil identik begitu jam dicabut dari baris metadatanya.
  const sessions = buildManasikSessions([
    grp({ paket: 'PAKET PAGI', manasik_tgl: plusDays(5), manasik_jam: '08:00:00' }),
    grp({ paket: 'PAKET SIANG', manasik_tgl: plusDays(5), manasik_jam: '08:30:00' }),
    grp({ paket: 'SENDIRIAN', manasik_tgl: plusDays(9), manasik_jam: '08:00:00' }),
  ], TODAY);

  assert.equal(sessions.length, 3);
  assert.deepEqual(sessions.map(s => s.shares_date), [true, true, false]);
});
