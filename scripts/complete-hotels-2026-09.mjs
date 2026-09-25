#!/usr/bin/env node
// Lengkapi deskripsi, fasilitas, catatan agent, dan FAQ dua hotel jadwal yang
// dibuat admin lewat panel Kelola pada 2026-09-25 (Sofwah Royal Orchid dan
// Holiday Inn Bursa) tapi baru terisi identitas, alamat, dan rating.
//
// Beda dengan seed-hotels-2026-09.mjs: baris SUDAH ADA dan dimiliki admin.
// Karena itu skrip ini hanya mengisi kolom yang masih KOSONG — nama, bintang,
// jarak, area, alamat, link maps, rating, dan media tidak pernah disentuh.
// Foto sengaja tidak diisi (diunggah manual lewat panel Kelola).
//
// Penjaga balapan: update memakai updated_at yang dibaca sebagai syarat. Kalau
// baris disunting orang lain di sela baca-tulis, update tidak mengenai baris
// apa pun dan skrip melaporkannya alih-alih menimpa.
//
// Jalankan: node --env-file=.env scripts/complete-hotels-2026-09.mjs [--dry]
import { createClient } from '@supabase/supabase-js';
import { buildHotelPayload } from '../lib/hotel-directory.js';

const DRY = process.argv.includes('--dry');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Env belum lengkap: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FILL_FIELDS = ['description', 'facilities', 'agent_note', 'faq'];

// Sumber (riset 2026-09-25): koordinat & skor dari Google Maps/Travel, jarak ke
// poligon Masjidil Haram, Ka'bah, dan node gerbang lewat Overpass, distrik dari
// Nominatim, kamar/fasilitas dari situs resmi lalu Booking, Agoda, Trip.com.
// Angka yang bertentangan antarsumber disebut bertentangan, bukan dipilih.
const HOTELS = [
  {
    slug: 'sofwah-royal-orchid',
    // Koordinat Google 21.4196875, 39.8265625 — di dalam poligon menara Abraj As
    // Safwah (OSM way 210564288), BUKAN anggota relation Abraj Al Bait
    // (12896421). 153 m ke bangunan masjid, 317 m ke Ka'bah, Gerbang King Abdul
    // Aziz 168 m. Google/Booking/Agoda/Trip.com sepakat bintang 3.
    description:
      "Al Safwah Royale Orchid — di Booking, Agoda, dan Trip.com tercatat sebagai Al Safwah Orchid Hotel — menempati menara Abraj As Safwah di Jalan Ajyad, persis menghadap Gerbang King Abdul Aziz. Menara ini menempel di sisi timur laut Abraj Al Bait (Menara Jam), tapi gedungnya terpisah dan bukan bagian dari kompleks Abraj Al Bait. Di menara yang sama ada beberapa hotel bernama mirip — Al Safwa Hotel First Tower, Al Safwah Third Tower, Al Ghufran Safwah, dan Dorrar Al Eiman Royal — jadi pastikan voucher menyebut Royale Orchid. Pengelolanya Golden Orchid Company.\n\nKekuatannya lokasi: ±150 m garis lurus ke bangunan masjid dan ±320 m ke Ka'bah; sisi utara menara langsung berbatasan dengan pelataran selatan. Dari lobi, jamaah turun dengan lift atau eskalator ke pelataran lalu masuk lewat Gerbang King Abdul Aziz (±170 m) atau Gerbang Ajyad (±155 m); tamu menyebut sekitar 2–3 menit ke gerbang dan 5–7 menit sampai mataf. Di menara ada mal dan food court, dan hotel punya musholla yang menghadap pelataran Haram.\n\nCatatan jujur: Google, Booking, Agoda, dan Trip.com mencatat hotel ini bintang 3; klaim bintang 5 hanya muncul di situs agen dan perantara. Skor Google 4,2 dari 8.283 ulasan, Booking 7,9 dengan nilai lokasi 9,3. Keluhan berulang di ulasan terbaru: gedung tua yang perlu renovasi, kamar mandi usang dan berbau, AC atau air panas bermasalah di sebagian kamar, kasur keras, serta kamar standar tanpa pemandangan — sebagian bahkan tanpa jendela. Jumlah kamar pun bertentangan: situs resmi menulis 857, OTA 471.",
    facilities: ['Wi-Fi', 'AC', 'Resepsionis 24 Jam', 'Lift', 'Restoran', 'Sarapan Prasmanan', 'Room Service', 'Kafe', 'Laundry', 'Kursi Roda', 'TV Layar Datar', 'Brankas', 'Musholla', 'Concierge', 'Money Changer', 'Mini Market', 'Kamar Keluarga', 'Ruang Rapat', 'Parkir Berbayar', 'Kulkas Mini (Sebagian)'],
    agent_note:
      "Di jadwal tertulis 'SOFWAH ROYAL ORCHID' (JBU1542, tier RAHMAH, berangkat 21 Des 2026; pasangan Madinah: Anwar Almadinah Movenpick). Nama resminya Al Safwah Royale Orchid; di Booking, Agoda, dan Trip.com tercatat 'Al Safwah Orchid Hotel'. Menara Abraj As Safwah berisi beberapa hotel bernama mirip (Al Safwa Hotel First Tower, Al Safwah Third Tower, Al Ghufran Safwah, Dorrar Al Eiman Royal) — cocokkan nama di voucher. Google, Booking, Agoda, dan Trip.com mencatatnya bintang 3, bukan 5: jual lewat lokasi, jangan menjanjikan standar bintang 5. Kamar Double di Booking tercatat dua kasur single dan extra bed tidak tersedia. Konfirmasi ke handling: tipe kamar (standar tanpa view atau side Haram), menu dan jam makan rombongan, serta check-in pukul 16.00.",
    faq: [
      {
        q: "Di jadwal tertulis 'SOFWAH ROYAL ORCHID' — hotel Safwah yang mana? Di situ ada beberapa.",
        a: 'Al Safwah Royale Orchid, yang di Booking, Agoda, dan Trip.com tercatat Al Safwah Orchid Hotel, di menara Abraj As Safwah Jalan Ajyad. Menara yang sama juga berisi Al Safwa Hotel First Tower, Al Safwah Third Tower, Al Ghufran Safwah, dan Dorrar Al Eiman Royal — namanya mirip, hotelnya lain. Menaranya menempel Abraj Al Bait, tapi bukan bagian dari kompleks Menara Jam.',
      },
      {
        q: 'Sedekat apa ke Masjidil Haram, dan lewat gerbang mana?',
        a: "Menaranya langsung berbatasan dengan pelataran selatan: ±150 m garis lurus ke bangunan masjid dan ±320 m ke Ka'bah. Dari lobi turun lift atau eskalator ke pelataran, lalu masuk lewat Gerbang King Abdul Aziz (Gerbang 1) atau Gerbang Ajyad — sekitar 3 menit sampai gerbang dan 5–7 menit sampai mataf menurut ulasan tamu. Hotel menyediakan kursi roda untuk jamaah sepuh.",
      },
      {
        q: 'Hotelnya bintang 5, kan?',
        a: 'Tidak konsisten. Google, Booking, Agoda, dan Trip.com sama-sama mencatat bintang 3; klaim bintang 5 hanya muncul di situs agen dan perantara. Ulasan terbaru juga menyebut gedungnya terasa tua dan perlu renovasi. Aman menjualnya sebagai hotel yang langsung menghadap Gerbang King Abdul Aziz, bukan sebagai hotel mewah.',
      },
      {
        q: "Ada kamar triple dan quad? Kamarnya menghadap Ka'bah?",
        a: 'Ada Double, Triple, dan Quad, semuanya dengan kasur single terpisah — Double di Booking tercatat dua kasur single, dan extra bed tidak tersedia. Tiap tipe punya varian standar tanpa pemandangan, side Haram view, dan side Kaaba view. Ada tamu yang mendapat kamar standar tanpa jendela, jadi jangan menjanjikan view sebelum tipe kamar rombongan dikonfirmasi ke handling.',
      },
      {
        q: 'Keluhan apa yang paling sering, dan apa yang perlu saya konfirmasi ke handling?',
        a: 'Yang paling sering dikeluhkan: kamar mandi usang dan berbau, AC atau air panas bermasalah di sebagian kamar, kasur keras, dan sarapan yang dinilai biasa saja. Konfirmasikan menu dan jam makan rombongan (restorannya Marwa dan Al Morjan), tipe kamar yang dikunci, dan check-in pukul 16.00. Kalau jamaah perlu makan di luar jadwal, ada mal dan food court di menara yang sama.',
      },
    ],
  },
  {
    slug: 'holiday-inn-bursa',
    // Koordinat Google 40.196405, 29.063203 (sama dengan tautan peta situs
    // hotel); koordinat di schema situs IHG meleset ±9 km. Jarak ke kota tua =
    // haversine garis lurus ke koordinat Nominatim. Fasilitas mengikuti IHG
    // bila bertentangan dengan Google (kolam renang, shuttle).
    description:
      'Holiday Inn Bursa - City Centre adalah hotel jaringan IHG dengan 120 kamar di gedung 10 lantai, di Jalan Ulubatlı Hasan, kawasan Kent Meydanı — pusat kota modern Bursa di distrik Osmangazi. Ini satu-satunya Holiday Inn yang kami temukan di Bursa. Tapi di jadwal tertulis "/SETARAF": handling boleh menggantinya dengan hotel lain yang dianggap setara, jadi jangan menjanjikan Holiday Inn secara mutlak.\n\nMal Kent Meydanı ada tepat di seberang hotel, halte trem Uluyol ±200 m, dan metro Osmangazi ±650 m. Hotel ini di kota baru, bukan kota tua: Ulu Cami ±1,4 km garis lurus ke selatan, Koza Han dan Kapalıçarşı ±1,3 km, makam Osman dan Orhan Gazi di Tophane ±1,2 km, Yeşil Cami ±1,9 km. Nama kelurahannya "Ulu", tapi itu tidak berarti menempel Ulu Cami — untuk rombongan, ke situs-situs itu praktisnya naik bus. Terminal bus antarkota ±7,8 km di utara.\n\nSkornya tinggi dan konsisten: Google 4,5 dari 3.276 ulasan, Booking 9,2, Agoda 9,0. Yang paling sering dipuji staf, kebersihan, lokasi, dan teras atap. Keluhan hanya sesekali: kamar standar agak kecil (22 m²), variasi sarapan, dan beberapa kasus sikap resepsionis. Perlu disampaikan jujur: ini hotel bisnis, bukan hotel syariah — ada lobby bar dan roof bar yang menyajikan koktail, dan sebagian kamarnya kamar merokok. Tidak ada kolam renang, walaupun Google mencantumkannya.',
    facilities: ['Wi-Fi', 'AC', 'Resepsionis 24 Jam', 'Lift', 'Restoran', 'Sarapan Prasmanan', 'Room Service', 'Laundry', 'Pusat Kebugaran', 'Parkir Gratis', 'Kursi Roda', 'TV Layar Datar', 'Kulkas Mini', 'Brankas', 'Coffee/Tea Maker', 'Ruang Rapat', 'Business Center', 'Bar/Lounge', 'Teras Atap', 'Sajadah (Atas Permintaan)'],
    agent_note:
      "Di jadwal tertulis 'HOLIDAY INN BURSA/SETARAF' (JBU1510, berangkat 14 Okt 2026). Nama resmi properti: Holiday Inn Bursa - City Centre (IHG), Ulu Mah., Ulubatlı Hasan Blv. No:44, Osmangazi — satu-satunya Holiday Inn yang kami temukan di Bursa. '/SETARAF' berarti handling boleh mengganti dengan hotel setara; konfirmasikan nama hotel final ke handling sebelum dijanjikan ke jamaah. Tiga hal lain yang perlu dikonfirmasi: kamar untuk bertiga (tidak ada tipe triple resmi, hanya rollaway/extra bed atas permintaan), sarapan termasuk paket (harga lepasnya ±25 EUR menurut Agoda), dan permintaan kamar bebas rokok. Koordinat di schema situs IHG (40.1147, 29.0348) keliru ±9 km; posisi yang benar 40.1964, 29.0632 (Google, sama dengan tautan peta di situs hotel).",
    faq: [
      {
        q: "Di jadwal tertulis 'HOLIDAY INN BURSA/SETARAF'. Pasti menginap di Holiday Inn?",
        a: 'Belum tentu. SETARAF berarti handling boleh mengganti dengan hotel lain yang dianggap setara. Yang dimaksud Holiday Inn Bursa - City Centre (IHG) di Kent Meydanı — satu-satunya Holiday Inn yang kami temukan di Bursa. Sampaikan ke jamaah "Holiday Inn Bursa atau setaraf", dan konfirmasi nama hotel final ke handling sebelum berangkat.',
      },
      {
        q: 'Seberapa jauh dari Ulu Cami dan kawasan kota tua Bursa?',
        a: 'Hotelnya di pusat kota modern, bukan kota tua. Jarak garis lurus: Ulu Cami ±1,4 km, Koza Han ±1,3 km, makam Osman dan Orhan Gazi (Tophane) ±1,2 km, Yeşil Cami ±1,9 km. Untuk rombongan, praktisnya naik bus. Yang benar-benar dekat: Mal Kent Meydanı tepat di seberang dan halte trem ±200 m.',
      },
      {
        q: 'Makanannya halal? Ada fasilitas untuk salat?',
        a: 'Booking mencantumkan sarapan prasmanan dengan keterangan halal, dan ulasan tamu dari Malaysia serta negara Teluk umumnya puas. Tapi ini hotel bisnis, bukan hotel syariah: ada lobby bar dan roof bar yang menyajikan koktail. IHG mencantumkan sajadah atas permintaan, dan ada tamu Malaysia yang dibantu staf kebersihan menentukan arah kiblat.',
      },
      {
        q: 'Ada kamar triple untuk bertiga?',
        a: 'Tidak ada tipe triple resmi. Kamar standar 22–29 m² dengan 2 ranjang twin atau 1 queen; kamar premium 25–38 m², sebagian dengan sofa bed. Rollaway bed dan kamar connecting tersedia atas permintaan. Untuk pax triple, konfirmasi ke handling pakai extra bed atau tidak, dan minta kamar bebas rokok karena sebagian kamar masih kamar merokok.',
      },
      {
        q: 'Bedanya dengan Anemon Bursa atau Trio Suites yang juga ada di direktori?',
        a: 'Holiday Inn paling sentral: di Kent Meydanı, ±1,4 km dari Ulu Cami. Anemon ada di Çekirge sekitar 4 km dari pusat, Trio Suites (kini Four Points Flex) di Görükle sekitar 30 menit berkendara. Holiday Inn juga paling besar (120 kamar) dan skor ulasannya paling tinggi dengan sampel terbanyak. Holiday Inn tidak punya kolam renang maupun fasilitas termal.',
      },
    ],
  },
];

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === '';
}

async function main() {
  let updated = 0;
  let skipped = 0;
  for (const input of HOTELS) {
    const { data: row, error: readError } = await supabase
      .from('hotels')
      .select('*')
      .eq('slug', input.slug)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) {
      console.error(`  TIDAK ADA       ${input.slug}`);
      process.exitCode = 1;
      continue;
    }

    const patch = {};
    for (const field of FILL_FIELDS) {
      if (isEmpty(row[field]) && !isEmpty(input[field])) patch[field] = input[field];
    }
    if (Object.keys(patch).length === 0) {
      console.log(`  LEWAT           ${row.name} (semua kolom sudah terisi)`);
      skipped += 1;
      continue;
    }

    // Validasi memakai aturan yang sama dengan PUT /api/hotels/:id, atas baris
    // gabungan (isi admin + tambalan), lalu yang ditulis hanya kolom tambalan
    // dalam bentuk ternormalisasi. media dikeluarkan dari validasi: tidak
    // ditulis, dan validatornya butuh prefix CDN yang hanya ada di server.
    const { media: _media, ...rowWithoutMedia } = row;
    const built = buildHotelPayload({ ...rowWithoutMedia, ...patch });
    if (!built.ok) {
      console.error(`  GAGAL VALIDASI  ${row.name}: ${built.error}`);
      process.exitCode = 1;
      continue;
    }
    const update = Object.fromEntries(Object.keys(patch).map((field) => [field, built.data[field]]));

    if (DRY) {
      console.log(`  [dry] ISI       ${row.name}: ${Object.keys(update).join(', ')}`);
      updated += 1;
      continue;
    }
    const { data: written, error: writeError } = await supabase
      .from('hotels')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('updated_at', row.updated_at)
      .select('slug');
    if (writeError) {
      console.error(`  GAGAL UPDATE    ${row.name}: ${writeError.message}`);
      process.exitCode = 1;
      continue;
    }
    if (!written || written.length === 0) {
      console.error(`  BENTROK         ${row.name}: baris berubah saat skrip berjalan — tidak ditimpa, jalankan ulang`);
      process.exitCode = 1;
      continue;
    }
    console.log(`  ISI             ${row.name}: ${Object.keys(update).join(', ')}`);
    updated += 1;
  }
  console.log(`\n${DRY ? '[dry] ' : ''}Selesai: ${updated} dilengkapi, ${skipped} dilewati.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
