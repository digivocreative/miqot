import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cityKeyForLocation,
  cityKeysInOrder,
  classifyActivity,
  daysUntilDeparture,
  activityIconName,
  computeNightSegments,
  splitImportantPlaces,
  retitleDayWithDate,
  itineraryDayDates,
  splitDayTitleDate,
  isRedundantDayLocation,
  isHomeArrival,
  rewriteHomeArrivalTerminal,
} from '../lib/itinerary-view.js';

// ── cityKeyForLocation ──
test('kota terakhir di location menang', () => {
  assert.equal(cityKeyForLocation('Medinah – Mekkah'), 'mekkah');
  assert.equal(cityKeyForLocation('Dubai – Jeddah - Medinah'), 'madinah');
  assert.equal(cityKeyForLocation('Jakarta - Dubai'), 'dubai');
  assert.equal(cityKeyForLocation('Jeddah – Dubai – Jakarta'), 'home');
});

test('alias & kota khusus', () => {
  assert.equal(cityKeyForLocation('Makkah'), 'mekkah');
  assert.equal(cityKeyForLocation('Taif'), 'mekkah'); // day-trip ikut Mekkah
  assert.equal(cityKeyForLocation('Bir Ali'), 'madinah'); // miqot ikut Madinah
  assert.equal(cityKeyForLocation('Istanbul'), 'turki');
  assert.equal(cityKeyForLocation('Cappadocia'), 'turki');
  assert.equal(cityKeyForLocation('Cairo - Alexandria'), 'mesir');
  assert.equal(cityKeyForLocation('Jeddah'), 'transit');
  assert.equal(cityKeyForLocation(''), null);
  assert.equal(cityKeyForLocation(null), null);
});

// ── cityKeysInOrder ──
test('cityKeysInOrder: urut kemunculan (arah perjalanan), duplikat dibuang', () => {
  assert.deepEqual(cityKeysInOrder('Makkah – Jeddah – Istanbul'), ['mekkah', 'transit', 'turki']);
  assert.deepEqual(cityKeysInOrder('Jakarta - Dubai'), ['home', 'dubai']);
  assert.deepEqual(cityKeysInOrder('Dubai – Jeddah - Medinah'), ['dubai', 'transit', 'madinah']);
  assert.deepEqual(cityKeysInOrder('Cairo - Alexandria'), ['mesir']);
  assert.deepEqual(cityKeysInOrder('Mekkah'), ['mekkah']);
  assert.deepEqual(cityKeysInOrder(''), []);
  assert.deepEqual(cityKeysInOrder(null), []);
});

// ── daysUntilDeparture ──
test('daysUntilDeparture: selisih hari kalender; tombol brosur tampil hanya > 3', () => {
  assert.equal(daysUntilDeparture('2026-09-05', '2026-07-31'), 36);
  assert.equal(daysUntilDeparture('2026-09-05', '2026-09-01'), 4);  // H-4: brosur masih tampil
  assert.equal(daysUntilDeparture('2026-09-05', '2026-09-02'), 3);  // H-3: brosur hilang
  assert.equal(daysUntilDeparture('2026-09-05', '2026-09-05'), 0);  // hari-H
  assert.equal(daysUntilDeparture('2026-09-05', '2026-09-10'), -5); // sudah lewat
});

test('daysUntilDeparture: tanggal tak terbaca → null (fail-closed)', () => {
  assert.equal(daysUntilDeparture('', '2026-07-31'), null);
  assert.equal(daysUntilDeparture('2026-09-05', ''), null);
  assert.equal(daysUntilDeparture('besok', '2026-07-31'), null);
  assert.equal(daysUntilDeparture(null, '2026-07-31'), null);
});

// ── classifyActivity ──
test('aturan posisional: aktivitas pertama hari pertama = kumpul (cacat #8)', () => {
  // Teks nyata JBU1587 yang TIDAK memuat kata "kumpul":
  assert.equal(
    classifyActivity('Tiba di gate Cafe Zukavia gate 5 Terminal 2F Bandara Soekarno Hatta',
      { dayIndex: 0, activityIndex: 0 }),
    'kumpul');
  // Posisi lain dengan teks sama TIDAK otomatis kumpul:
  assert.notEqual(
    classifyActivity('Tiba di gate Cafe Zukavia gate 5 Terminal 2F Bandara Soekarno Hatta',
      { dayIndex: 3, activityIndex: 0 }),
    'kumpul');
});

test('kata kunci kumpul tetap jalan di posisi mana pun', () => {
  assert.equal(classifyActivity('Berkumpul di Terminal 3', { dayIndex: 2, activityIndex: 1 }), 'kumpul');
});

test('takeoff / landing / transit dari teks nyata', () => {
  assert.equal(classifyActivity('Dengan pesawat Emirates Airlines EK 357 berangkat menuju Dubai', { dayIndex: 0, activityIndex: 3 }), 'takeoff');
  assert.equal(classifyActivity('Melanjutkan dengan EK 358 menuju Jakarta', { dayIndex: 11, activityIndex: 2 }), 'takeoff');
  assert.equal(classifyActivity('Tiba di bandara King Abdul Aziz Jeddah, menuju Medinah', { dayIndex: 1, activityIndex: 3 }), 'landing');
  assert.equal(classifyActivity('Tiba di bandara Dubai (transit)', { dayIndex: 11, activityIndex: 1 }), 'transit');
});

// Feedback 2026-07-31: Madinah↔Mekkah bisa bus ATAU kereta cepat, pindah kota
// paket plus naik bus — jangan pernah dilabeli LANDING/TAKE OFF.
test('perpindahan darat: bus & kereta cepat, bukan penerbangan', () => {
  assert.equal(classifyActivity('Berangkat menuju Mekkah dengan bus', { dayIndex: 5, activityIndex: 1 }), 'bus');
  assert.equal(classifyActivity('Perjalanan menuju Bursa dengan bus', { dayIndex: 3, activityIndex: 2 }), 'bus');
  assert.equal(classifyActivity('Menuju Madinah dengan kereta cepat Haramain', { dayIndex: 6, activityIndex: 1 }), 'kereta');
  assert.equal(classifyActivity('Tiba di Mekkah dengan bus, cek in hotel', { dayIndex: 5, activityIndex: 3 }), 'bus');
});

test('perpindahan kota tanpa moda disebut → label netral, bukan penerbangan', () => {
  assert.equal(classifyActivity('Tiba di Dubai, cek in hotel dan istirahat', { dayIndex: 0, activityIndex: 4 }), 'tiba');
  assert.equal(classifyActivity('Tiba di Mekkah, cek in hotel dan istirahat', { dayIndex: 5, activityIndex: 3 }), 'tiba');
  assert.equal(classifyActivity('Berangkat menuju Mekkah', { dayIndex: 5, activityIndex: 1 }), 'perjalanan');
  assert.equal(classifyActivity('Melanjutkan perjalanan menuju Madinah', { dayIndex: 6, activityIndex: 2 }), 'perjalanan');
});

test('bus untuk ziarah/tour atau tanpa kota tetap regular', () => {
  assert.equal(classifyActivity('Ziarah dengan bus menuju Thaif', { dayIndex: 4, activityIndex: 1 }), 'regular');
  assert.equal(classifyActivity('City tour Istanbul dengan bus', { dayIndex: 8, activityIndex: 0 }), 'regular');
  assert.equal(classifyActivity('Melanjutkan dengan bus menuju hotel', { dayIndex: 2, activityIndex: 2 }), 'regular');
});

test('bukan highlight: tiba di hotel & menuju biasa', () => {
  assert.equal(classifyActivity('Tiba di hotel, cek in hotel dan istirahat', { dayIndex: 2, activityIndex: 0 }), 'regular');
  assert.equal(classifyActivity('Check out hotel menuju Bir Ali untuk Miqot', { dayIndex: 5, activityIndex: 1 }), 'regular');
  assert.equal(classifyActivity('Sarapan di hotel', { dayIndex: 1, activityIndex: 0 }), 'regular');
});

// ── activityIconName ──
test('ikon highlight & regular', () => {
  assert.equal(activityIconName('kumpul', 'apa pun'), 'users');
  assert.equal(activityIconName('takeoff', 'x'), 'plane-takeoff');
  assert.equal(activityIconName('bus', 'x'), 'bus');
  assert.equal(activityIconName('kereta', 'x'), 'train-front');
  assert.equal(activityIconName('tiba', 'x'), 'map-pin');
  assert.equal(activityIconName('perjalanan', 'x'), 'route');
  assert.equal(activityIconName('regular', 'Sarapan di hotel'), 'utensils');
  assert.equal(activityIconName('regular', 'City tour Dubai photostop Burj Khalifah'), 'camera');
  assert.equal(activityIconName('regular', 'Ziarah Raudlah dan Makam Rasulullah'), 'landmark');
  assert.equal(activityIconName('regular', 'Menuju imigrasi'), 'badge-check');
  assert.equal(activityIconName('regular', 'Munajad di area'), 'circle-dot');
});

// ── computeNightSegments ──
test('JBU1587: Dubai 1, Madinah 4, Mekkah 5, transit ekor', () => {
  const days = [
    { location: 'Jakarta - Dubai' }, // malam 1 → dubai
    { location: 'Dubai – Jeddah - Medinah' }, // malam 2 → madinah (perjalanan berakhir Madinah)
    { location: 'Medinah' }, { location: 'Medinah' }, { location: 'Medinah' }, // 3,4,5
    { location: 'Medinah – Mekkah' }, // 6 → mekkah
    { location: 'Mekkah' }, { location: 'Mekkah' }, { location: 'Mekkah' }, { location: 'Mekkah' }, // 7-10
    { location: 'Mekkah - Jeddah' }, // 11 → transit (Jeddah)
    { location: 'Jeddah – Dubai – Jakarta' }, // hari terakhir: tanpa malam
  ];
  assert.deepEqual(computeNightSegments(days), [
    { key: 'dubai', nights: 1 },
    { key: 'madinah', nights: 4 },
    { key: 'mekkah', nights: 5 },
    { key: 'transit', nights: 1 },
  ]);
});

test('gagal identifikasi >30% → null (strip disembunyikan)', () => {
  assert.equal(computeNightSegments([
    { location: 'X' }, { location: 'Y' }, { location: 'Mekkah' }, { location: 'Z' },
  ]), null);
  assert.equal(computeNightSegments([]), null);
  assert.equal(computeNightSegments([{ location: 'Mekkah' }]), null); // 0 malam
});

// --- splitImportantPlaces --------------------------------------------------

test('splitImportantPlaces: nama tempat penting ditandai bold', () => {
  assert.deepEqual(splitImportantPlaces('Ziarah ke Masjid Nabawi dan Jabal Uhud'), [
    { text: 'Ziarah ke ', bold: false },
    { text: 'Masjid Nabawi', bold: true },
    { text: ' dan ', bold: false },
    { text: 'Jabal Uhud', bold: true },
  ]);
});

test('splitImportantPlaces: frasa terpanjang menang', () => {
  const parts = splitImportantPlaces('Menuju Masjidil Haram untuk umroh');
  assert.deepEqual(parts[1], { text: 'Masjidil Haram', bold: true });
  assert.equal(parts.filter(p => p.bold).length, 1);
});

test('splitImportantPlaces: kapitalisasi asli dipertahankan', () => {
  assert.deepEqual(splitImportantPlaces('tiba di MEKKAH'), [
    { text: 'tiba di ', bold: false },
    { text: 'MEKKAH', bold: true },
  ]);
});

test('splitImportantPlaces: batas kata dihormati', () => {
  assert.deepEqual(splitImportantPlaces('Terminal keberangkatan'), [
    { text: 'Terminal keberangkatan', bold: false },
  ]);
});

test('splitImportantPlaces: teks tanpa tempat dan teks kosong', () => {
  assert.deepEqual(splitImportantPlaces('Makan siang di hotel'), [
    { text: 'Makan siang di hotel', bold: false },
  ]);
  assert.deepEqual(splitImportantPlaces(''), []);
});

// --- retitleDayWithDate ----------------------------------------------------

test('retitleDayWithDate: tanggal salah di judul ditulis ulang dari jadwal', () => {
  // JBU1504: PDF menulis 05 September dua kali, seluruh hari sesudahnya mundur.
  assert.deepEqual(retitleDayWithDate('Ahad, 05 September 2026', '2026-09-06'), {
    title: 'Ahad, 06 September 2026', hadDate: true,
  });
  assert.deepEqual(retitleDayWithDate('Senin, 06 September 2026', '2026-09-07'), {
    title: 'Senin, 07 September 2026', hadDate: true,
  });
});

test('retitleDayWithDate: tanggal yang sudah benar tidak berubah', () => {
  assert.deepEqual(retitleDayWithDate('Sabtu, 05 September 2026', '2026-09-05'), {
    title: 'Sabtu, 05 September 2026', hadDate: true,
  });
});

test('retitleDayWithDate: nama hari diambil dari tanggal, konvensi Ahad dijaga', () => {
  // 2026-09-13 = Minggu. Judul asli memakai "Ahad" → tetap "Ahad".
  assert.equal(retitleDayWithDate('Ahad, 12 September 2026', '2026-09-13').title, 'Ahad, 13 September 2026');
  // Judul asli memakai "Minggu" → tetap "Minggu".
  assert.equal(retitleDayWithDate('Minggu, 12 September 2026', '2026-09-13').title, 'Minggu, 13 September 2026');
});

test('retitleDayWithDate: padding nol dipertahankan, tanpa padding tetap tanpa padding', () => {
  assert.equal(retitleDayWithDate('05 September 2026', '2026-09-06').title, '06 September 2026');
  assert.equal(retitleDayWithDate('5 September 2026', '2026-09-06').title, '6 September 2026');
});

test('retitleDayWithDate: judul yang bukan tanggal dibiarkan', () => {
  assert.deepEqual(retitleDayWithDate('Jakarta – Madinah', '2026-09-05'), {
    title: 'Jakarta – Madinah', hadDate: false,
  });
});

test('retitleDayWithDate: tanggal di tengah judul campuran', () => {
  assert.deepEqual(retitleDayWithDate('Hari 2 – Ahad, 05 September 2026', '2026-09-06'), {
    title: 'Hari 2 – Ahad, 06 September 2026', hadDate: true,
  });
});

test('retitleDayWithDate: tanpa tanggal acuan, judul dibiarkan apa adanya', () => {
  assert.deepEqual(retitleDayWithDate('Ahad, 05 September 2026', null), {
    title: 'Ahad, 05 September 2026', hadDate: true,
  });
});

test('retitleDayWithDate: ejaan nama hari dipertahankan kalau harinya sudah benar', () => {
  // 2026-12-04 = Jumat. Judul asli "Jum’at" sudah menunjuk hari yang benar → jangan diubah.
  assert.equal(retitleDayWithDate('Jum’at, 04 Desember 2026', '2026-12-04').title, 'Jum’at, 04 Desember 2026');
  assert.equal(retitleDayWithDate("Jum'at, 04 Desember 2026", '2026-12-04').title, "Jum'at, 04 Desember 2026");
});

test('retitleDayWithDate: nama hari yang salah tetap diganti', () => {
  // 2026-09-06 = Minggu, judul menulis "Senin" → harus dikoreksi.
  assert.equal(retitleDayWithDate('Senin, 05 September 2026', '2026-09-06').title, 'Minggu, 06 September 2026');
});

// --- itineraryDayDates -----------------------------------------------------

test('itineraryDayDates: ditambatkan ke dayNumber, bukan posisi array', () => {
  // JBU1517: PDF punya "Hari 0" (kumpul di Jakarta) sebelum hari berangkat.
  const days = [
    { dayNumber: '0' }, { dayNumber: '1' }, { dayNumber: '2' }, { dayNumber: '3' },
    { dayNumber: '4' }, { dayNumber: '5' }, { dayNumber: '6' }, { dayNumber: '7' },
    { dayNumber: '8' }, { dayNumber: '9' },
  ];
  const got = itineraryDayDates(days, '2026-06-13', '2026-06-21');
  assert.equal(got[0], '2026-06-12'); // Hari 0 = sehari sebelum berangkat
  assert.equal(got[1], '2026-06-13'); // Hari 1 = hari berangkat
  assert.equal(got[9], '2026-06-21'); // Hari 9 = pulang_tgl
});

test('itineraryDayDates: penomoran mulai 1 seperti biasa', () => {
  const days = Array.from({ length: 9 }, (_, i) => ({ dayNumber: String(i + 1) }));
  const got = itineraryDayDates(days, '2026-09-05', '2026-09-13');
  assert.equal(got[0], '2026-09-05');
  assert.equal(got[8], '2026-09-13');
});

test('itineraryDayDates: format "Hari N" ikut terbaca', () => {
  const days = [{ dayNumber: 'Hari 1' }, { dayNumber: 'Hari 2' }];
  assert.deepEqual(itineraryDayDates(days, '2026-09-05', '2026-09-06'), ['2026-09-05', '2026-09-06']);
});

test('itineraryDayDates: hari terakhir tak sampai pulang_tgl → semua ditahan', () => {
  // JBU1511: 15 hari terurai untuk jadwal 8 hari — PDF program lain.
  const days = Array.from({ length: 15 }, (_, i) => ({ dayNumber: `Hari ${i + 1}` }));
  assert.deepEqual(itineraryDayDates(days, '2026-09-05', '2026-09-12'), Array(15).fill(null));
});

test('itineraryDayDates: nomor hari mundur atau hilang → ditahan', () => {
  assert.deepEqual(itineraryDayDates([{ dayNumber: '2' }, { dayNumber: '1' }], '2026-09-05', '2026-09-06'), [null, null]);
  assert.deepEqual(itineraryDayDates([{ dayNumber: '1' }, { dayNumber: '' }], '2026-09-05', '2026-09-06'), [null, null]);
});

test('itineraryDayDates: tanpa pulang_tgl tetap dihitung dari dayNumber', () => {
  const days = [{ dayNumber: '1' }, { dayNumber: '2' }];
  assert.deepEqual(itineraryDayDates(days, '2026-09-05', null), ['2026-09-05', '2026-09-06']);
});

test('isRedundantDayLocation: judul sama persis dengan lokasi → redundan', () => {
  // JBU1528: semua hari bertitle nama kota yang sama dengan location
  assert.equal(isRedundantDayLocation('Mekkah', 'Mekkah'), true);
  assert.equal(isRedundantDayLocation('Jakarta - Jeddah - Mekkah', 'Jakarta - Jeddah - Mekkah'), true);
});

test('isRedundantDayLocation: beda pemisah/kapitalisasi tetap redundan', () => {
  assert.equal(isRedundantDayLocation('Mekkah - Madinah', 'mekkah – madinah'), true);
  assert.equal(isRedundantDayLocation('MADINAH', 'Madinah'), true);
});

test('isRedundantDayLocation: lokasi yang menambah informasi tetap tampil', () => {
  assert.equal(isRedundantDayLocation('Perjalanan ke Madinah', 'Jakarta - Madinah'), false);
  assert.equal(isRedundantDayLocation('Ziarah Madinah', 'Madinah'), false);
  assert.equal(isRedundantDayLocation('Kamis, 20 Agustus 2026', 'Mekkah'), false);
});

test('isRedundantDayLocation: lokasi kosong tidak pernah redundan', () => {
  assert.equal(isRedundantDayLocation('Mekkah', ''), false);
  assert.equal(isRedundantDayLocation('Mekkah', null), false);
});

test('itineraryDayDates: satu hari melewati pulang_tgl ditoleransi (tiba keesokan hari)', () => {
  // JBU1528: itinerary 9 hari untuk jadwal 8 hari — Hari 9 = tiba Jakarta
  // keesokan harinya setelah penerbangan malam.
  const days = Array.from({ length: 9 }, (_, i) => ({ dayNumber: String(i + 1) }));
  const got = itineraryDayDates(days, '2026-08-15', '2026-08-22');
  assert.equal(got[0], '2026-08-15');
  assert.equal(got[7], '2026-08-22'); // Hari 8 = pulang_tgl
  assert.equal(got[8], '2026-08-23'); // Hari 9 = tiba, sehari setelahnya
});

test('itineraryDayDates: melewati pulang_tgl lebih dari sehari tetap ditahan', () => {
  const days = Array.from({ length: 10 }, (_, i) => ({ dayNumber: String(i + 1) }));
  assert.deepEqual(itineraryDayDates(days, '2026-08-15', '2026-08-22'), Array(10).fill(null));
});

test('splitDayTitleDate: tanggal dalam kurung dipisah dari judul', () => {
  // JBU1511 hari 1
  assert.deepEqual(splitDayTitleDate('Jakarta – Madinah (Sabtu, 05 September 2026)'), {
    rest: 'Jakarta – Madinah', dateText: 'Sabtu, 05 September 2026',
  });
  // JBU1551 hari 1
  assert.deepEqual(splitDayTitleDate('Jakarta (Senin, 21 Desember 2026)'), {
    rest: 'Jakarta', dateText: 'Senin, 21 Desember 2026',
  });
});

test('splitDayTitleDate: kurung berisi dipertahankan, pemisah yatim dibersihkan', () => {
  // JBU1586 hari 1: "(Hari 0)" bukan tanggal — harus selamat
  assert.deepEqual(splitDayTitleDate('Jakarta (Hari 0) – Senin, 07 Desember 2026'), {
    rest: 'Jakarta (Hari 0)', dateText: 'Senin, 07 Desember 2026',
  });
});

test('splitDayTitleDate: judul hanya tanggal → rest kosong', () => {
  assert.deepEqual(splitDayTitleDate('Sabtu, 05 September 2026'), {
    rest: '', dateText: 'Sabtu, 05 September 2026',
  });
});

test('splitDayTitleDate: judul tanpa tanggal tak berubah', () => {
  assert.deepEqual(splitDayTitleDate('Mekkah - Madinah'), { rest: 'Mekkah - Madinah', dateText: null });
});

// ── isHomeArrival & rewriteHomeArrivalTerminal ──
test('isHomeArrival: butuh penanda rumah DAN kata tiba', () => {
  assert.equal(isHomeArrival('Tiba di Terminal 3 Bandara Soekarno-Hatta dengan selamat'), true);
  assert.equal(isHomeArrival('Mengucapkan Alhamdulillah setibanya di tanah air'), true);
  assert.equal(isHomeArrival('Kembali ke tanah air dengan pesawat SV 820'), false); // terbang pulang, belum mendarat
  assert.equal(isHomeArrival('Tiba di Bandara King Abdulaziz Jeddah'), false); // bukan rumah
  assert.equal(isHomeArrival(''), false);
});

test('rewriteHomeArrivalTerminal: T3→T2 hanya di baris kedatangan tanah air paruh akhir', () => {
  const days = [
    { activities: ['Berkumpul di Terminal 3 Bandara Soekarno-Hatta'] }, // keberangkatan: dibiarkan
    { activities: ['Ibadah di Masjidil Haram'] },
    { activities: [{ time: '16:00', text: 'Tiba di Terminal 3 Bandara Soekarno-Hatta dengan selamat' }] },
  ];
  const out = rewriteHomeArrivalTerminal(days);
  assert.equal(out[0].activities[0], 'Berkumpul di Terminal 3 Bandara Soekarno-Hatta');
  assert.equal(out[2].activities[0].text, 'Tiba di Terminal 2 Bandara Soekarno-Hatta dengan selamat');
  assert.equal(out[2].activities[0].time, '16:00');
  // Tanpa mutasi input — hari yang berubah adalah objek baru
  assert.equal(days[2].activities[0].text, 'Tiba di Terminal 3 Bandara Soekarno-Hatta dengan selamat');
  assert.notEqual(out[2], days[2]);
  assert.equal(out[1], days[1]); // hari tak tersentuh: referensi sama
});

test('rewriteHomeArrivalTerminal: ejaan "terminal 3" dipertahankan kapitalisasinya, input cacat aman', () => {
  const days = [
    { activities: [] },
    { activities: ['tiba di terminal 3 bandara Soekarno – Hatta'] },
  ];
  assert.equal(rewriteHomeArrivalTerminal(days)[1].activities[0], 'tiba di terminal 2 bandara Soekarno – Hatta');
  assert.deepEqual(rewriteHomeArrivalTerminal(null), []);
  assert.deepEqual(rewriteHomeArrivalTerminal([null, { activities: null }]), [null, { activities: null }]);
});
