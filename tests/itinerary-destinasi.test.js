import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINASI_PHOTO_BASE,
  destinationPhotoUrl,
  destinationPhotoForText,
  destinationPhotosForDays,
} from '../lib/itinerary-destinasi.js';

const file = t => destinationPhotoForText(t)?.file ?? null;

// ── destinationPhotoForText: varian ejaan nyata dari tabel itineraries ──
test('situs suci Saudi: varian ejaan PDF dikenali', () => {
  assert.equal(file('Menuju Masjidil Haram untuk melaksanakan umrah'), 'masjidil-haram.png');
  assert.equal(file('melaksanakan tawaf wada, dan menunggu Zuhur'), 'masjidil-haram.png');
  assert.equal(file('Ziarah Raudlah dan makam Rasulullah'), 'masjid-nabawi.png');
  assert.equal(file('Ziarah Raudhah di dalam Masjid Nabawi'), 'masjid-nabawi.png');
  assert.equal(file('Salat di Masjid Quba'), 'masjid-quba.png');
  assert.equal(file('Melewati Masjid Jumat, Masjid Qiblatain, dan Masjid Tujuh'), 'masjid-qiblatain.png');
  assert.equal(file('Ziarah Jabal Uhud, tempat terjadinya Perang Uhud'), 'jabal-uhud.png');
  assert.equal(file('Ziarah makam Baqi, Masjid Abu Bakar'), 'makam-baqi.png');
  assert.equal(file('Melewati Muzdalifah dan Mina'), 'mina-tenda-putih.png');
  assert.equal(file('Check out hotel menuju stasiun kereta cepat haramain'), 'kereta-cepat-haramain.png');
  assert.equal(file('Menikmati sunset di Laut Merah dengan boat'), 'kapal-laut-merah-redsea.png');
  assert.equal(file('Berbelanja di pasar Cornice.'), 'pasar-cornice.png');
  assert.equal(file('berbelanja di Pasar Corniche'), 'pasar-cornice.png');
});

test('titik kumpul Soekarno-Hatta: Café Zukavia & Palmeera Lounge, termasuk typo hulu', () => {
  assert.equal(file('Rombongan tiba di café Zukavia Terminal 2F'), 'cafe-zukavia.png');
  assert.equal(file('Tiba di Cafe Zukavia Terminal 2F Bandara Soekarno-Hatta, pembagian ID Card'), 'cafe-zukavia.png');
  assert.equal(file('makan malam di café Zukafia'), 'cafe-zukavia.png');
  assert.equal(file('Rombongan tiba di lounge Palmeera Terminal 2F'), 'palmeera-lounge.png');
  assert.equal(file('Rombongan tiba di Lounge Palmera Terminal 2F'), 'palmeera-lounge.png');
  assert.equal(file('Tiba di lounge Palmerra, Gate 6, Terminal 2F'), 'palmeera-lounge.png');
  assert.equal(file('Kumpul di lounge Palmeer, Terminal 2F Bandara Soekarno-Hatta'), 'palmeera-lounge.png');
  // Palm Jumeirah tak boleh tertangkap pola Palmeera.
  assert.equal(file('Photostop di Palm Jumeirah, pulau buatan'), 'palm-jumeirah.png');
});

test('Bir Ali menang atas kereta cepat di baris miqat (keretanya sudah punya badge)', () => {
  assert.equal(file('Check out hotel menuju Bir ali untuk miqot'), 'masjid-bir-ali.png');
  assert.equal(file('Transit di Bir Ali untuk miqat dan niat umrah.'), 'masjid-bir-ali.png');
  assert.equal(
    file('Check-out hotel menuju Bir Ali untuk miqat, lalu ke stasiun kereta cepat Haramain.'),
    'masjid-bir-ali.png',
  );
  // Miqat di tempat lain BUKAN Bir Ali — jangan asal cocok ke kata "miqat".
  assert.equal(file('Mengambil miqat di Tan’im untuk umrah kedua (kondisional).'), null);
  assert.equal(file('Miqat dapat dilakukan di dalam pesawat, Ya’lamlam, atau Bandara Jeddah.'), null);
  // Baris kereta tanpa Bir Ali tetap memakai foto kereta.
  assert.equal(file('Check out hotel menuju stasiun kereta cepat haramain'), 'kereta-cepat-haramain.png');
});

test('Jabal Tsur: varian ejaan, dan "Jabal Nur" tak ikut tertangkap', () => {
  assert.equal(file('Ziarah kota Mekkah ke Jabal Tsur'), 'jabal-tsur.png');
  assert.equal(file('Ziarah Jabal Thur, tempat persembunyian Rasulullah'), 'jabal-tsur.png');
  assert.equal(file('Melewati Gua Tsur'), 'jabal-tsur.png');
  assert.equal(file('Ziarah ke Jabal Nur dan Gua Hira'), null);
});

test('arafah menang atas rahmah: teks gabungan pakai foto Padang Arafah', () => {
  assert.equal(file('Mengunjungi Padang Arafah dan Jabal Rahmah'), 'padang-arafah-jabal-rahmah.png');
  assert.equal(file('Ziarah ke Jabal Rahmah, tempat pertemuan Nabi Adam'), 'jabal-rahmah.png');
});

test('Turki, Dubai, Mesir: termasuk typo PDF (Khalifah, Ar Arab)', () => {
  assert.equal(file('Tur Turkish Leather Shop dan mengunjungi Hagia Sophia.'), 'hagia-sophia.png');
  assert.equal(file('Tour ke Topkapi palace dan Blue Mosque'), 'blue-mosque.png');
  assert.equal(file('Tour Bosphorus dengan private cruise'), 'bosphorus.png');
  assert.equal(file('Menuju Cappadocia.'), 'balon-udara-cappadocia.png');
  assert.equal(file('Tur opsional: hot air balloon dan jeep safari'), 'balon-udara-cappadocia.png');
  assert.equal(file('Sampai Istanbul, menuju Bursa (estimasi perjalanan 2 jam)'), 'bursa.png');
  assert.equal(file('Photostop di Burj Khalifah, pencakar langit tertinggi'), 'burj-khalifa.png');
  assert.equal(file('Photostop di Burj Ar Arab'), 'burj-al-arab.png');
  assert.equal(file('Photostop di Palm Jumeirah, pulau buatan'), 'palm-jumeirah.png');
  assert.equal(file('Citytour kota Giza mengunjungi Piramida dan sphinx'), 'piramida-giza.png');
  assert.equal(file('Menuju Alexandria (estimasi 3 jam)'), 'alexandria.png');
  assert.equal(file('Visit Tour: El Emam El Shafei dan El Azhar Mosque'), 'masjid-al-azhar.png');
});

test('beberapa tempat wisata dalam satu kegiatan → satu foto (yang pertama)', () => {
  assert.equal(
    file('City tour Dubai = photostop di Burj Khalifah, Burj Ar Arab, Palm Jumeirah, Dubai Aquarium'),
    'burj-khalifa.png',
  );
  assert.equal(file('Ziarah Madinah, Masjid Quba dan Jabal Uhud'), 'masjid-quba.png');
});

test('teks tanpa destinasi berfoto → null (tak asal cocok)', () => {
  assert.equal(file('Makan siang nasi mandi di Kota Thaif'), null);
  assert.equal(file('Check-in hotel dan istirahat'), null);
  assert.equal(file('Tiba di Bandara Mohammad Bin Abdul Aziz, Madinah'), null);
  assert.equal(file(''), null);
  assert.equal(destinationPhotoForText(null), null);
});

test('destinationPhotoUrl menunjuk derivatif webp di foto-destinasi/web, bukan master PNG', () => {
  assert.equal(
    destinationPhotoUrl('bursa.png'),
    `${DESTINASI_PHOTO_BASE}/web/bursa.webp`,
  );
  assert.match(DESTINASI_PHOTO_BASE, /^https:\/\/alhijaz\.b-cdn\.net\/foto-destinasi$/);
});

// ── destinationPhotosForDays: posisional bandara + dedup global ──
const mkDay = (...activities) => ({ activities });

test('foto bandara menempel ke momen: keberangkatan di take-off, kepulangan di landing tanah air', () => {
  const days = [
    mkDay('Rombongan tiba di lounge Palmeera Terminal 2F Bandara International Soekarno Hatta', 'Take off menuju Jeddah'),
    mkDay('Tiba di Bandara King Abdulaziz Jeddah'),
    mkDay('Ibadah di Masjidil Haram'),
    mkDay(
      'Kembali ke tanah air dengan pesawat Saudi Arabia Airlines SV 820',
      'Tiba di Terminal 3 Bandara Soekarno-Hatta dengan selamat',
      'Mengucapkan Alhamdulillahi Rabbil ‘Alamin setibanya di tanah air',
    ),
  ];
  const photos = destinationPhotosForDays(days);
  // Titik kumpul BUKAN momen keberangkatan (feedback 2026-07-31): fotonya ruang
  // tunggunya sendiri, bukan foto keberangkatan yang jatah panel TAKE OFF.
  assert.equal(photos[0][0]?.file, 'palmeera-lounge.png');
  assert.equal(photos[0][1]?.file, 'keberangkatan-di-bandara.png'); // take off
  assert.equal(photos[1][0], null); // tiba di Jeddah ≠ keberangkatan/kepulangan
  assert.equal(photos[2][0]?.file, 'masjidil-haram.png');
  assert.equal(photos[3][0], null); // "kembali ke tanah air" = terbang pulang, belum mendarat
  assert.equal(photos[3][1]?.file, 'kepulangan-di-bandara.png'); // landing Soekarno-Hatta
  assert.equal(photos[3][2], null); // dedup: kepulangan sudah tampil di landing
});

test('menuju bandara untuk pulang (paruh akhir) tak memicu foto kepulangan', () => {
  const days = [
    mkDay('Berkumpul di kantor'),
    mkDay('Ibadah'),
    mkDay('Menuju Bandara King Abdulaziz Jeddah untuk kembali ke tanah air'),
    mkDay('Perjalanan'),
  ];
  assert.equal(destinationPhotosForDays(days)[2][0], null);
});

test('kepulangan juga dikenali dari "Tiba di Bandara Soekarno-Hatta" di paruh akhir', () => {
  const days = [
    mkDay('Berkumpul di kantor'),
    mkDay('Ibadah'),
    mkDay('Perjalanan pulang'),
    mkDay('Tiba di Terminal 3 Bandara Soekarno-Hatta dengan selamat'),
  ];
  assert.equal(destinationPhotosForDays(days)[3][0]?.file, 'kepulangan-di-bandara.png');
});

test('dedup global: Masjidil Haram tiap hari → foto hanya di kemunculan pertama', () => {
  const days = [
    mkDay('Menuju Masjidil Haram untuk melaksanakan umrah'),
    mkDay('Sholat fardhu berjamaah di Masjidil Haram', 'Ziarah Jabal Uhud'),
    mkDay('Memperbanyak ibadah sunnah di Masjidil Haram'),
    mkDay('Tawaf wada'),
  ];
  const photos = destinationPhotosForDays(days);
  assert.equal(photos[0][0]?.file, 'masjidil-haram.png');
  assert.equal(photos[1][0], null);
  assert.equal(photos[1][1]?.file, 'jabal-uhud.png');
  assert.equal(photos[2][0], null);
  assert.equal(photos[3][0], null); // tawaf → foto Masjidil Haram, sudah tampil
});

// ── Gantian Jabal Tsur ↔ Padang Arafah di baris ziarah gabungan ──
const ZIARAH = 'Ziarah ke Jabal Tsur, Padang Arafah, Jabal Rahmah, Muzdalifah, Mina, dan Jabal Nur.';
const pickZiarah = days => destinationPhotosForDays(days)[0][0]?.file ?? null;

test('gantian: kedua foto sama-sama kebagian di baris ziarah gabungan', () => {
  // Satu kegiatan tetap SATU foto; yang digilir hanya siapa yang menang, supaya
  // tak ada foto yang selamanya kalah. Tak menguji nilai hash — cukup buktikan
  // dua-duanya benar-benar muncul di sebaran itinerary.
  const hasil = new Set();
  for (let i = 0; i < 12; i++) {
    hasil.add(pickZiarah([mkDay(ZIARAH), mkDay(`Istirahat di hotel ${'.'.repeat(i)}`)]));
  }
  assert.deepEqual([...hasil].sort(), ['jabal-tsur.png', 'padang-arafah-jabal-rahmah.png']);
});

test('gantian deterministik: itinerary yang sama selalu memberi foto yang sama', () => {
  const days = [mkDay(ZIARAH), mkDay('Sholat di Masjidil Haram')];
  const pertama = pickZiarah(days);
  assert.ok(pertama);
  for (let i = 0; i < 5; i++) assert.equal(pickZiarah(days), pertama);
});

test('gantian tak menyia-nyiakan jatah: yang sudah tampil dilewati', () => {
  // Padang Arafah sudah muncul di hari 1 → baris gabungan hari 2 WAJIB jatuh ke
  // Jabal Tsur, berapa pun gilirannya; kalau tidak, barisnya kosong percuma.
  const days = [
    mkDay('Ziarah ke Padang Arafah'),
    mkDay(ZIARAH),
    mkDay('Istirahat'),
    mkDay('Istirahat'),
  ];
  const photos = destinationPhotosForDays(days);
  assert.equal(photos[0][0]?.file, 'padang-arafah-jabal-rahmah.png');
  assert.equal(photos[1][0]?.file, 'jabal-tsur.png');
});

test('gantian menghormati prioritas global: Masjidil Haram tetap menang', () => {
  const days = [mkDay('Menuju Masjidil Haram, lalu ziarah Jabal Tsur dan Padang Arafah')];
  assert.equal(destinationPhotosForDays(days)[0][0]?.file, 'masjidil-haram.png');
});

test('activities campuran string/{time,text} dan input cacat tak melempar', () => {
  const days = [
    { activities: [{ time: '07:00', text: 'Tour Bosphorus dengan private cruise' }, 'Tour ke Hagia Sophia', null] },
    { activities: null },
    null,
  ];
  const photos = destinationPhotosForDays(days);
  assert.equal(photos[0][0]?.file, 'bosphorus.png');
  assert.equal(photos[0][1]?.file, 'hagia-sophia.png');
  assert.equal(photos[0][2], null);
  assert.deepEqual(photos[1], []);
  assert.deepEqual(photos[2], []);
  assert.deepEqual(destinationPhotosForDays(null), []);
});
