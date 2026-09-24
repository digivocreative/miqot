import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_TYPES,
  PACKAGE_TYPE_KERETA_CEPAT,
  PACKAGE_TYPE_UMROH_JUMATAIN,
  PACKAGE_TYPE_UMROH_MUSIM_DINGIN,
  PACKAGE_TYPE_UMROH_PROMO,
  PACKAGE_TYPE_UMROH_RAHMAH,
  PACKAGE_TYPE_UMROH_RAMADHAN,
  PACKAGE_TYPE_UMROH_SAJA,
  brochureTypeSubject,
  derivePackageType,
  getMusimDinginWindow,
  hasJumatain,
  hasKeretaCepat,
  isMusimDinginDeparture,
  isRamadhanDeparture,
  listPackageTypeOptions,
  matchesPackageType,
  packageTypeFromSlug,
  packageTypeLabel,
  packageTypeSlug,
  umrohTypeSubject,
} from '../src/lib/packageType.js';

// Roster "Tipe Paket" dipakai BERSAMA halaman Brosur dan filter Tipe Paket di
// jadwal publik. Tes ini yang menjaga keduanya tidak menyimpang: nama paket di
// Brosur sudah lewat cleanBrochurePackageName, di Jadwal masih mentah.

const WIN_2026 = { yearOfDec: 2026 };

function subject(nama, extra = {}) {
  return { nama, isPromo: false, departureIso: '2026-10-01', tiers: [], ...extra };
}

test('derivePackageType: first-match-wins, ekstensi luar negeri menang atas lokal KSA', () => {
  assert.equal(derivePackageType('PROMO MILAD PLUS DUBAI + TAIF 12HR'), 'PLUS DUBAI');
  assert.equal(derivePackageType('PLUS BADAR+REDSEA 10HR'), 'PLUS REDSEA');
  assert.equal(derivePackageType('PLUS TURKEY 15HR'), 'PLUS TURKI');
  assert.equal(derivePackageType('PLUS CAIRO + ALEXANDRIA 12HR'), 'PLUS MESIR');
  assert.equal(derivePackageType('REGULER 9HR'), PACKAGE_TYPE_UMROH_SAJA);
  assert.equal(derivePackageType(''), PACKAGE_TYPE_UMROH_SAJA);
  assert.equal(derivePackageType(null), PACKAGE_TYPE_UMROH_SAJA);
});

test('derivePackageType: paket ber-PLUS tidak lagi bocor ke "Umroh Saja"', () => {
  // Dua nama NYATA di jadwal 1448 yang dulu jatuh ke UMROH SAJA: AWAPI mengeja
  // "HAIKO" (tanpa U) dan "AL ULA" tak punya pola sama sekali. Di halaman publik
  // itu terbaca sebagai paket non-PLUS.
  assert.equal(derivePackageType('UMRAH EKONOMIS PLUS HAIKO 12HR'), 'PLUS HAIKOU');
  assert.equal(derivePackageType('UMRAH EKONOMIS PLUS HAIKOU 12HR'), 'PLUS HAIKOU');
  assert.equal(derivePackageType('UMRAH EKONOMIS PLUS AL ULA 9HR'), 'PLUS AL ULA');
  assert.equal(derivePackageType('UMRAH PLUS ALULA 9HR'), 'PLUS AL ULA');
});

test('derivePackageType: destinasi di luar roster tetap fail-open ke Umroh Saja', () => {
  // Sengaja: paket yang tak masuk opsi mana pun tidak bisa ditemukan sama sekali,
  // jadi kategori salah lebih baik daripada hilang.
  assert.equal(derivePackageType('UMRAH PLUS JORDAN 12HR'), PACKAGE_TYPE_UMROH_SAJA);
});

test('hasKeretaCepat: toleran spasi ganda, menolak tanpa spasi', () => {
  assert.equal(hasKeretaCepat('PLUS TURKEY 15HR ( KERETA  CEPAT)'), true);
  assert.equal(hasKeretaCepat('REGULER 9HR (KERETA CEPAT)'), true);
  assert.equal(hasKeretaCepat('REGULER 9HR (KERETACEPAT)'), false);
  assert.equal(hasKeretaCepat(undefined), false);
});

test('getMusimDinginWindow: musim dingin TERDEKAT relatif hari ini', () => {
  assert.deepEqual(getMusimDinginWindow(new Date('2026-08-12T00:00:00Z')), { yearOfDec: 2026 });
  assert.deepEqual(getMusimDinginWindow(new Date('2026-12-05T00:00:00Z')), { yearOfDec: 2026 });
  // Januari = musim yang sedang berjalan, bukan yang berikutnya.
  assert.deepEqual(getMusimDinginWindow(new Date('2027-01-20T00:00:00Z')), { yearOfDec: 2026 });
});

test('isMusimDinginDeparture: hanya Des(Y)+Jan(Y+1), dengan guard tanggal meluap', () => {
  assert.equal(isMusimDinginDeparture('2026-12-27', WIN_2026), true);
  assert.equal(isMusimDinginDeparture('2027-01-05', WIN_2026), true);
  assert.equal(isMusimDinginDeparture('2026-01-05', WIN_2026), false); // musim dingin SEBELUMNYA
  assert.equal(isMusimDinginDeparture('2027-12-20', WIN_2026), false); // musim dingin BERIKUTNYA
  assert.equal(isMusimDinginDeparture('2026-11-30', WIN_2026), false);
  // '2026-11-31' di-parse jadi 1 Des — tanpa round-trip guard ia lolos jadi musim dingin.
  assert.equal(isMusimDinginDeparture('2026-11-31', WIN_2026), false);
  assert.equal(isMusimDinginDeparture('27-12-2026', WIN_2026), false);
  assert.equal(isMusimDinginDeparture('', WIN_2026), false);
});

test('Umroh Promo: flag promo ATAU token PROMO di nama', () => {
  const byFlag = subject('UMRAH HEMAT 9HR ( KERETA CEPAT)', { isPromo: true });
  const byName = subject('PROMO MILAD PLUS BADAR 10HR');
  const neither = subject('REGULER 9HR');
  assert.equal(matchesPackageType(byFlag, PACKAGE_TYPE_UMROH_PROMO, WIN_2026), true);
  assert.equal(matchesPackageType(byName, PACKAGE_TYPE_UMROH_PROMO, WIN_2026), true);
  assert.equal(matchesPackageType(neither, PACKAGE_TYPE_UMROH_PROMO, WIN_2026), false);
});

test('Umroh Rahmah ditentukan TIER yang dijual, bukan nama paket', () => {
  // JBU1485 nyata: menjual UHUD+RAHMAH tapi namanya tak menyebut RAHMAH.
  const sellsWithoutSayingIt = subject('REGULER 9HR (KERETA CEPAT)', { tiers: ['UHUD', 'RAHMAH'] });
  assert.equal(matchesPackageType(sellsWithoutSayingIt, PACKAGE_TYPE_UMROH_RAHMAH, WIN_2026), true);

  // Sebaliknya: nama menyebut RAHMAH tapi tier-nya tidak dijual → bukan anggota.
  const saysWithoutSelling = subject('UMRAH REGULER PAKET RAHMAH 9HR', { tiers: ['UHUD'] });
  assert.equal(matchesPackageType(saysWithoutSelling, PACKAGE_TYPE_UMROH_RAHMAH, WIN_2026), false);

  // Nama tier dinormalisasi (spasi & huruf besar-kecil diabaikan).
  const spaced = subject('MIX 12HR', { tiers: ['rahmah '] });
  assert.equal(matchesPackageType(spaced, PACKAGE_TYPE_UMROH_RAHMAH, WIN_2026), true);
});

test('tiers null = TIDAK DIKETAHUI → jatuh balik ke uji nama (respons brosur versi lama)', () => {
  const unknown = subject('UMRAH REGULER PAKET RAHMAH 9HR', { tiers: null });
  assert.equal(matchesPackageType(unknown, PACKAGE_TYPE_UMROH_RAHMAH, WIN_2026), true);
  const unknownNoToken = subject('REGULER 9HR', { tiers: null });
  assert.equal(matchesPackageType(unknownNoToken, PACKAGE_TYPE_UMROH_RAHMAH, WIN_2026), false);
  // tiers [] = tahu tidak menjual tier apa pun → JANGAN jatuh ke nama.
  const knownEmpty = subject('UMRAH REGULER PAKET RAHMAH 9HR', { tiers: [] });
  assert.equal(matchesPackageType(knownEmpty, PACKAGE_TYPE_UMROH_RAHMAH, WIN_2026), false);
});

test('Kereta Cepat itu fasilitas: satu paket bisa sekaligus Plus Turki', () => {
  const both = subject('PLUS TURKEY 15HR ( KERETA CEPAT)');
  assert.equal(matchesPackageType(both, PACKAGE_TYPE_KERETA_CEPAT, WIN_2026), true);
  assert.equal(matchesPackageType(both, 'PLUS TURKI', WIN_2026), true);
  // Justru karena itu ia tidak boleh masuk PACKAGE_TYPES (yang eksklusif).
  assert.equal(PACKAGE_TYPES.some(t => t.value === PACKAGE_TYPE_KERETA_CEPAT), false);
});

test('isRamadhanDeparture: jendela Ramadhan 1448 H, 7 hari sebelum s/d 5 hari sesudah', () => {
  // Ramadhan 1448 H (Umm al-Qura) = 8 Feb 2027 s/d 8 Mar 2027, jadi jendela
  // berpaddingnya 1 Feb 2027 s/d 13 Mar 2027. Batasnya INKLUSIF di dua sisi.
  assert.equal(isRamadhanDeparture('2027-01-31'), false);
  assert.equal(isRamadhanDeparture('2027-02-01'), true);
  assert.equal(isRamadhanDeparture('2027-02-08'), true);  // 1 Ramadhan
  assert.equal(isRamadhanDeparture('2027-03-08'), true);  // 29 Ramadhan (hari terakhir)
  assert.equal(isRamadhanDeparture('2027-03-13'), true);
  assert.equal(isRamadhanDeparture('2027-03-14'), false);

  // Tabel jendelanya hanya memuat 1448 H. Ramadhan 1449 (~28 Jan 2028) belum
  // terdaftar, jadi paket 2028 TIDAK ikut — sengaja, supaya tidak ada tahun yang
  // masuk diam-diam tanpa tanggalnya diperiksa manusia.
  assert.equal(isRamadhanDeparture('2028-02-01'), false);

  // Guard yang sama dengan isMusimDinginDeparture: format salah & tanggal meluap.
  assert.equal(isRamadhanDeparture('2027-02-30'), false);
  assert.equal(isRamadhanDeparture('08-02-2027'), false);
  assert.equal(isRamadhanDeparture(''), false);
  assert.equal(isRamadhanDeparture(null), false);
});

test('Umroh Ramadhan itu jendela tanggal, bukan nama paket', () => {
  // Empat nama NYATA dari jadwal 1448. "HEMAT SYABAN" tidak menyebut Ramadhan
  // sama sekali tapi berangkat 3 Feb & pulang 11 Feb — itulah gunanya padding
  // 7 hari di depan. Sebaliknya paket bernama Ramadhan di luar jendela (tidak
  // ada di 1448, tapi aturannya harus jelas) TIDAK ikut.
  const ramadhan = type => s => matchesPackageType(s, PACKAGE_TYPE_UMROH_RAMADHAN, WIN_2026) === type;

  assert.ok(ramadhan(true)(subject("UMRAH JUM'ATAIN RAMADHAN PLUS BADAR 12HR (KERETA CEPAT)", { departureIso: '2027-02-02' })));
  assert.ok(ramadhan(true)(subject('UMRAH HEMAT SYABAN 9HR ( KERETA CEPAT)', { departureIso: '2027-02-03' })));
  assert.ok(ramadhan(true)(subject('UMRAH LAILATUL QADR 17HR ( KERETA CEPAT)', { departureIso: '2027-02-22' })));
  assert.ok(ramadhan(false)(subject("UMRAH JUM'ATAIN RAMADHAN 12HR", { departureIso: '2026-10-01' })));
});

test('Umroh Ramadhan tidak eksklusif: satu paket bisa sekaligus Plus Badar', () => {
  // Pola yang sama dengan Kereta Cepat & Musim Dingin — karena itu ia tidak
  // boleh lewat derivePackageType yang memilih SATU tipe per paket.
  const both = subject("UMRAH JUM'ATAIN RAMADHAN PLUS BADAR 12HR (KERETA CEPAT)", { departureIso: '2027-02-02' });
  assert.equal(matchesPackageType(both, PACKAGE_TYPE_UMROH_RAMADHAN, WIN_2026), true);
  assert.equal(matchesPackageType(both, 'PLUS BADAR', WIN_2026), true);
  assert.equal(matchesPackageType(both, PACKAGE_TYPE_KERETA_CEPAT, WIN_2026), true);
  assert.equal(PACKAGE_TYPES.some(t => t.value === PACKAGE_TYPE_UMROH_RAMADHAN), false);
});

test('Umroh Ramadhan duduk tepat setelah Umroh Musim Dingin di roster', () => {
  const subjects = [
    subject('REGULER 9HR'),                                                        // Umroh Saja
    subject('UMRAH HEMAT 9HR', { isPromo: true, departureIso: '2026-12-27' }),      // Promo + Musim Dingin
    subject('UMRAH LAILATUL QADR 17HR', { departureIso: '2027-02-22' }),            // Ramadhan
  ];
  assert.deepEqual(listPackageTypeOptions(subjects, WIN_2026), [
    { value: 'UMROH SAJA', label: 'Umroh Saja' },
    { value: 'UMROH MUSIM DINGIN', label: 'Umroh Musim Dingin' },
    { value: 'UMROH RAMADHAN', label: 'Umroh Ramadhan' },
    { value: 'UMROH PROMO', label: 'Umroh Promo' },
  ]);
});

test('hasJumatain: semua ejaan Jum\'atain di data, tapi bukan sekadar "Jumat"', () => {
  // Ejaan NYATA di jadwal 1448 selalu JUM'ATAIN (apostrof lurus). Tanpa
  // apostrof dan apostrof keriting (hasil salin dari WhatsApp/Word) ikut
  // diterima supaya paketnya tidak lenyap dari filter hanya karena gaya ketik.
  assert.equal(hasJumatain("PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)"), true);
  assert.equal(hasJumatain("UMRAH HEMAT RAMADHAN JUM'ATAIN PLUS REDSEA 12HR"), true);
  assert.equal(hasJumatain('UMROH JUMATAIN HEMAT 16 HARI'), true);
  assert.equal(hasJumatain('UMRAH JUM’ATAIN PLUS TAIF'), true);
  assert.equal(hasJumatain("umrah jum'atain plus taif"), true);
  // "Jumat" saja bukan program dua Jumat.
  assert.equal(hasJumatain('UMRAH BERANGKAT JUMAT 9HR'), false);
  assert.equal(hasJumatain('REGULER 9HR'), false);
  assert.equal(hasJumatain(undefined), false);
});

test('Umroh Jumatain tidak eksklusif: satu paket bisa sekaligus Plus Taif, Promo, Kereta Cepat', () => {
  // Hampir semua Jum'atain di data ber-ekstensi (PLUS TAIF/BADAR/DUBAI/REDSEA),
  // jadi kalau ia lewat derivePackageType (yang memilih SATU tipe) paketnya akan
  // hilang dari opsi Plus-nya — atau sebaliknya.
  const both = subject("PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)");
  assert.equal(matchesPackageType(both, PACKAGE_TYPE_UMROH_JUMATAIN, WIN_2026), true);
  assert.equal(matchesPackageType(both, 'PLUS TAIF', WIN_2026), true);
  assert.equal(matchesPackageType(both, PACKAGE_TYPE_UMROH_PROMO, WIN_2026), true);
  assert.equal(matchesPackageType(both, PACKAGE_TYPE_KERETA_CEPAT, WIN_2026), true);
  assert.equal(PACKAGE_TYPES.some(t => t.value === PACKAGE_TYPE_UMROH_JUMATAIN), false);
  assert.equal(matchesPackageType(subject('REGULER 9HR'), PACKAGE_TYPE_UMROH_JUMATAIN, WIN_2026), false);
});

test('Umroh Jumatain duduk tepat setelah Umroh Ramadhan di roster', () => {
  const subjects = [
    subject('REGULER 9HR'),                                                        // Umroh Saja
    subject('UMRAH LAILATUL QADR 17HR', { departureIso: '2027-02-22' }),            // Ramadhan
    subject("UMRAH EKONOMIS JUM'ATAIN PLUS TAIF 10HR"),                             // Jumatain + Plus TAIF
    subject('MIX 12HR', { tiers: ['UHUD', 'RAHMAH'] }),                            // Rahmah
  ];
  assert.deepEqual(listPackageTypeOptions(subjects, WIN_2026), [
    { value: 'UMROH SAJA', label: 'Umroh Saja' },
    { value: 'UMROH RAMADHAN', label: 'Umroh Ramadhan' },
    { value: 'UMROH JUMATAIN', label: 'Umroh Jumatain' },
    { value: 'UMROH RAHMAH', label: 'Umroh Rahmah' },
    { value: 'PLUS TAIF', label: 'Plus TAIF' },
  ]);
});

test('listPackageTypeOptions: urutan kanonik, hanya tipe yang punya paket', () => {
  const subjects = [
    subject('REGULER 9HR'),                                                        // Umroh Saja
    subject('PLUS TURKEY 15HR ( KERETA CEPAT)'),                                   // Plus TURKI + Kereta Cepat
    subject('UMRAH HEMAT 9HR', { isPromo: true, departureIso: '2026-12-27' }),      // Promo + Musim Dingin
    subject('MIX 12HR', { tiers: ['UHUD', 'RAHMAH'] }),                            // Rahmah
  ];
  assert.deepEqual(listPackageTypeOptions(subjects, WIN_2026), [
    { value: 'UMROH SAJA', label: 'Umroh Saja' },
    { value: 'UMROH MUSIM DINGIN', label: 'Umroh Musim Dingin' },
    { value: 'UMROH RAHMAH', label: 'Umroh Rahmah' },
    { value: 'UMROH PROMO', label: 'Umroh Promo' },
    { value: 'KERETA CEPAT', label: 'Kereta Cepat' },
    { value: 'PLUS TURKI', label: 'Plus TURKI' },
  ]);
});

test('listPackageTypeOptions: himpunan kosong → tidak ada opsi (tidak ada dead end)', () => {
  assert.deepEqual(listPackageTypeOptions([], WIN_2026), []);
  assert.deepEqual(listPackageTypeOptions(null, WIN_2026), []);
});

test('packageTypeLabel: PLUS hanya menurunkan kata pertama (sama seperti Brosur)', () => {
  assert.equal(packageTypeLabel('PLUS TURKI'), 'Plus TURKI');
  assert.equal(packageTypeLabel('PLUS AL ULA'), 'Plus AL ULA');
  assert.equal(packageTypeLabel(PACKAGE_TYPE_UMROH_MUSIM_DINGIN), 'Umroh Musim Dingin');
  assert.equal(packageTypeLabel(PACKAGE_TYPE_UMROH_SAJA), 'Umroh Saja');
  assert.equal(packageTypeLabel(PACKAGE_TYPE_UMROH_RAMADHAN), 'Umroh Ramadhan');
  assert.equal(packageTypeLabel(PACKAGE_TYPE_UMROH_JUMATAIN), 'Umroh Jumatain');
});

test('slug tipe paket: bolak-balik, dan slug ngawur ditolak', () => {
  for (const type of ['UMROH RAHMAH', 'KERETA CEPAT', 'PLUS AL ULA', PACKAGE_TYPE_UMROH_SAJA, PACKAGE_TYPE_UMROH_RAMADHAN, PACKAGE_TYPE_UMROH_JUMATAIN]) {
    assert.equal(packageTypeFromSlug(packageTypeSlug(type)), type);
  }
  assert.equal(packageTypeSlug('UMROH RAHMAH'), 'umroh-rahmah');
  assert.equal(packageTypeSlug(PACKAGE_TYPE_UMROH_JUMATAIN), 'umroh-jumatain');
  assert.equal(packageTypeFromSlug('ngawur'), null);
  assert.equal(packageTypeFromSlug(''), null);
});

test('umrohTypeSubject: tier dari KUNCI harga, tahan bentuk non-objek', () => {
  const pkg = {
    nama: 'MIX 12HR',
    isPromo: true,
    keberangkatan: { tgl: '2026-12-27' },
    harga: { UHUD: {}, RAHMAH: {} },
  };
  assert.deepEqual(umrohTypeSubject(pkg), {
    nama: 'MIX 12HR',
    isPromo: true,
    departureIso: '2026-12-27',
    tiers: ['UHUD', 'RAHMAH'],
  });
  // Baris placeholder WAITINGLIST tahun 1449 mengirim paket_harga = [] (ARRAY).
  // Itu berarti "tahu tidak ada tier", bukan "tidak tahu" → [] bukan null.
  assert.deepEqual(umrohTypeSubject({ nama: 'WAITINGLIST', harga: [] }).tiers, []);
  assert.deepEqual(umrohTypeSubject({}).tiers, []);
  assert.equal(umrohTypeSubject(undefined).nama, '');
});

test('brochureTypeSubject: tiers kosong dari backend = TIDAK DIKETAHUI (null)', () => {
  const withTiers = { nama: 'MIX 12HR', isPromo: false, berangkat_tgl: '2026-12-27', tiers: [{ tier: 'RAHMAH' }] };
  assert.deepEqual(brochureTypeSubject(withTiers).tiers, ['RAHMAH']);
  assert.equal(brochureTypeSubject({ nama: 'X', tiers: [] }).tiers, null);
  assert.equal(brochureTypeSubject({ nama: 'X' }).tiers, null);
});

test('paritas Brosur↔Jadwal: nama ter-clean vs nama mentah memberi tipe yang sama', () => {
  // Brosur memberi nama hasil cleanBrochurePackageName (frasa "MIX PAKET
  // RAHMAH & UHUD" dan "12HR" dibuang, UPPERCASE); Jadwal memberi jadwal_nama
  // mentah. Kalau aturan pembersih itu berubah dan mulai menelan token
  // destinasi, tes ini yang jatuh lebih dulu.
  const pairs = [
    ['PLUS CAIRO + ALEXANDRIA 12HR MIX  PAKET RAHMAH & UHUD( KERETA CEPAT)', 'PLUS CAIRO + ALEXANDRIA (KERETA CEPAT)'],
    ['UMRAH EKONOMIS PLUS HAIKO 12HR', 'UMRAH EKONOMIS PLUS HAIKO'],
    ['PROMO MILAD PLUS BADAR+REDSEA 10HR', 'PROMO MILAD PLUS BADAR+REDSEA'],
    ["JUM'ATAIN PLUS TAIF + BADAR MIX PAKET UHUD & RAHMAH 12HR (KERETA CEPAT)", "JUM'ATAIN PLUS TAIF + BADAR (KERETA CEPAT)"],
  ];
  for (const [raw, cleaned] of pairs) {
    assert.equal(derivePackageType(raw), derivePackageType(cleaned), raw);
    assert.equal(hasKeretaCepat(raw), hasKeretaCepat(cleaned), raw);
    assert.equal(hasJumatain(raw), hasJumatain(cleaned), raw);
    assert.equal(/\bPROMO\b/i.test(raw), /\bPROMO\b/i.test(cleaned), raw);
  }
});
