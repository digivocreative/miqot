import { test } from 'node:test';
import assert from 'node:assert/strict';

import { placesInText, visitedPlacesForDays, highlightPlacesForDays } from '../lib/itinerary-tempat.js';

// Semua teks di berkas ini disalin apa adanya dari tabel `itineraries` produksi
// (JBU1500, JBU1511, JBU1501 dan tetangganya). Keluhan yang dilaporkan agent —
// "belum lengkap" dan "tidak sesuai" — berasal dari kalimat-kalimat ini.

// ── Satu aktivitas menyebut BANYAK tempat ──
// Penyebab utama "belum lengkap": daftar lama memakai pemilih FOTO yang
// sengaja mengambil maksimal satu tempat per aktivitas.

test('mengambil semua tempat dalam satu kalimat ziarah', () => {
  assert.deepEqual(
    placesInText('Ziarah Jabal Tsur, Padang Arafah, Jabal Rahmah, Muzdalifah, Mina, Jabal Nur, dan Gua Hira.'),
    ['Jabal Tsur', 'Padang Arafah', 'Jabal Rahmah', 'Muzdalifah', 'Mina', 'Jabal Nur', 'Gua Hira'],
  );
});

test('tidak menjatuhkan tempat kedua yang punya nama sendiri', () => {
  // Dulu hanya "Hagia Sophia" yang keluar; Blue Mosque hilang diam-diam.
  assert.deepEqual(
    placesInText('Mengunjungi Hagia Sophia dan Blue Mosque.'),
    ['Hagia Sophia', 'Blue Mosque'],
  );
});

test('mengambil tempat sepanjang city tour Giza', () => {
  assert.deepEqual(
    placesInText('City tour Giza mengunjungi Piramida, Sphinx, pabrik papirus, dan National Museum of Egyptian Civilization'),
    ['Piramida Giza', 'Sphinx', 'Museum Peradaban Mesir'],
  );
});

// ── Tempat yang tak punya foto di CDN ──
// Penyebab kedua "belum lengkap": kamus lama hanya memuat tempat yang ada
// aset fotonya, jadi seluruh rangkaian tur Turki & Mesir tak pernah tampil.

test('mengenali situs Turki yang tak punya foto', () => {
  assert.deepEqual(
    placesInText('Mengunjungi Hippodrome dan Topkapi Palace.'),
    ['Hippodrome', 'Topkapi Palace'],
  );
  assert.deepEqual(
    placesInText('Mengunjungi Underground City, Goreme Valley, Avanos Pottery Village, dan Jewelry Shop.'),
    ['Underground City', 'Goreme Valley', 'Avanos Pottery Village'],
  );
});

test('mengenali situs Mesir yang tak punya foto', () => {
  assert.deepEqual(
    placesInText('Berbelanja di Khan El Khalili Bazaar'),
    ['Khan El Khalili'],
  );
  // Label memakai apostrof tipografis (’) seragam — teks hulu memakai lurus
  // maupun tipografis, keluaran harus satu gaya karena masuk PDF.
  assert.deepEqual(
    placesInText("Mengunjungi The Qait Bay Fort, Abbu Alabbas Mosque, dan Pompey's Pillar"),
    ['Qait Bay Fort', 'Masjid Abu Al-Abbas', 'Pompey’s Pillar'],
  );
});

// ── "Tidak sesuai": yang BUKAN tempat wisata tak boleh masuk ──

test('moda transportasi bukan tempat yang dikunjungi', () => {
  // Dulu keluar sebagai "Kereta Cepat Haramain" di daftar tempat.
  assert.deepEqual(
    placesInText('Check-out hotel menuju Bir Ali untuk miqat, lalu menuju stasiun kereta cepat Haramain'),
    ['Bir Ali'],
  );
});

test('bandara, hotel, dan penerbangan bukan tempat yang dikunjungi', () => {
  assert.deepEqual(placesInText('Berangkat menuju Jeddah dengan Saudi Arabia Airlines SV 819, transit'), []);
  assert.deepEqual(placesInText('Tiba di Bandara Cairo, mengambil bagasi, keluar, dan bertemu pemandu'), []);
  assert.deepEqual(placesInText('Sarapan di hotel, kemudian menuju Alexandria; estimasi perjalanan tiga jam'), []);
});

test('museum Jeddah tidak tertukar dengan museum Mesir', () => {
  // "museum peradaban Arab kuno" itu keterangan Museum Al-Ahmoodi di Jeddah.
  assert.deepEqual(
    placesInText('City tour Museum Al Ahmoodi, museum peradaban Arab kuno.'),
    ['Museum Al-Ahmoodi'],
  );
  assert.deepEqual(
    placesInText('City tour Giza mengunjungi National Museum of Egyptian Civilization'),
    ['Piramida Giza', 'Museum Peradaban Mesir'],
  );
});

test('wahana bukan tempat yang dikunjungi', () => {
  // Cable car itu wahana/moda, sama halnya dengan kereta cepat Haramain.
  assert.deepEqual(
    placesInText('Mengunjungi penyulingan mawar dan wisata dengan cable car, kondisional.'),
    ['Penyulingan Mawar'],
  );
  assert.deepEqual(
    placesInText('Mengunjungi Fatih Sultan Mosque, Masjid Eyüp Al-Ansari, dan Pierre Loti dengan cable car.'),
    ['Masjid Fatih Sultan', 'Masjid Eyup Sultan', 'Pierre Loti'],
  );
});

test('nama orang dan keterangan peristiwa bukan tempat', () => {
  // "Abu Bakar Ash-Shiddiq" & "Umar bin Khattab" itu orang; hanya makamnya
  // yang tempat. "tempat terjadinya Perang Uhud" itu penjelasan.
  assert.deepEqual(
    placesInText('Ziarah makam Rasulullah dan kedua sahabatnya, Abu Bakar Ash-Shiddiq dan Umar bin Khattab.'),
    ['Makam Rasulullah'],
  );
  assert.deepEqual(
    placesInText('Ziarah Jabal Uhud, tempat terjadinya Perang Uhud.'),
    ['Jabal Uhud'],
  );
});

test('masjid bernama tetap terbaca meski satu kalimat dengan nama orang', () => {
  assert.deepEqual(
    placesInText('Ziarah makam Baqi, Masjid Abu Bakar, Masjid Ali bin Abi Thalib, dan Masjid Ghamamah.'),
    ['Makam Baqi', 'Masjid Abu Bakar', 'Masjid Ali bin Abi Thalib', 'Masjid Ghamamah'],
  );
});

// ── Ejaan hulu beragam → satu label baku ──

test('ejaan berbeda menghasilkan satu label baku', () => {
  assert.deepEqual(placesInText('Ziarah Masjid Quba'), ['Masjid Quba']);
  assert.deepEqual(placesInText('Sholat di Masjid Kuba'), ['Masjid Quba']);
  assert.deepEqual(placesInText('Masjid Ghomamah'), ['Masjid Ghamamah']);
  assert.deepEqual(placesInText("Masjid Jum'ah"), ['Masjid Jumat']);
  assert.deepEqual(placesInText('Uçhisar Castle Village'), ['Uchisar Castle']);
  assert.deepEqual(placesInText('Tuz Gölü atau Salt Lake'), ['Danau Tuz']);
});

test('mengembalikan daftar kosong untuk masukan kosong', () => {
  assert.deepEqual(placesInText(''), []);
  assert.deepEqual(placesInText(null), []);
  assert.deepEqual(placesInText(undefined), []);
});

// ── visitedPlacesForDays: gabung seluruh itinerary ──

test('menggabungkan seluruh hari, urut kemunculan, tanpa duplikat', () => {
  const days = [
    { activities: ['Tiba di Bandara Madinah, lalu menuju hotel'] },
    { activities: [
      'Ziarah Raudhah, makam Rasulullah, Abu Bakar Ash-Shiddiq, dan Umar bin Khattab.',
      'Ziarah makam Baqi, Masjid Abu Bakar, dan Masjid Ghamamah.',
    ] },
    { activities: [
      { time: '08.00', text: 'Sholat di Masjid Quba.' },
      'Melewati Masjid Jumat, Masjid Qiblatain, dan Masjid Tujuh.',
    ] },
    // Hari terakhir mengulang tempat yang sudah disebut — tak boleh dobel.
    { activities: ['Ziarah Masjid Quba sekali lagi sebelum pulang.'] },
  ];

  assert.deepEqual(visitedPlacesForDays(days), [
    'Raudhah',
    'Makam Rasulullah',
    'Makam Baqi',
    'Masjid Abu Bakar',
    'Masjid Ghamamah',
    'Masjid Quba',
    'Masjid Jumat',
    'Masjid Qiblatain',
    'Masjid Tujuh',
  ]);
});

test('tahan terhadap bentuk masukan yang tidak lengkap', () => {
  assert.deepEqual(visitedPlacesForDays(null), []);
  assert.deepEqual(visitedPlacesForDays([]), []);
  assert.deepEqual(visitedPlacesForDays([{}, { activities: null }]), []);
});

// ── highlightPlacesForDays: hanya sorotan ──
// Daftar lengkap 40+ nama terlalu ramai untuk dokumen jualan (permintaan user
// 2026-08-05). Yang disisakan: nama yang jadi alasan orang memilih paket.

test('membuang titik di dalam situs besar dan masjid serombongan ziarah', () => {
  const days = [
    { activities: [
      'Mengunjungi Hajar Aswad, Hijr Ismail, Maqam Ibrahim, dan Rukun Yamani di Masjidil Haram.',
      'Ziarah makam Baqi, Masjid Abu Bakar, Masjid Ali bin Abi Thalib, dan Masjid Ghamamah.',
      'Ziarah Masjid Quba, Masjid Jumat, Masjid Qiblatain, dan Masjid Tujuh.',
    ] },
  ];
  assert.deepEqual(highlightPlacesForDays(days), ['Masjidil Haram', 'Masjid Quba']);
});

test('membuang ziarah yang ada di hampir semua paket umroh', () => {
  const days = [
    { activities: [
      'Ziarah Raudhah dan makam Rasulullah.',
      'Ziarah Jabal Tsur, Padang Arafah, Jabal Rahmah, Muzdalifah, Mina, Jabal Nur, dan Gua Hira.',
      'Berbelanja di Pasar Kurma.',
      'Ziarah Jabal Uhud.',
    ] },
  ];
  assert.deepEqual(highlightPlacesForDays(days), ['Jabal Uhud']);
});

test('mempertahankan tur yang membedakan antar paket', () => {
  const days = [
    { activities: [
      'City tour Giza mengunjungi Piramida, Sphinx, pabrik papirus, dan National Museum of Egyptian Civilization',
      "Mengunjungi The Qait Bay Fort, Abbu Alabbas Mosque, dan Pompey's Pillar",
      'Mengunjungi Hagia Sophia dan Blue Mosque.',
      'Mengunjungi Underground City, Goreme Valley, Avanos Pottery Village, dan Jewelry Shop.',
      'Photo stop di Burj Khalifa dan Burj Al Arab.',
    ] },
  ];
  assert.deepEqual(highlightPlacesForDays(days), [
    'Piramida Giza',
    'Sphinx',
    'Museum Peradaban Mesir',
    'Qait Bay Fort',
    'Hagia Sophia',
    'Blue Mosque',
    'Underground City',
    'Goreme Valley',
    'Burj Khalifa',
    'Burj Al Arab',
  ]);
});

test('sorotan selalu bagian dari daftar lengkap', () => {
  const days = [
    { activities: [
      'Ziarah Masjid Quba, Masjid Jumat, dan Masjid Qiblatain.',
      'Mengunjungi Hagia Sophia dan Hippodrome.',
    ] },
  ];
  const lengkap = visitedPlacesForDays(days);
  const sorotan = highlightPlacesForDays(days);
  assert.ok(sorotan.length < lengkap.length, 'sorotan harus lebih sedikit');
  for (const tempat of sorotan) assert.ok(lengkap.includes(tempat), `${tempat} hilang dari daftar lengkap`);
  // Urutannya harus tetap searah daftar lengkap, bukan urutan kamus.
  assert.deepEqual(sorotan, lengkap.filter(t => sorotan.includes(t)));
});

test('sorotan tahan terhadap masukan kosong', () => {
  assert.deepEqual(highlightPlacesForDays(null), []);
  assert.deepEqual(highlightPlacesForDays([{ activities: ['Sarapan di hotel.'] }]), []);
});
