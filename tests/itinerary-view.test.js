import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cityKeyForLocation,
  classifyActivity,
  activityIconName,
  computeNightSegments,
  splitImportantPlaces,
  retitleDayWithDate,
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
  assert.equal(classifyActivity('Tiba di Dubai, cek in hotel dan istirahat', { dayIndex: 0, activityIndex: 4 }), 'landing');
  assert.equal(classifyActivity('Tiba di bandara Dubai (transit)', { dayIndex: 11, activityIndex: 1 }), 'transit');
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
