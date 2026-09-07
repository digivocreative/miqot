#!/usr/bin/env node
// Tambah 7 hotel yang dipakai jadwal aktif tapi belum ada di Direktori Hotel.
//
// Sumber data (riset 2026-09-07): koordinat & skor dari Google Maps place page
// tiap hotel, alamat/distrik dari reverse-geocode Nominatim, jarak Madinah/Mekkah
// dihitung ke poligon bangunan masjid (Overpass) lalu diturunkan ke jarak
// PELATARAN mengikuti konvensi kolom distance_label yang sudah dipakai 33 baris
// sebelumnya. Angka yang tidak bisa diverifikasi DIKOSONGKAN, bukan dikarang.
//
// Idempoten: hotel yang slug-nya sudah ada DILEWATI (tidak menimpa isi yang
// mungkin sudah disunting agent lewat panel Kelola).
//
// media sengaja kosong — foto diisi terpisah lewat scripts/fill-hotel-photos.mjs
// yang butuh manifest URL dari situs resmi tiap hotel.
//
// Jalankan: node --env-file=.env scripts/seed-hotels-2026-09.mjs [--dry]
import { createClient } from '@supabase/supabase-js';
import { buildHotelPayload, slugifyHotelName } from '../lib/hotel-directory.js';

const DRY = process.argv.includes('--dry');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Env belum lengkap: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const gmaps = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

const HOTELS = [
  {
    name: 'Al Olayan Ajyad Ex Almassa',
    city: 'mekkah',
    stars: 4,
    distance_label: '±100m',
    walk_label: '±3 menit jalan kaki via Gerbang King Abdul Aziz',
    area: 'Ajyad',
    address: 'King Abdul Aziz Rd (Jalan 38) 4437-4491, Ajyad, Makkah 24231, Arab Saudi',
    gmaps_url: gmaps('Al Olayan Ajyad Hotel Makkah'),
    agent_note: "Di jadwal tertulis 'AL OLAYAN AJYAD EX ALMASSA' (JBU1617, berangkat 25 Okt 2026).",
    description:
      'Al Olayan Ajyad menempati gedung tinggi di Jalan Ajyad, berhadapan dengan kompleks istana kerajaan dan menghadap pelataran Masjidil Haram. Hotel ini dikelola Al Olayan Hotels Group; di jadwal Alhijaz masih ditulis "EX ALMASSA" karena gedungnya dulu dioperasikan sebagai properti Al Massa. Dari lobi, jamaah masuk masjid lewat Gerbang King Abdul Aziz, dan jalur Ajyad relatif datar serta tetap terbuka saat area lain padat.\n\nKoordinat resmi Google menempatkan hotel ±320 m dari Ka\'bah — artinya bangunannya praktis menempel batas kompleks Haram, jauh lebih dekat daripada Al Massa Grand (±400 m) yang ada di jalan yang sama. Sebagian OTA menulis 500 m; itu panjang rute jalan kaki memutar, bukan garis lurus.\n\nSatu hal yang perlu dicek sebelum dijual: klasifikasi bintangnya tidak konsisten antar sumber. Google mencatat bintang 4, sebagian OTA bintang 3, dan situs resmi grupnya sendiri malah menulis bintang 1 — yang terakhir hampir pasti salah isi template, karena di kalimat yang sama mereka menyebut hotelnya "luxurious". Skor Google 4,1 dari 2.423 ulasan tergolong baik untuk kelas hotel Ajyad, tapi jual hotel ini lewat lokasi dan akses gerbangnya, bukan kemewahannya.',
    facilities: ['Wi-Fi', 'AC', 'Lift', 'Resepsionis 24 Jam', 'Room Service', 'Restoran', 'Laundry', 'Parkir Gratis', 'Antar-Jemput Haram'],
    ratings: [{ platform: 'google', score: 4.1, reviews: 2423, url: gmaps('Al Olayan Ajyad Hotel Makkah') }],
    faq: [
      {
        q: "Kenapa di jadwal ditulis 'EX ALMASSA'?",
        a: 'Karena gedungnya dulu dioperasikan sebagai properti Al Massa, sekarang dikelola Al Olayan Hotels Group. Hotel dan alamatnya sama, yang ganti pengelolanya. Jadi kalau jamaah mencari "Al Massa Ajyad" lalu yang muncul Al Olayan Ajyad, itu memang hotel yang benar.',
      },
      {
        q: 'Sedekat apa ke Masjidil Haram?',
        a: "Koordinat Google-nya ±320 m dari Ka'bah, jadi gedungnya praktis menempel batas kompleks Haram di sisi Ajyad — sekitar 3 menit jalan kaki lewat Gerbang King Abdul Aziz. Kalau ada OTA yang menulis 500 m, itu panjang rute memutar, bukan garis lurus.",
      },
      {
        q: 'Bintang berapa sebenarnya?',
        a: 'Tergantung sumber: Google mencatat bintang 4, sebagian OTA bintang 3, dan situs resmi grupnya menulis bintang 1 — yang terakhir hampir pasti salah isi. Aman menyebutnya setara bintang 4 kelas Ajyad, tapi jangan menjanjikan standar bintang 5.',
      },
      {
        q: 'Jalurnya ramah jamaah sepuh?',
        a: 'Jalur Ajyad ke Gerbang King Abdul Aziz relatif datar dan tetap terbuka saat area lain padat, jadi lebih ringan buat sepuh dibanding rute menanjak. Situs resmi hotel juga menyebut ada layanan antar-jemput ke Haram — konfirmasi ketersediaannya ke handling sebelum berangkat.',
      },
      {
        q: 'Apa yang perlu saya konfirmasi ke handling?',
        a: 'Tiga hal: kapasitas kamar (ada triple/quad atau tidak), ketersediaan antar-jemput Haram, dan menu sarapan. Hotel ini paling sedikit mempublikasikan detail operasional dibanding hotel Ajyad lain yang kita pakai, jadi jangan menjanjikan apa pun sebelum dikonfirmasi.',
      },
    ],
  },
  {
    name: 'Grand Plaza Al Madina',
    city: 'madinah',
    stars: 4,
    distance_label: '±100m',
    walk_label: '±5 menit jalan kaki ke pelataran utara via Pasar Al Saha',
    area: "Bada'ah (Markaziyah Utara)",
    address: "Abu Ayyub Al-Ansari, Bada'ah, Madinah 42311, Arab Saudi (kompleks Pasar Al Saha)",
    gmaps_url: gmaps('Grand Plaza Al Madina Madinah'),
    agent_note:
      "Di jadwal tertulis 'GRAND PLAZA' (JBU1617). Dikonfirmasi user 2026-09-07: properti Maysan Group (ex Al Salhiya Tibah) — BUKAN Grand Plaza Al Maqam atau Grand Plaza Badr Al Maqam yang bersebelahan.",
    description:
      'Grand Plaza Al Madina — dulu bernama Al Salhiya Tibah — adalah hotel 451 kamar milik Maysan Group, grup yang sama dengan Al Massa Grand dan Maysan Al Maqam. Letaknya di blok Bada\'ah, menyatu dengan kompleks Pasar Al Saha di sisi utara Masjid Nabawi, satu deret dengan Golden Tulip Al Zahbi dan Al Eiman Royal. Sebagian kamar menghadap masjid, ada lantai executive, dan hotel menyediakan kamar khusus tamu berkebutuhan khusus lengkap dengan ramp, lift, dan parkir yang bisa diakses kursi roda.\n\nHati-hati dengan angka jarak yang beredar: situs resmi menulis 50 m, beberapa situs Indonesia menulis 700 m, dan keduanya keliru. Koordinat resmi Google menempatkan hotel ±210 m garis lurus dari bangunan masjid — sekitar 5 menit jalan kaki sampai pelataran utara. Angka 700 m muncul karena sebagian situs menggeocode plus code di alamatnya, yang jatuh ±400 m di sisi selatan masjid, bukan di posisi hotel sebenarnya.\n\nYang perlu disampaikan sejak awal ke jamaah: skor Google-nya 3,6 dari 3.143 ulasan, di bawah rata-rata hotel Markaziyah lain yang kita pakai, dengan keluhan berulang di kebersihan dan konsistensi layanan. Kekuatan hotel ini adalah lokasi, kapasitas kamar, dan akses kursi roda — bukan kualitas kamarnya.',
    facilities: ['Wi-Fi', 'AC', 'Lift', 'Resepsionis 24 Jam', 'Restoran', 'Room Service', 'Laundry', 'TV Layar Datar', 'Kulkas Mini', 'Brankas', 'Kursi Roda', 'Parkir Gratis', 'Kafe', 'Sarapan Prasmanan'],
    ratings: [{ platform: 'google', score: 3.6, reviews: 3143, url: gmaps('Grand Plaza Al Madina Madinah') }],
    faq: [
      {
        q: 'Ini Grand Plaza yang mana? Di Madinah ada beberapa.',
        a: 'Yang dipakai adalah Grand Plaza Al Madina milik Maysan Group, ex Al Salhiya Tibah, di blok Pasar Al Saha sisi utara masjid. Beda properti dari Grand Plaza Al Maqam dan Grand Plaza Badr Al Maqam yang letaknya persis bersebelahan — namanya mirip, hotelnya lain.',
      },
      {
        q: 'Berapa jarak sebenarnya ke Masjid Nabawi?',
        a: '±210 m garis lurus ke bangunan masjid menurut koordinat Google, sekitar 5 menit jalan kaki sampai pelataran utara. Abaikan klaim 50 m di situs resmi dan 700 m di beberapa situs Indonesia; angka 700 m berasal dari plus code di alamatnya yang jatuh di lokasi yang salah.',
      },
      {
        q: 'Ramah kursi roda?',
        a: 'Iya, ini kekuatannya. Ada kamar khusus tamu berkebutuhan khusus, ramp, lift dan parkir yang bisa diakses kursi roda, plus jalur datar ke pelataran utara. Cocok untuk rombongan yang banyak jamaah sepuhnya.',
      },
      {
        q: 'Kamarnya berapa, ada yang menghadap masjid?',
        a: '451 kamar deluxe dan suite, sebagian menghadap Masjid Nabawi, dan ada lantai executive di lantai 11. Kamar standar dapat AC, TV satelit, Wi-Fi gratis, kulkas mini, dan brankas digital. Tipe triple atau quad tidak dirinci sumber resmi — konfirmasi ke handling.',
      },
      {
        q: 'Apa yang perlu saya kasih tahu jamaah dari awal?',
        a: 'Skor Google-nya 3,6 dari 3.143 ulasan, di bawah hotel Markaziyah lain yang kita pakai, dengan keluhan paling sering soal kebersihan dan konsistensi layanan. Hotelnya juga berada di atas pusat belanja Al Saha jadi ramai — sisi baiknya, tempat makan dan oleh-oleh ada di bawah.',
      },
    ],
  },
  {
    name: 'Elifim Resort',
    city: 'turki',
    stars: 4,
    area: 'Gerede, Bolu',
    address: 'Yeni Mah., Karabük Cd. No: 14/1, 14900 Gerede/Bolu, Türkiye',
    gmaps_url: gmaps('Elifim Resort Hotel Gerede Bolu'),
    agent_note: "Di jadwal tertulis 'ELIFIM RESOT' (JBU1510, JBU1600, JBU1614) — ejaan resminya Elifim Resort.",
    description:
      'Elifim Resort berdiri di simpang D100 dan D750 di Gerede, titik istirahat baku pada rute darat Istanbul–Ankara. Untuk paket Turki 15 hari kereta cepat, hotel ini praktis berfungsi sebagai tempat menginap malam transit, bukan destinasi wisata: resor ski Esentepe 4 km dan reruntuhan Kastil Gerede 5 km, sisanya jalan raya.\n\nSkor Google-nya 4,8 dari 3.671 ulasan — tertinggi di antara seluruh hotel Turki yang kita pakai. Ulasan terbaru berbahasa Turki memuji kebersihan kamar, keramahan staf, dan yang jarang disebut hotel lain: kesiapan proteksi kebakaran, dengan alarm dan sprinkler di kamar serta denah evakuasi dan hidran di koridor. Sarapan dinilai baik dengan zaitun dan keju yang memadai serta telur dadar yang dibuat sesuai pesanan; keluhan yang muncul hanya pilihan roti yang terbatas.\n\nFasilitasnya di atas kelas hotel transit: spa dan wellness, sauna, kolam renang indoor, pusat kebugaran, taman, teras berjemur, ruang permainan, serta penitipan dan sekolah ski musim dingin. Restorannya menyajikan masakan Turki dengan pilihan halal.',
    facilities: ['Wi-Fi', 'AC', 'Restoran', 'Sarapan Prasmanan', 'Parkir Gratis', 'Pusat Kebugaran', 'Kolam Renang Indoor', 'Sauna', 'Spa & Hammam', 'Taman', 'Teras Atap', 'Kamar Keluarga', 'Resepsionis 24 Jam', 'Lift'],
    ratings: [{ platform: 'google', score: 4.8, reviews: 3671, url: gmaps('Elifim Resort Hotel Gerede Bolu') }],
    faq: [
      {
        q: 'Ini hotel wisata atau hotel transit?',
        a: 'Transit. Gerede ada di simpang D100–D750, tempat rombongan bermalam di tengah perjalanan darat Istanbul–Ankara. Di sekitarnya cuma resor ski Esentepe (4 km) dan reruntuhan Kastil Gerede (5 km), jadi jangan menjanjikan agenda wisata dari hotel ini.',
      },
      {
        q: 'Kualitasnya bagaimana dibanding hotel Turki kita yang lain?',
        a: 'Paling tinggi. Skor Google-nya 4,8 dari 3.671 ulasan, di atas semua hotel Turki lain di direktori ini. Ulasan memuji kebersihan, staf, dan proteksi kebakaran kamar. Ini termasuk hotel yang aman dipakai sebagai nilai jual, bukan sekadar tempat tidur semalam.',
      },
      {
        q: 'Sarapannya bagaimana?',
        a: 'Dinilai baik oleh ulasan terbaru: variasi zaitun dan keju memadai, dan telur dadar dibuat sesuai pesanan kalau diminta. Keluhan yang muncul hanya pilihan roti yang terbatas — praktis cuma roti tawar dan croissant.',
      },
      {
        q: 'Ada fasilitas untuk mengisi waktu?',
        a: 'Ada spa dan wellness, sauna, kolam renang indoor, pusat kebugaran, taman, teras berjemur, dan ruang permainan. Di musim dingin hotel juga menyediakan penitipan dan sekolah ski karena dekat Esentepe.',
      },
      {
        q: 'Makanannya halal?',
        a: 'Restorannya menyajikan masakan Turki dengan pilihan halal menurut keterangan hotel. Untuk rombongan, tetap konfirmasikan menu dan jam makan ke handling karena kedatangan biasanya malam dan berangkat lagi pagi.',
      },
    ],
  },
  {
    name: 'Karpalas City Hotel & Spa',
    city: 'turki',
    stars: 4,
    area: 'Kasaplar (Merkez), Bolu',
    address: 'Kasaplar Mah., D-100 Karayolu üzeri No: 26, 14100 Bolu Merkez/Bolu, Türkiye',
    gmaps_url: gmaps('Karpalas City Hotel & Spa Bolu'),
    agent_note: "Di jadwal tertulis 'KARPALAS' (JBU1496, JBU1565).",
    description:
      'Karpalas City Hotel & Spa berada di tepi jalan raya D-100 di pusat Bolu, sekitar dua kilometer dari kota ke arah Istanbul. Seperti Elifim Resort di Gerede, fungsinya di paket Turki adalah bermalam di tengah rute darat — bedanya Karpalas lebih dekat ke pusat kota Bolu.\n\nSkor Google-nya 4,4 dari 2.272 ulasan, kuat untuk kelasnya. Yang paling sering dipuji: tempat tidur nyaman dan suasana tenang. Fasilitas spa-nya lengkap untuk hotel transit — hammam, sauna, ruang uap, hot tub, dan berbagai pilihan pijat termasuk untuk pasangan. Restorannya memadukan masakan Ottoman dan khas Bolu dengan menu internasional, dan sarapan prasmanannya bervariasi.\n\nUntuk rombongan berisi keluarga, hotel punya kids club, kolam anak, dan area bermain — jarang ada di hotel transit. Tersedia juga kolam renang indoor, pusat kebugaran, taman, teras, dan bar, plus resepsionis 24 jam serta layanan antar-jemput bandara. Aksesibilitas kursi roda disebut tersedia; konfirmasikan detail kamarnya ke handling kalau ada jamaah yang membutuhkan.',
    facilities: ['Wi-Fi', 'AC', 'Restoran', 'Sarapan Prasmanan', 'Parkir Gratis', 'Kolam Renang Indoor', 'Spa & Hammam', 'Sauna', 'Pusat Kebugaran', 'Bar/Lounge', 'Taman', 'Kamar Keluarga', 'Kursi Roda', 'Resepsionis 24 Jam', 'Antar-Jemput Bandara', 'Lift'],
    ratings: [{ platform: 'google', score: 4.4, reviews: 2272, url: gmaps('Karpalas City Hotel & Spa Bolu') }],
    faq: [
      {
        q: 'Bedanya dengan Elifim Resort di Gerede apa?',
        a: 'Dua-duanya hotel bermalam di rute darat provinsi Bolu. Karpalas ada di pusat Bolu di tepi D-100, Elifim di Gerede sekitar 50 km ke arah timur. Karpalas lebih dekat kota dan punya fasilitas anak; Elifim skor ulasannya lebih tinggi.',
      },
      {
        q: 'Cocok untuk rombongan yang bawa anak?',
        a: 'Cocok. Ini salah satu dari sedikit hotel transit yang punya kids club, kolam anak, dan area bermain, ditambah kolam renang indoor. Untuk rombongan keluarga, ini bisa jadi nilai jual yang nyata.',
      },
      {
        q: 'Fasilitas spa-nya apa saja?',
        a: 'Hammam, sauna, ruang uap, hot tub, dan berbagai pilihan pijat termasuk deep tissue, sport, Swedish, dan Thai, plus perawatan aromaterapi. Sebagian layanan pijat berbayar terpisah — pastikan jamaah tahu mana yang termasuk paket.',
      },
      {
        q: 'Makanannya bagaimana?',
        a: 'Restorannya memadukan masakan Ottoman dan khas Bolu dengan menu internasional, dan sarapan prasmanannya disebut bervariasi oleh banyak ulasan. Bolu memang dikenal sebagai kota juru masak di Turki, jadi standar dapurnya cenderung baik.',
      },
      {
        q: 'Ramah kursi roda?',
        a: 'Keterangan hotel menyebut properti ini dapat diakses, tapi detail kamar khusus tidak dirinci. Kalau ada jamaah yang memakai kursi roda, konfirmasikan tipe kamar dan jalur masuknya ke handling sebelum keberangkatan.',
      },
    ],
  },
  {
    name: 'Connect Thermal Hotel',
    city: 'turki',
    stars: 5,
    area: 'Kahramankazan, Ankara',
    address: 'Kayı Mah., Kayıboyu Cd. No: 20, 06980 Kahramankazan/Ankara, Türkiye',
    gmaps_url: gmaps('Connect Thermal Hotel Ankara'),
    agent_note: "Di jadwal tertulis 'CONNECT HOTEL' pada kota ankara (JBU1614, berangkat 11 Jan 2027).",
    description:
      'Connect Thermal Hotel adalah hotel termal bintang 5 dengan 124 kamar di Kahramankazan, di tepi jalan D750 sebelah utara Ankara. Yang wajib diluruskan sejak awal: meskipun di jadwal masuk sebagai hotel "Ankara", jaraknya sekitar 48 km dari pusat kota Ankara. Jamaah yang membayangkan bisa jalan-jalan sendiri ke kota akan kecewa — di sekitar hotel praktis tidak ada apa-apa selain Museum Martir 15 Juli (3 km) dan area rekreasi Bendungan Kurtboğazı (11 km).\n\nSebagai gantinya, hotel ini menjual fasilitas termalnya: kolam air panas alami, hammam, kolam renang indoor dan outdoor, serta pusat kebugaran. Kamarnya dilengkapi sofa, meja kerja, dan minibar, sebagian menghadap taman. Skor Google-nya 4,3 dari 1.545 ulasan, wajar untuk kelasnya.\n\nLayanan yang perlu dikonfirmasi ke handling: shuttle bandara berbayar (bukan gratis) dan check-in privat. Parkir gratis di lokasi. Restoran keluarganya menyajikan masakan Turki dengan penganan lokal.',
    facilities: ['Wi-Fi', 'AC', 'Restoran', 'Sarapan Prasmanan', 'Parkir Gratis', 'Kolam Termal', 'Kolam Renang Indoor', 'Kolam Renang Outdoor', 'Spa & Hammam', 'Pusat Kebugaran', 'Resepsionis 24 Jam', 'Shuttle Bandara', 'Kulkas Mini', 'Meja Kerja', 'Lift'],
    ratings: [{ platform: 'google', score: 4.3, reviews: 1545, url: gmaps('Connect Thermal Hotel Ankara') }],
    faq: [
      {
        q: 'Ini di Ankara kota, ya?',
        a: 'Bukan. Hotelnya di Kahramankazan, sekitar 48 km dari pusat kota Ankara, di tepi jalan D750. Di jadwal memang masuk kolom "ankara", tapi jangan menjanjikan jamaah bisa keluar jalan-jalan ke kota sendiri dari hotel ini.',
      },
      {
        q: 'Kalau begitu apa yang bisa dinikmati di sana?',
        a: 'Fasilitas termalnya: kolam air panas alami, hammam, kolam renang indoor dan outdoor, serta pusat kebugaran. Di luar hotel praktis hanya Museum Martir 15 Juli (3 km) dan area rekreasi Bendungan Kurtboğazı (11 km).',
      },
      {
        q: 'Bintang 5-nya beneran?',
        a: 'Klasifikasinya bintang 5 dan skor Google-nya 4,3 dari 1.545 ulasan — konsisten, tidak ada tanda klaim yang kejauhan. Tapi ini hotel termal pinggir kota, bukan hotel kota mewah; standarnya beda dengan bintang 5 di Istanbul.',
      },
      {
        q: 'Ada antar-jemput bandara?',
        a: 'Ada, tapi berbayar menurut keterangan hotel, bukan gratis. Karena rombongan biasanya pakai bus paket, pastikan ke handling apakah transfer ini dipakai atau tidak supaya tidak ada biaya kejutan.',
      },
      {
        q: 'Kamarnya seperti apa?',
        a: '124 kamar ber-AC dengan sofa, meja kerja, dan minibar; sebagian menghadap taman. Tipe kamar untuk rombongan tidak dirinci sumber resmi — konfirmasikan ketersediaan triple ke handling.',
      },
    ],
  },
  {
    name: 'Ephesus Hitit Hotel',
    city: 'turki',
    stars: 4,
    area: 'İsa Bey, Selçuk (İzmir)',
    address: 'İsa Bey Mah., Atatürk Cd. No: 24, 35920 Selçuk/İzmir, Türkiye',
    gmaps_url: gmaps('Ephesus Hitit Hotel Selcuk'),
    agent_note:
      "Di jadwal tertulis 'HITIT' pada kota kusadasi (JBU1603, berangkat 13 Des 2026). Lokasi sebenarnya di Selçuk, bukan Kuşadası.",
    description:
      'Ephesus Hitit Hotel berada di Jalan Atatürk, jalan utama Selçuk — kota kecil tepat di sebelah situs Efesus. Ini perlu diluruskan karena di jadwal hotel ini masuk kolom "kusadasi": Selçuk dan Kuşadası dua kota berbeda yang berjarak sekitar 20 km. Sisi baiknya, posisi ini justru paling dekat ke agenda wisatanya — Basilika Santo Yohanes 1 km, Kuil Artemis 2 km, dan Bandara Selçuk–Efes 6 km. Yang tidak didapat jamaah adalah suasana kota pantai Kuşadası.\n\nHotel ini punya 96 kamar ber-AC dengan minibar, brankas, dan sebagian berbalkon, ditambah kolam renang outdoor, hot tub, pusat kebugaran 24 jam, dan dua restoran.\n\nYang harus disampaikan sejak awal: skor Google-nya 3,6 dari 2.562 ulasan — terendah di antara hotel Turki yang kita pakai. Keluhan yang paling menonjol justru soal restorannya, ada tamu yang menyebut makanannya buruk. Untuk rombongan, amankan dulu kesepakatan menu dengan handling, dan jangan menjual hotel ini lewat kulinernya.',
    facilities: ['Wi-Fi', 'AC', 'Restoran', 'Sarapan Prasmanan', 'Kolam Renang Outdoor', 'Pusat Kebugaran', 'Parkir Gratis', 'Bar/Lounge', 'Brankas', 'Kulkas Mini', 'Balkon (Sebagian)', 'Resepsionis 24 Jam', 'Lift'],
    ratings: [{ platform: 'google', score: 3.6, reviews: 2562, url: gmaps('Ephesus Hitit Hotel Selcuk') }],
    faq: [
      {
        q: 'Di jadwal tertulis Kusadasi, tapi hotelnya di Selçuk?',
        a: 'Betul, dan ini perlu diluruskan ke jamaah. Hotelnya di Jalan Atatürk, Selçuk — kota kecil di sebelah situs Efesus, sekitar 20 km dari Kuşadası. Jamaah yang membayangkan menginap di kota pantai Kuşadası akan kecewa.',
      },
      {
        q: 'Kalau begitu untungnya apa menginap di Selçuk?',
        a: 'Paling dekat ke agenda wisatanya: Basilika Santo Yohanes 1 km, Kuil Artemis 2 km, situs Efesus tepat di sebelah kota, dan Bandara Selçuk–Efes 6 km. Waktu di bus berkurang, waktu di situs bertambah.',
      },
      {
        q: 'Apa kelemahan terbesarnya?',
        a: 'Skor Google-nya 3,6 dari 2.562 ulasan, terendah di antara hotel Turki yang kita pakai. Keluhan yang paling menonjol soal restoran hotel — ada ulasan yang terang-terangan menyebut makanannya buruk. Amankan kesepakatan menu dengan handling sebelum berangkat.',
      },
      {
        q: 'Kamarnya bagaimana?',
        a: '96 kamar ber-AC dengan minibar dan brankas, sebagian punya balkon. Tersedia kolam renang outdoor, hot tub, dan pusat kebugaran 24 jam. Tipe kamar untuk rombongan tidak dirinci sumber resmi.',
      },
      {
        q: 'Apa yang sebaiknya saya sampaikan ke jamaah dari awal?',
        a: 'Dua hal: hotelnya di Selçuk bukan Kuşadası, dan restorannya bukan kekuatan hotel ini. Jual lewat kedekatannya ke Efesus. Kalau paketnya menjanjikan suasana Kuşadası, cek ulang ke tim paket sebelum dijanjikan ke jamaah.',
      },
    ],
  },
  {
    name: 'Richmond Pamukkale Thermal',
    city: 'turki',
    stars: 5,
    area: 'Karahayıt (Pamukkale), Denizli',
    address: 'Karahayıt Mah., 20290 Pamukkale/Denizli, Türkiye',
    gmaps_url: gmaps('Richmond Pamukkale Thermal Karahayit'),
    agent_note: "Di jadwal tertulis 'RICHMOND THERMAL' pada kota pamukkale (JBU1603, berangkat 13 Des 2026).",
    description:
      'Richmond Pamukkale Thermal adalah resor termal 315 kamar di Karahayıt, desa air panas beberapa kilometer di utara travertin Pamukkale. Hotel ini sudah beroperasi puluhan tahun dan direnovasi menyeluruh pada 2015. Hierapolis dan travertin merah Karahayıt sama-sama sekitar lima menit berkendara.\n\nFasilitasnya paling lengkap di antara hotel Turki yang kita pakai: kolam termal indoor dan outdoor, spa dengan hammam, sauna, gua terapi, dan gym, ditambah ruang permainan, tenis meja, serta lapangan basket, voli pantai, panahan, dan mini golf di taman berpohon pinus. Ada dua bar dan restoran utama.\n\nSatu catatan jujur untuk agent: skor Google-nya 4,3 dari 7.501 ulasan — bagus dan berbasis sampel besar — tapi penilaian di Tripadvisor jauh lebih rendah, dan ada ulasan yang menyebut hotel ini tidak terasa bintang 5, terutama soal tata letak bangunannya yang membingungkan. Jual lewat fasilitas termal dan kedekatannya ke Pamukkale, dan siapkan jamaah bahwa gedungnya luas dan menyebar sehingga jalan kaki di dalam hotel lumayan jauh.',
    facilities: ['Wi-Fi', 'AC', 'Restoran', 'Sarapan Prasmanan', 'Kolam Termal', 'Kolam Renang Indoor', 'Kolam Renang Outdoor', 'Spa & Hammam', 'Sauna', 'Pusat Kebugaran', 'Bar/Lounge', 'Taman', 'Parkir Gratis', 'Kamar Keluarga', 'Resepsionis 24 Jam', 'Lift'],
    ratings: [{ platform: 'google', score: 4.3, reviews: 7501, url: gmaps('Richmond Pamukkale Thermal Karahayit') }],
    faq: [
      {
        q: 'Seberapa dekat ke travertin Pamukkale?',
        a: 'Hotelnya di Karahayıt, beberapa kilometer di utara travertin. Hierapolis dan travertin merah Karahayıt sama-sama sekitar lima menit berkendara. Jadi dekat, tapi tetap perlu kendaraan — bukan jalan kaki.',
      },
      {
        q: 'Fasilitasnya apa saja?',
        a: 'Paling lengkap di antara hotel Turki kita: kolam termal indoor dan outdoor, spa dengan hammam, sauna, gua terapi, dan gym, ruang permainan, tenis meja, serta lapangan basket, voli pantai, panahan, dan mini golf di taman pinus. Ada dua bar dan restoran utama.',
      },
      {
        q: 'Bintang 5-nya sesuai kenyataan?',
        a: 'Sebagian. Skor Google 4,3 dari 7.501 ulasan itu bagus dan sampelnya besar, tapi penilaian di Tripadvisor jauh lebih rendah dan ada ulasan yang menyebut hotel ini tidak terasa bintang 5. Aman menjualnya sebagai resor termal besar, bukan hotel mewah.',
      },
      {
        q: 'Ada yang perlu diantisipasi soal bangunannya?',
        a: 'Iya. Gedungnya luas dan menyebar dengan tata letak yang beberapa tamu sebut membingungkan, jadi jalan kaki dari kamar ke restoran atau kolam bisa lumayan jauh. Beri tahu jamaah sepuh sejak awal dan minta kamar yang dekat lift.',
      },
      {
        q: 'Hotelnya baru atau lama?',
        a: 'Lama tapi sudah direnovasi menyeluruh pada 2015; propertinya sendiri sudah beroperasi puluhan tahun dengan 315 kamar. Jangan menjanjikan gedung baru — yang dijual di sini fasilitas termal dan lokasinya.',
      },
    ],
  },
];

async function main() {
  const { data: slugRows, error: slugError } = await supabase.from('hotels').select('slug');
  if (slugError) throw slugError;
  const existing = (slugRows || []).map((r) => r.slug);

  const { data: nameRows, error: nameError } = await supabase.from('hotels').select('name, slug, city');
  if (nameError) throw nameError;
  const takenNames = new Set((nameRows || []).map((r) => `${r.city}|${r.name.toLowerCase()}`));

  let inserted = 0;
  let skipped = 0;
  for (const input of HOTELS) {
    const built = buildHotelPayload(input);
    if (!built.ok) {
      console.error(`  GAGAL VALIDASI  ${input.name}: ${built.error}`);
      process.exitCode = 1;
      continue;
    }
    // Dua penjaga idempotensi: slug turunan nama DAN pasangan kota+nama, supaya
    // menjalankan ulang tidak membuat "-2" duplikat dari baris yang sama.
    const slug = slugifyHotelName(built.data.name, []);
    if (existing.includes(slug) || takenNames.has(`${built.data.city}|${built.data.name.toLowerCase()}`)) {
      console.log(`  LEWAT           ${built.data.name} (sudah ada)`);
      skipped += 1;
      continue;
    }
    if (DRY) {
      console.log(`  [dry] TAMBAH    ${slug} — ${built.data.name} [${built.data.city}] ★${built.data.stars}`);
      inserted += 1;
      continue;
    }
    const { error } = await supabase.from('hotels').insert({ slug, ...built.data }).select('slug').single();
    if (error) {
      console.error(`  GAGAL INSERT    ${built.data.name}: ${error.message}`);
      process.exitCode = 1;
      continue;
    }
    existing.push(slug);
    console.log(`  TAMBAH          ${slug} — ${built.data.name} [${built.data.city}] ★${built.data.stars}`);
    inserted += 1;
  }
  console.log(`\n${DRY ? '[dry] ' : ''}Selesai: ${inserted} ditambahkan, ${skipped} dilewati.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
