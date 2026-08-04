import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBerangkatMendatang, computeUmrohKomisi } from '../lib/laporan-stats.js';
import { enrichBerangkatRows } from '../lib/berangkat-enrich.js';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const statistikSource = readFileSync(new URL('../src/components/StatistikPage.tsx', import.meta.url), 'utf8');
const berangkatGroupsSource = readFileSync(new URL('../lib/berangkat-groups.js', import.meta.url), 'utf8');
const berangkatEnrichSource = readFileSync(new URL('../lib/berangkat-enrich.js', import.meta.url), 'utf8');
const berangkatGroupViewsSource = readFileSync(new URL('../src/components/berangkat/BerangkatGroupViews.tsx', import.meta.url), 'utf8');

test('buildBerangkatMendatang includes upcoming departures across Hijriah years within 60 days', () => {
  const rows = [
    {
      nama: 'Jamaah Kemarin',
      paket: 'Paket Lama',
      jk: 'L',
      tgl_berangkat: '2026-05-28',
      hijriah_year: '1447',
      sisa: 0,
      wa: null,
    },
    {
      nama: 'Jamaah 18 Juni',
      paket: 'Paket 1448',
      jk: 'L',
      tgl_berangkat: '2026-06-18',
      hijriah_year: '1448',
      sisa: 0,
      wa: null,
    },
    {
      nama: 'Jamaah 13 Juni',
      paket: 'Paket 1447',
      jk: 'P',
      tgl_berangkat: '2026-06-13',
      hijriah_year: '1447',
      sisa: 1000000,
      wa: '628123',
    },
    {
      nama: 'Jamaah Juli',
      paket: 'Paket Juli',
      jk: 'L',
      tgl_berangkat: '2026-07-01',
      hijriah_year: '1448',
      sisa: 0,
      wa: null,
    },
    {
      nama: 'Jamaah H+60',
      paket: 'Paket 60 Hari',
      jk: 'L',
      tgl_berangkat: '2026-07-28',
      hijriah_year: '1448',
      sisa: 0,
      wa: null,
    },
    {
      nama: 'Jamaah H+61',
      paket: 'Paket Luar Range',
      jk: 'L',
      tgl_berangkat: '2026-07-29',
      hijriah_year: '1448',
      sisa: 0,
      wa: null,
    },
  ];

  const result = buildBerangkatMendatang(rows, '2026-05-29');

  assert.equal(result.berangkatBulan, '60 hari ke depan');
  assert.equal(result.berangkatSegera, 4);
  assert.deepEqual(
    result.berangkatBulanIni.map(item => item.nama),
    ['Jamaah 13 Juni', 'Jamaah 18 Juni', 'Jamaah Juli', 'Jamaah H+60'],
  );
  assert.equal(result.berangkatBulanIni.at(-1).hari_lagi, 60);
});

test('buildBerangkatMendatang marks lunas for sisa <= 0 (incl. lebih bayar) and null', () => {
  const rows = [
    { nama: 'Lunas Pas', tgl_berangkat: '2026-06-10', sisa: 0 },
    { nama: 'Lebih Bayar', tgl_berangkat: '2026-06-11', sisa: -110700000 },
    { nama: 'Sisa Null', tgl_berangkat: '2026-06-12', sisa: null },
    { nama: 'Belum Lunas', tgl_berangkat: '2026-06-13', sisa: 1000000 },
  ];

  const result = buildBerangkatMendatang(rows, '2026-06-01');
  const lunasByNama = Object.fromEntries(
    result.berangkatBulanIni.map(item => [item.nama, item.lunas]),
  );

  assert.equal(lunasByNama['Lunas Pas'], true);
  assert.equal(lunasByNama['Lebih Bayar'], true);   // sisa<0 = overpaid → lunas
  assert.equal(lunasByNama['Sisa Null'], true);     // null = lunas (konvensi sistem)
  assert.equal(lunasByNama['Belum Lunas'], false);
});

test('buildBerangkatMendatang displays schedule name before short package tier', () => {
  const result = buildBerangkatMendatang([
    {
      nama: 'ACHMAD GUNAWAN',
      paket: 'HEMAT',
      jadwal_nama: 'PROMO UMRAH AKBAR 9HR',
      jk: 'L',
      tgl_berangkat: '2026-06-20',
      sisa: 0,
    },
  ], '2026-06-20');

  assert.equal(result.berangkatBulanIni[0].paket, 'PROMO UMRAH AKBAR 9HR');
});

test('buildBerangkatMendatang preserves schedule metadata for package grouping', () => {
  const result = buildBerangkatMendatang([
    {
      nama: 'ACHMAD NIZAM YUSUF',
      paket: 'HEMAT',
      jadwal_id: 'JBU1539',
      jadwal_nama: 'PROMO PLUS DUBAI + TAIF 11HR',
      tour_leader: 'LENI AULIANINGSIH',
      manasik_tgl: '2026-06-06',
      berangkat_kode_penerbangan: 'EK 357/809',
      jk: 'L',
      tgl_berangkat: '2026-06-20',
      sisa: 0,
    },
  ], '2026-06-20');

  assert.deepEqual(result.berangkatBulanIni[0], {
    nama: 'ACHMAD NIZAM YUSUF',
    paket: 'PROMO PLUS DUBAI + TAIF 11HR',
    jadwal_id: 'JBU1539',
    tour_leader: 'LENI AULIANINGSIH',
    manasik_tgl: '2026-06-06',
    manasik_jam: null,
    berangkat_kode_penerbangan: 'EK 357/809',
    itinerary_ready: false,
    jk: 'L',
    tgl_berangkat: '2026-06-20',
    hari_lagi: 0,
    lunas: true,
    sisa: 0,
    wa: undefined,
  });
});

test('buildBerangkatMendatang meneruskan itinerary_ready ke baris hasil', () => {
  // Dipakai detail Berangkat Mendatang untuk memutuskan tombol "Salin Link
  // Itinerary" muncul atau chip "Itinerary belum ada" — kalau field ini jatuh
  // dari proyeksi, tombolnya hilang diam-diam di kedua layar.
  const [row] = buildBerangkatMendatang([
    {
      nama: 'SITI AMINAH',
      paket: 'HEMAT',
      jadwal_id: 'JBU1539',
      itinerary_ready: true,
      jk: 'P',
      tgl_berangkat: '2026-06-20',
      sisa: 0,
    },
  ], '2026-06-20').berangkatBulanIni;

  assert.equal(row.itinerary_ready, true);
});

test('stats endpoint enriches upcoming departures with jadwal_nama', () => {
  // Anchor ke deklarasi rute /api/laporan/stats sendiri, bukan ke seluruh
  // serverSource — endpoint /api/calendar/berangkat-mendatang punya string
  // enrichment yang nyaris identik, jadi tanpa anchor ini keempat assert di
  // bawah tetap lolos meski blok enrichment /stats dihapus total.
  assert.match(serverSource, /app\.get\('\/api\/laporan\/stats', dbLoadShedGuard, authMiddleware[\s\S]{0,3600}id_jadwal:raw_data->>id_jadwal/);
  assert.match(serverSource, /app\.get\('\/api\/laporan\/stats', dbLoadShedGuard, authMiddleware[\s\S]{0,6200}getScheduleDetailMap/);
  // Blok enrichment-nya kini di lib/berangkat-enrich.js (dibagi dua endpoint),
  // jadi query kalender + mapping-nya di-assert di sana; yang tersisa di
  // server.js adalah pemanggilan loader bersama — tetap dijangkarkan ke rute
  // /stats supaya tak lolos kalau blok itu hilang dari endpoint ini.
  assert.match(serverSource, /app\.get\('\/api\/laporan\/stats', dbLoadShedGuard, authMiddleware[\s\S]{0,7500}loadEnrichedBerangkatRows\(\{[\s\S]{0,200}rows: bebRows/);
  assert.match(berangkatEnrichSource, /\.from\('calendar_events'\)[\s\S]{0,300}tour_leader/);
  assert.match(berangkatEnrichSource, /\.eq\('event_type', 'keberangkatan'\)/);
  assert.match(berangkatEnrichSource, /export function enrichBerangkatRows[\s\S]{0,600}scheduleDetailMap\.get\(row\.id_jadwal\)\?\.jadwal_nama/);
  assert.match(serverSource, /const enrichedBebRows = await loadEnrichedBerangkatRows/);
  assert.match(serverSource, /buildBerangkatMendatang\(enrichedBebRows, todayStr\)/);
});

test('both Berangkat Mendatang screens enrich rows through the same shared path', () => {
  // Kartu Statistik dan section kartu kalender dashboard menampilkan angka yang
  // sama kepada pengguna, jadi input buildBerangkatMendatang tidak boleh
  // menyimpang: keduanya WAJIB lewat loader bersama, bukan blok enrichment
  // sendiri-sendiri yang bisa diberi kolom/filter berbeda diam-diam.
  assert.match(serverSource, /app\.get\('\/api\/calendar\/berangkat-mendatang', dbLoadShedGuard, authMiddleware[\s\S]{0,2600}loadEnrichedBerangkatRows\(\{[\s\S]{0,200}rows: bebRows/);
  assert.equal((serverSource.match(/loadEnrichedBerangkatRows\(\{/g) || []).length, 2);
  // Tidak boleh ada lagi query kalender enrichment yang berdiri sendiri di
  // server.js — itulah duplikasi yang dihapus refactor ini.
  assert.doesNotMatch(serverSource, /select\('jadwal_id, event_date/);
  assert.doesNotMatch(serverSource, /calendarByJadwalId/);
});

test('enrichBerangkatRows joins schedule detail and the earliest keberangkatan event', () => {
  const scheduleDetailMap = new Map([
    ['JBU1539', {
      jadwal_nama: 'PROMO PLUS DUBAI + TAIF 11HR',
      manasik_tgl: '2026-06-06',
      manasik_jam: '09:00',
      berangkat_kode_penerbangan: 'EK 357/809',
    }],
  ]);
  const calendarRows = [
    { jadwal_id: 'JBU1539', event_date: '2026-06-21', tour_leader: 'TL SUSULAN' },
    { jadwal_id: 'JBU1539', event_date: '2026-06-20', tour_leader: 'LENI AULIANINGSIH' },
  ];

  const enriched = enrichBerangkatRows(
    [
      { nama: 'ACHMAD NIZAM YUSUF', paket: 'HEMAT', id_jadwal: 'JBU1539', sisa: 0 },
      { nama: 'TANPA JADWAL', paket: 'HEMAT', id_jadwal: null, sisa: 0 },
    ],
    { scheduleDetailMap, calendarRows },
  );

  assert.equal(enriched[0].jadwal_id, 'JBU1539');
  assert.equal(enriched[0].jadwal_nama, 'PROMO PLUS DUBAI + TAIF 11HR');
  assert.equal(enriched[0].manasik_tgl, '2026-06-06');
  assert.equal(enriched[0].manasik_jam, '09:00');
  assert.equal(enriched[0].berangkat_kode_penerbangan, 'EK 357/809');
  // event_date paling awal yang menang, bukan baris terakhir yang ditemui.
  assert.equal(enriched[0].tour_leader, 'LENI AULIANINGSIH');
  assert.equal(enriched[0].nama, 'ACHMAD NIZAM YUSUF');

  // Baris tanpa jadwal tetap ikut, metadata-nya null (bukan undefined/throw).
  assert.equal(enriched[1].jadwal_id, null);
  assert.equal(enriched[1].jadwal_nama, null);
  assert.equal(enriched[1].tour_leader, null);
  assert.equal(enriched.length, 2);
});

test('enrichBerangkatRows degrades to null tour_leader when calendar rows are missing', () => {
  // Jalur fail-soft: query kalender gagal → calendarRows kosong, daftar tetap
  // terbentuk tanpa TL, bukan endpoint yang ikut gagal.
  const enriched = enrichBerangkatRows(
    [{ nama: 'SITI', id_jadwal: 'JBU9999', sisa: 0 }],
    { scheduleDetailMap: new Map() },
  );

  assert.equal(enriched[0].tour_leader, null);
  assert.equal(enriched[0].jadwal_nama, null);
  assert.equal(enriched[0].jadwal_id, 'JBU9999');
});

test('Statistik page shows compact upcoming package rows with click-through detail modal', () => {
  assert.match(berangkatGroupsSource, /function buildBerangkatGroups/);
  assert.match(berangkatGroupViewsSource, /function BerangkatGroupSummaryRow/);
  assert.match(berangkatGroupsSource, /function getDestinationFlags/);
  assert.match(berangkatGroupViewsSource, /function DestinationFlags/);
  assert.match(berangkatGroupsSource, /Arab Saudi/);
  assert.match(berangkatGroupsSource, /Uni Emirat Arab/);
  assert.match(berangkatGroupsSource, /Turki/);
  assert.match(berangkatGroupsSource, /DUBAI/);
  assert.match(berangkatGroupsSource, /UAE/);
  assert.match(berangkatGroupsSource, /ABU DHABI/);
  assert.match(berangkatGroupsSource, /DESERT SAFARI/);
  assert.match(berangkatGroupsSource, /const matchedDestinationFlags = EXTRA_DESTINATION_FLAGS/);
  assert.match(berangkatGroupsSource, /matchedDestinationFlags\.length > 0 \? matchedDestinationFlags : \[SAUDI_DESTINATION_FLAG\]/);
  assert.match(statistikSource, /selectedBerangkatGroup/);
  assert.match(statistikSource, /Detail Keberangkatan/);
  assert.match(berangkatGroupViewsSource, /tour_leader/);
  assert.match(berangkatGroupViewsSource, /manasik_tgl/);
  assert.match(berangkatGroupViewsSource, /berangkat_kode_penerbangan/);
  assert.match(statistikSource, /max-h-\[calc\(100dvh-4rem\)\]/);
  assert.match(statistikSource, /className="min-h-0 overflow-y-auto"/);
  assert.match(berangkatGroupViewsSource, /function GroupMeta/);
  assert.match(berangkatGroupViewsSource, /className="flex items-center gap-2"/);
  assert.match(berangkatGroupViewsSource, /<DestinationFlags paket=\{group\.paket\} \/>[\s\S]*className="truncate[^"]*">\{group\.paket\}/);
  assert.match(berangkatGroupViewsSource, /const manasikLabel = group\.manasik_tgl\s*\?\s*fmtTglLong\(group\.manasik_tgl\)\s*:\s*null/);
  assert.match(berangkatGroupViewsSource, /className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2"/);
  assert.match(berangkatGroupViewsSource, /GroupMeta label="Berangkat"/);
  assert.match(berangkatGroupViewsSource, /GroupMeta label="Penerbangan"/);
  assert.match(berangkatGroupViewsSource, /GroupMeta label="Tour Leader"/);
  assert.match(berangkatGroupViewsSource, /GroupMeta label="Manasik"/);
  assert.match(berangkatGroupViewsSource, /function toWaTitleCase\(value: string \| null \| undefined\)/);
  assert.match(berangkatGroupViewsSource, /function buildBerangkatWaText\(item: BerangkatItem\)/);
  assert.match(berangkatGroupViewsSource, /const honorific = item\.jk === 'P' \? 'Ibu' : 'Bapak'/);
  assert.match(berangkatGroupViewsSource, /const jamaahName = toWaTitleCase\(item\.nama\)/);
  assert.match(berangkatGroupViewsSource, /const packageName = toWaTitleCase\(item\.paket \|\| 'Umroh'\)/);
  assert.match(berangkatGroupViewsSource, /Assalamualaikum \$\{honorific\} \*\$\{jamaahName\}\*, mau mengingatkan bahwa keberangkatan Umroh \$\{packageName\} dijadwalkan pada \$\{departureDate\}\./);
  assert.match(berangkatGroupViewsSource, /Dimohon \$\{honorific\} untuk mempersiapkan diri sebelum hari keberangkatan\./);
  assert.doesNotMatch(berangkatGroupViewsSource, /Berikut informasi keberangkatan umroh/);
  assert.match(berangkatGroupViewsSource, /const waNumber = normalizeWaNumber\(item\.wa\)/);
  assert.match(berangkatGroupViewsSource, /const waUrl = waNumber[\s\S]{0,120}wa\.me\/\$\{waNumber\}[\s\S]{0,120}buildBerangkatWaText\(item\)/);
  assert.match(berangkatGroupViewsSource, /aria-label=\{`Chat WhatsApp \$\{item\.nama\}`\}/);
  assert.match(berangkatGroupViewsSource, /\{showPackage \? \([\s\S]*item\.hari_lagi[\s\S]*\) : \(\s*waUrl \? \(/);
  assert.match(berangkatGroupViewsSource, /onSelect\(group\.key\)/);
  assert.match(berangkatGroupViewsSource, /<DestinationFlags paket=\{group\.paket\} \/>/);
  assert.match(berangkatGroupViewsSource, /truncate[\s\S]{0,100}\{group\.paket\}/);
  assert.match(berangkatGroupViewsSource, /CalendarDays/);
  assert.match(berangkatGroupViewsSource, /Users size=\{11\}[\s\S]{0,120}\{group\.count\} Jamaah/);
  assert.match(berangkatGroupViewsSource, /className="absolute inset-0 h-full w-full object-cover shadow-sm"/);
  assert.match(statistikSource, /const berangkatRangeLabel = data\?\.berangkatBulan \|\| '60 hari ke depan'/);
  assert.match(statistikSource, /const berangkatGroupPreview = berangkatGroups\.slice\(0, 4\)/);
  assert.match(statistikSource, /const \[showBerangkatGroupsModal, setShowBerangkatGroupsModal\] = useState\(false\)/);
  assert.match(statistikSource, /berangkatGroupPreview\.map\(group =>/);
  assert.match(statistikSource, /berangkatGroups\.length > berangkatGroupPreview\.length/);
  assert.match(statistikSource, /Lihat lainnya/);
  assert.match(statistikSource, /setShowBerangkatGroupsModal\(true\)/);
  assert.match(statistikSource, /title="Berangkat Mendatang"/);
  assert.match(statistikSource, /subtitle=\{`\$\{berangkatGroups\.length\} paket · \$\{berangkatRangeLabel\}`\}/);
  assert.match(statistikSource, /Berangkat Mendatang[\s\S]*Tren Jamaah Baru/);
  assert.doesNotMatch(berangkatGroupViewsSource, /line-clamp-2[\s\S]{0,100}\{group\.paket\}/);
  assert.doesNotMatch(statistikSource, /<Plane size=\{16\} className="text-blue-600 dark:text-blue-400" strokeWidth=\{2\.4\} \/>/);
  assert.doesNotMatch(statistikSource, /rounded-full bg-white text-\[8px\][\s\S]{0,80}ring-2/);
  assert.doesNotMatch(berangkatGroupViewsSource, /bg-emerald-50[\s\S]{0,160}\{group\.count\} jamaah/);
  assert.doesNotMatch(berangkatGroupViewsSource, /\{group\.count\} jamaah/);
  assert.doesNotMatch(statistikSource, /BerangkatGroupBlock key=\{group\.key\} group=\{group\} limit=\{2\}/);
  assert.doesNotMatch(statistikSource, /top-8 bottom-8/);
  assert.doesNotMatch(statistikSource, /className="flex-1 overflow-y-auto"/);
  assert.doesNotMatch(berangkatGroupViewsSource, /bg-gray-50\/60 dark:bg-slate-900\/25/);
  assert.doesNotMatch(berangkatGroupViewsSource, /GroupMeta label="TL"/);
  assert.doesNotMatch(berangkatGroupViewsSource, /grid grid-cols-2 gap-1\.5/);
  assert.doesNotMatch(berangkatGroupViewsSource, /rounded-lg border border-gray-100[\s\S]{0,120}bg-white\/70/);
});

test('Statistik page makes Estimasi Komisi collapsible without removing details', () => {
  assert.match(statistikSource, /const \[komisiExpanded, setKomisiExpanded\] = useState\(false\)/);
  assert.match(statistikSource, /aria-expanded=\{komisiExpanded\}/);
  assert.match(statistikSource, /setKomisiExpanded\(expanded => !expanded\)/);
  assert.match(statistikSource, /komisiExpanded \? 'Ringkas' : 'Detail'/);
  assert.match(statistikSource, /komisiExpanded \? 'block' : 'hidden'/);
  assert.match(statistikSource, /Sudah Cair[\s\S]*Belum Cair[\s\S]*Potensi[\s\S]*Komisi Cair Per Bulan/);
  assert.match(statistikSource, /ResponsiveContainer width="100%" height=\{160\}/);
  assert.doesNotMatch(statistikSource, /Estimasi Komisi[\s\S]{0,220}\{data\.totalJamaah\} jamaah/);
});

test('Statistik page aligns headline stat values before smaller trailing icons', () => {
  assert.match(statistikSource, /function HeadlineValueRow/);
  assert.match(statistikSource, /className="flex items-center justify-between gap-2 mb-2"/);
  assert.match(statistikSource, /w-7 h-7 rounded-lg/);
  assert.match(statistikSource, /text-\[22px\] font-bold leading-none/);
  assert.match(statistikSource, /<p className=\{`text-\[22px\] font-bold leading-none \$\{valueClassName\}`\}>\{children\}<\/p>[\s\S]*?<div className=\{`w-7 h-7 rounded-lg/);
  assert.match(statistikSource, /<HeadlineValueRow[\s\S]*?\{data\.totalJamaah\}[\s\S]*?<\/HeadlineValueRow>/);
  assert.match(statistikSource, /<HeadlineValueRow[\s\S]*?\{fmtRpShort\(data\.komisi\.sudahCair\)\}[\s\S]*?<\/HeadlineValueRow>/);
  assert.match(statistikSource, /<HeadlineValueRow[\s\S]*?\{data\.berangkatSegera\}[\s\S]*?<\/HeadlineValueRow>/);
  assert.match(statistikSource, /<HeadlineValueRow[\s\S]*?\+\{data\.jamaahBaru\}[\s\S]*?<\/HeadlineValueRow>/);
  assert.doesNotMatch(statistikSource, /function fmtRpShortNoPrefix/);
  assert.doesNotMatch(statistikSource, /<HeadlineValueRow[\s\S]*?\{fmtRpShortNoPrefix\(data\.komisi\.sudahCair\)\}[\s\S]*?<\/HeadlineValueRow>/);
  assert.doesNotMatch(statistikSource, /w-8 h-8 rounded-lg[\s\S]{0,180}<p className="text-2xl font-bold[\s\S]{0,120}Total Jamaah/);
});

test('computeUmrohKomisi excludes Belum DP rows from estimasi komisi', () => {
  const k = computeUmrohKomisi([
    { paket: 'REGULER Quad', bayar: 0, sisa: 30_000_000, tgl_berangkat: '2026-08-01', diskon_marketing: 0 },
    { paket: 'HEMAT Triple', bayar: 5_000_000, sisa: 20_000_000, tgl_berangkat: '2026-08-01', diskon_marketing: 0 },
    { paket: 'REGULER Quad', bayar: 45_000_000, sisa: 0, tgl_berangkat: '2026-08-01', diskon_marketing: 0 },
  ], '2026-06-20');

  assert.equal(k.totalKomisi, 3_100_000);
  assert.equal(k.sudahCair, 0);
  assert.equal(k.belumCair, 1_800_000);
  assert.equal(k.belumCairCount, 1);
  assert.equal(k.potensi, 1_300_000);
  assert.equal(k.potensiCount, 1);
  assert.deepEqual(k.breakdown.hemat, { count: 1, rate: 1_300_000, total: 1_300_000 });
  assert.deepEqual(k.breakdown.reguler, { count: 1, rate: 1_800_000, total: 1_800_000 });
});

test('computeUmrohKomisi only marks departed rows cair after lunas', () => {
  const k = computeUmrohKomisi([
    { paket: 'REGULER Quad', bayar: 5_000_000, sisa: 20_000_000, tgl_berangkat: '2026-06-01', diskon_marketing: 0 },
    { paket: 'HEMAT Triple', bayar: 30_000_000, sisa: 0, tgl_berangkat: '2026-06-01', diskon_marketing: 0 },
    { paket: 'REGULER Quad', bayar: 45_000_000, sisa: null, tgl_berangkat: '2026-06-01', diskon_marketing: 0 },
  ], '2026-06-20');

  assert.equal(k.totalKomisi, 4_900_000);
  assert.equal(k.sudahCair, 3_100_000);
  assert.equal(k.sudahCairCount, 2);
  assert.equal(k.belumCair, 0);
  assert.equal(k.potensi, 1_800_000);
  assert.equal(k.potensiCount, 1);

  const june = k.chartBulanan.find(row => row.bulan === '2026-06');
  assert.deepEqual(june, { bulan: '2026-06', total: 3_100_000, count: 2 });
});

test('computeUmrohKomisi treats departure day as already cair when lunas', () => {
  const k = computeUmrohKomisi([
    { paket: 'HEMAT Triple', bayar: 30_000_000, sisa: 0, tgl_berangkat: '2026-06-20', diskon_marketing: 0 },
  ], '2026-06-20');

  assert.equal(k.sudahCair, 1_300_000);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 0);

  const june = k.chartBulanan.find(row => row.bulan === '2026-06');
  assert.deepEqual(june, { bulan: '2026-06', total: 1_300_000, count: 1 });
});
