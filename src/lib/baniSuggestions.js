// Pool + pengundi saran "Coba tanyakan" di Bani. Murni data + fungsi (tanpa
// React/DOM/jaringan) supaya bisa diuji di tests/bani-suggestions.test.js;
// komponen (src/components/bani/BaniPage.tsx) yang memetakan nama ikon ke
// komponen lucide dan menyimpan riwayat tampil ke localStorage.
//
// ATURAN ISI DAFTAR — tiga-tiganya berasal dari kegagalan nyata:
//  1. TANPA tahun/bulan hardcoded ("Desember 2026", "keberangkatan Agustus") —
//     pertanyaan begitu basi sendiri. Pakai kata relatif; tanggal hari ini sudah
//     disuntikkan ke system prompt (lib/bani-orchestrator.js).
//  2. Selalu dari sudut pandang agent ("jamaah saya"). "Berapa pax di
//     keberangkatan terdekat?" dibuang karena dijawab dari kalender = KUOTA
//     NASIONAL, bukan jamaah agent ybs.
//  3. Setiap baris DIUJI end-to-end lewat runBaniConversation + data nyata
//     sebelum masuk daftar. Yang dibuang pada audit 4 Agt 2026:
//     - "Paket 9 hari termurah berangkat kapan?" → list_jadwal_paket tidak punya
//       filter durasi, model menyerah dengan "data tidak ditemukan" padahal ada.
//     - "Jamaah mana yang paling besar sisa tagihannya?" → list_jamaah terurut
//       tgl_berangkat dan dipangkas 20 baris, jadi jawabannya MASUK AKAL TAPI
//       SALAH (Rp38,9jt vs Rp44,7jt yang sebenarnya). Paling berbahaya.
//     - "Di mana link brosur paket terdekat?" → model menjawab dengan link
//       markdown, sedangkan renderBaniMarkdown hanya kenal **tebal**/daftar →
//       URL tampil mentah.
//     - "Paket promo di bawah Rp30 juta masih ada?" → ambang harga ikut basi;
//       diganti "paket termurah yang masih ada seat".
//     - "Siapa yang belum bayar DP tapi berangkat 30 hari lagi?" → window 30
//       hari nyaris selalu kosong (yang belum DP adalah keberangkatan jauh);
//       diganti window 90 hari yang memang berisi.

/** @type {import('./baniSuggestions').BaniSuggestionGroup[]} */
export const BANI_SUGGESTION_GROUPS = ['paket', 'bayar', 'jamaah', 'agenda'];

// Berapa saran terakhir yang diingat supaya tidak langsung tampil lagi. 8 = dua
// putaran undian: sebuah saran baru boleh muncul lagi paling cepat pada kunjungan
// ketiga, sementara tiap grup masih menyisakan ≥3 kandidat segar.
export const BANI_SUGGESTION_MEMORY = 8;

/** @type {import('./baniSuggestions').BaniSuggestion[]} */
export const BANI_SUGGESTION_POOL = [
  // Paket & harga — pekerjaan menjual: cari seat, cari harga, hitung penawaran.
  { group: 'paket', icon: 'plane', text: 'Paket terdekat yang masih ada seat apa saja?' },
  { group: 'paket', icon: 'clock', text: 'Paket terdekat yang seat-nya tinggal sedikit apa saja?' },
  { group: 'paket', icon: 'wallet', text: 'Paket termurah yang masih ada seat berapa harganya?' },
  { group: 'paket', icon: 'wallet', text: 'Paket promo yang masih ada seat 3 bulan ke depan apa saja?' },
  { group: 'paket', icon: 'plane', text: 'Paket apa saja yang masih ada seat 3 bulan ke depan?' },
  { group: 'paket', icon: 'building', text: 'Hotel Mekkah dan Madinah di paket terdekat apa?' },
  { group: 'paket', icon: 'calculator', text: 'Bandingkan harga kamar quad, triple, dan double di paket terdekat' },
  { group: 'paket', icon: 'calculator', text: 'Hitung biaya 2 jamaah kamar quad di paket terdekat' },
  { group: 'paket', icon: 'calculator', text: 'Hitung biaya 2 dewasa quad plus 1 anak tanpa kasur di paket terdekat' },

  // Pembayaran — pekerjaan menagih: siapa yang harus dikejar, berapa nilainya.
  { group: 'bayar', icon: 'wallet', text: 'Siapa jamaah saya yang belum lunas dan berangkat bulan ini?' },
  { group: 'bayar', icon: 'wallet', text: 'Siapa jamaah saya yang belum bayar DP untuk keberangkatan 90 hari ke depan?' },
  { group: 'bayar', icon: 'wallet', text: 'Berapa sisa tagihan jamaah saya yang berangkat 30 hari ke depan?' },
  { group: 'bayar', icon: 'wallet', text: 'Berapa total outstanding jamaah saya 90 hari ke depan?' },
  { group: 'bayar', icon: 'calendar-range', text: 'Ringkas status pembayaran jamaah saya per bulan keberangkatan' },
  { group: 'bayar', icon: 'calendar-range', text: 'Rekap tagihan jamaah saya per tanggal keberangkatan 30 hari ke depan' },
  { group: 'bayar', icon: 'users', text: 'Berapa jamaah saya yang sudah lunas dan berangkat 30 hari ke depan?' },

  // Jamaah — siapa yang berangkat, kapan, dan momen untuk menyapa.
  { group: 'jamaah', icon: 'plane', text: 'Siapa saja jamaah saya yang berangkat 7 hari ke depan?' },
  { group: 'jamaah', icon: 'clock', text: 'Siapa jamaah saya yang paling dekat keberangkatannya?' },
  { group: 'jamaah', icon: 'users', text: 'Berapa jamaah saya yang berangkat bulan depan?' },
  { group: 'jamaah', icon: 'users', text: 'Berapa jamaah saya yang berangkat 3 bulan ke depan?' },
  { group: 'jamaah', icon: 'users', text: 'Berapa total jamaah saya yang akan berangkat?' },
  { group: 'jamaah', icon: 'cake', text: 'Siapa jamaah saya yang ulang tahun 7 hari ke depan?' },
  { group: 'jamaah', icon: 'cake', text: 'Siapa jamaah saya yang ulang tahun bulan ini?' },

  // Agenda operasional — yang biasanya ditanyakan jamaah balik ke agent.
  { group: 'agenda', icon: 'calendar', text: 'Kapan manasik berikutnya dan siapa pembimbingnya?' },
  { group: 'agenda', icon: 'calendar', text: 'Ada jadwal manasik dalam 30 hari ke depan?' },
  { group: 'agenda', icon: 'clock', text: 'Jam berapa dan di mana titik kumpul keberangkatan terdekat?' },
  { group: 'agenda', icon: 'users', text: 'Siapa Tour Leader keberangkatan terdekat?' },
  { group: 'agenda', icon: 'users', text: 'Siapa mutawif yang mendampingi keberangkatan terdekat?' },
  { group: 'agenda', icon: 'calendar-range', text: 'Ada keberangkatan grup apa saja minggu ini?' },
];

function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Undi saran yang tampil. Dua hal yang membuatnya terasa baru tiap kunjungan:
 * satu saran per grup (jadi keempatnya selalu membentang dari jualan sampai
 * agenda, bukan empat pertanyaan tagihan) dan `recent` — teks yang baru saja
 * tampil ditaruh di urutan belakang, bukan dibuang, supaya grup yang habis
 * kandidat segarnya tetap mengeluarkan sesuatu.
 * @type {import('./baniSuggestions').pickBaniSuggestions}
 */
export function pickBaniSuggestions(count = 4, recent = [], random = Math.random) {
  const avoid = new Set(Array.isArray(recent) ? recent : []);
  const byGroup = new Map();
  for (const item of BANI_SUGGESTION_POOL) {
    if (!byGroup.has(item.group)) byGroup.set(item.group, []);
    byGroup.get(item.group).push(item);
  }

  const picked = [];
  const leftovers = [];
  for (const group of shuffle([...byGroup.keys()], random)) {
    const items = shuffle(byGroup.get(group), random);
    const ordered = [...items.filter((i) => !avoid.has(i.text)), ...items.filter((i) => avoid.has(i.text))];
    const takesFirst = picked.length < count;
    if (takesFirst) picked.push(ordered[0]);
    leftovers.push(...(takesFirst ? ordered.slice(1) : ordered));
  }

  // Cadangan bila count melebihi jumlah grup — tetap yang belum lama tampil dulu.
  for (const item of [...leftovers.filter((i) => !avoid.has(i.text)), ...leftovers.filter((i) => avoid.has(i.text))]) {
    if (picked.length >= count) break;
    picked.push(item);
  }
  return picked.slice(0, count);
}

/**
 * Gabungkan saran yang baru tampil ke daftar ingatan (terbaru di depan, dipotong
 * `max`). Dipisah dari pickBaniSuggestions supaya pemanggil bebas memutuskan
 * kapan menyimpannya.
 * @type {import('./baniSuggestions').rememberBaniSuggestions}
 */
export function rememberBaniSuggestions(recent, picked, max = BANI_SUGGESTION_MEMORY) {
  const fresh = (Array.isArray(picked) ? picked : [])
    .map((item) => (typeof item === 'string' ? item : item?.text))
    .filter((text) => typeof text === 'string' && text);
  const kept = (Array.isArray(recent) ? recent : [])
    .filter((text) => typeof text === 'string' && text && !fresh.includes(text));
  return [...fresh, ...kept].slice(0, Math.max(0, max));
}
