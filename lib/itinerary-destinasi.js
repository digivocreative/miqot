// Pencocokan aktivitas itinerary → foto destinasi (Bunny CDN /foto-destinasi).
// Logika murni tanpa dependensi — dipakai FE (src/components/itinerary/) dan bisa
// dipakai server. Nama file di CDN sudah disesuaikan user dengan nama destinasi.
//
// Aturan tampilan (permintaan 2026-07-31): satu kegiatan maksimal SATU foto
// (kegiatan yang menyebut beberapa tempat wisata ambil salah satu saja), dan
// satu foto hanya tampil SEKALI per itinerary — "sholat di Masjidil Haram"
// berulang tiap hari, fotonya cukup di kemunculan pertama.
// Tambahan 2026-08-14: "salah satu" itu DIGILIR antar itinerary untuk pasangan
// yang selalu bertabrakan di baris yang sama — lihat ROTATION_GROUPS.
import { classifyActivity, isHomeArrival } from './itinerary-view.js';

export const DESTINASI_PHOTO_BASE = 'https://alhijaz.b-cdn.net/foto-destinasi';

// Halaman memakai derivatif webp 800px di subfolder web/ (~40–120KB), BUKAN
// master PNG unggahan user (300–700KB — belasan foto per itinerary bikin
// halaman lemot). Derivatif dibuat scripts/optimize-foto-destinasi.mjs;
// jalankan ulang tiap master di foto-destinasi/ bertambah/berganti.
export function destinationPhotoUrl(file) {
  return `${DESTINASI_PHOTO_BASE}/web/${file.replace(/\.png$/i, '.webp')}`;
}

// Urutan = prioritas saat satu teks menyebut beberapa destinasi (yang pertama
// cocok menang), KECUALI untuk anggota ROTATION_GROUPS yang pemenangnya
// digilir. Yang penting hanya: 'arafah' HARUS di atas 'rahmah' supaya
// "Padang Arafah dan Jabal Rahmah" memakai foto gabungan, bukan foto Jabal
// Rahmah saja. Ejaan PDF beragam — regex menampung varian yang benar-benar
// muncul di tabel itineraries ("Burj Ar Arab", "Cornice", "Khalifah", dst.).
const DESTINASI_PATTERNS = [
  // Indonesia — titik kumpul di Soekarno-Hatta. Dua ruang berbeda dipakai
  // bergantian tergantung terminal: Café Zukavia (T2F/T3) dan Palmeera Lounge
  // (T2F). Ejaan hulu meleset ke "Zukafia", "Palmera", "Palmerra", "Palmeer".
  { file: 'cafe-zukavia.png', label: 'Café Zukavia', re: /zuka[vf]ia/i },
  { file: 'palmeera-lounge.png', label: 'Palmeera Lounge', re: /palme+r+a?\b/i },
  // Saudi — situs suci & ziarah
  { file: 'masjidil-haram.png', label: 'Masjidil Haram', re: /masjidil\s*haram|masjid\s*(?:al[-\s]?)?haram\b|ka['’]?bah|\btawaf|\bthawaf/i },
  { file: 'masjid-nabawi.png', label: 'Masjid Nabawi', re: /nabawi|raud[hl]?ah/i },
  { file: 'masjid-quba.png', label: 'Masjid Quba', re: /\bquba\b/i },
  { file: 'masjid-qiblatain.png', label: 'Masjid Qiblatain', re: /[qk]iblatain/i },
  { file: 'jabal-uhud.png', label: 'Jabal Uhud', re: /\buhud\b/i },
  { file: 'makam-baqi.png', label: 'Makam Baqi', re: /\bbaqi['’]?/i },
  // Jabal Tsur & Padang Arafah nyaris selalu disebut dalam SATU baris ziarah
  // yang sama, jadi urutan di sini tak menentukan pemenangnya — lihat
  // ROTATION_GROUPS di bawah.
  { file: 'jabal-tsur.png', label: 'Jabal Tsur', re: /jabal\s*t[sh]a?ur\b|gua\s*t[sh]a?ur\b/i },
  { file: 'padang-arafah-jabal-rahmah.png', label: 'Padang Arafah', re: /arafah/i },
  { file: 'jabal-rahmah.png', label: 'Jabal Rahmah', re: /\brahmah\b/i },
  { file: 'mina-tenda-putih.png', label: 'Mina', re: /\bmina\b/i },
  // Bir Ali DI ATAS kereta cepat: baris miqat kerap menyebut keduanya
  // ("menuju Bir Ali untuk miqat, lalu ke stasiun kereta cepat Haramain"),
  // dan di baris begitu keretanya SUDAH terwakili badge "KERETA CEPAT" dari
  // classifyActivity — sedangkan Bir Ali tak punya penanda lain. Sejalan juga
  // dengan catatan lib/itinerary-tempat.js: moda transportasi bukan tempat.
  { file: 'masjid-bir-ali.png', label: 'Masjid Bir Ali', re: /\bbir\s*ali\b/i },
  { file: 'kereta-cepat-haramain.png', label: 'Kereta Cepat Haramain', re: /haramain|kereta\s*cepat/i },
  { file: 'kapal-laut-merah-redsea.png', label: 'Laut Merah', re: /laut\s*merah|red\s*sea/i },
  { file: 'pasar-cornice.png', label: 'Pasar Corniche', re: /cornich?e/i },
  // Turki
  { file: 'hagia-sophia.png', label: 'Hagia Sophia', re: /hagia|aya\s*sof/i },
  { file: 'blue-mosque.png', label: 'Blue Mosque', re: /blue\s*mosque|masjid\s*biru|sultan\s*ahmed/i },
  { file: 'bosphorus.png', label: 'Bosphorus', re: /bosph?orus|bosporus/i },
  { file: 'balon-udara-cappadocia.png', label: 'Cappadocia', re: /cappadocia|kapadokya|hot\s*air\s*balloon|balon\s*udara/i },
  { file: 'bursa.png', label: 'Bursa', re: /\bbursa\b/i },
  // Dubai
  { file: 'burj-khalifa.png', label: 'Burj Khalifa', re: /burj\s*khalifah?/i },
  { file: 'burj-al-arab.png', label: 'Burj Al Arab', re: /burj\s*a[lr][-\s]*arab/i },
  { file: 'palm-jumeirah.png', label: 'Palm Jumeirah', re: /jumeirah/i },
  // Mesir
  { file: 'piramida-giza.png', label: 'Piramida Giza', re: /piramida|pyramid|giza|sphinx/i },
  { file: 'alexandria.png', label: 'Alexandria', re: /alexandria|iskandaria/i },
  { file: 'masjid-al-azhar.png', label: 'Masjid Al-Azhar', re: /azhar/i },
];

export function destinationPhotoForText(text) {
  const t = String(text || '');
  if (!t) return null;
  for (const { file, label, re } of DESTINASI_PATTERNS) {
    if (re.test(t)) return { file, label };
  }
  return null;
}

const PATTERN_BY_FILE = new Map(DESTINASI_PATTERNS.map(p => [p.file, p]));

// ── Gantian (permintaan user 2026-08-14) ─────────────────────────────────────
// Baris ziarah Mekkah biasanya menyebut satu rangkaian sekaligus — "Ziarah ke
// Jabal Tsur, Padang Arafah, Jabal Rahmah, Muzdalifah, Mina, dan Jabal Nur" —
// padahal satu kegiatan tetap hanya boleh SATU foto. Dengan urutan prioritas
// tetap, pemenangnya sama di semua paket: diukur pada 289 itinerary produksi,
// siapa pun yang ditaruh di atas akan menang di 216 di antaranya dan lawannya
// TIDAK PERNAH tampil sama sekali. Maka yang digilir bukan jumlah fotonya,
// melainkan siapa yang menang — bergantian antar itinerary.
//
// Penggiliran ini deterministik dari isi itinerary, bukan acak: satu jadwal
// harus menampilkan foto yang sama tiap kali dibuka, dan tampilan web
// (WebItineraryView) wajib sama persis dengan PDF Rencana Perjalanan
// (itineraryPdfBlob). Keduanya memanggil destinationPhotosForDays dengan `days`
// yang sama, jadi seed yang diturunkan dari `days` otomatis sinkron tanpa perlu
// mengoper id jadwal ke dua pemanggil.
const ROTATION_GROUPS = [
  ['jabal-tsur.png', 'padang-arafah-jabal-rahmah.png'],
];

// djb2 + finalizer murmur3. Tak perlu kriptografis — cuma memilih 1 dari 2 —
// tapi WAJIB stabil lintas mesin & versi Node, dan wajib teraduk: bit terendah
// djb2 polos hanyalah paritas jumlah karakter berkode ganjil, jadi `seed % 2`
// tanpa finalizer memberi giliran yang sama untuk itinerary yang berbeda
// (ketahuan lewat tes: 12 varian teks berturut-turut menang semua di satu sisi).
function itineraryFingerprint(days) {
  let h = 5381;
  for (const day of days) {
    for (const raw of (Array.isArray(day?.activities) ? day.activities : [])) {
      const text = String((typeof raw === 'string' ? raw : raw?.text) || '');
      for (let i = 0; i < text.length; i++) h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0;
    }
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Pemenang untuk satu baris, dengan penggiliran kelompok rotasi. Prioritas
 * global tetap dihormati: rotasi hanya berlaku bila pemenang normal memang
 * anggota kelompok, supaya "Ziarah Masjidil Haram lalu Jabal Tsur dan Padang
 * Arafah" tetap memakai foto Masjidil Haram.
 */
function rotatedPhotoForText(text, seed, seen) {
  const base = destinationPhotoForText(text);
  if (!base) return null;
  const group = ROTATION_GROUPS.find(g => g.includes(base.file));
  if (!group) return base;
  // Anggota yang fotonya belum terpakai di itinerary ini. Bila hanya satu yang
  // tersisa, dialah yang tampil — jatah baris ini jangan terbuang jadi kosong
  // gara-gara giliran jatuh ke foto yang sudah muncul di hari sebelumnya.
  const available = group.filter(f => PATTERN_BY_FILE.get(f).re.test(text) && !seen.has(f));
  if (!available.length) return base; // semua sudah tampil — biar dedup yang menolak
  const { file, label } = PATTERN_BY_FILE.get(available[seed % available.length]);
  return { file, label };
}

// Foto bandara menempel ke MOMEN, bukan nama tempat (feedback user 2026-07-31):
// keberangkatan = take-off pertama di paruh awal (reuse classifyActivity supaya
// fotonya jatuh di panel TAKE OFF yang sama dengan badge, bukan di titik
// kumpul); kepulangan = baris kedatangan tanah air (isHomeArrival — deteksi
// yang sama dengan koreksi terminal di rewriteHomeArrivalTerminal) di paruh akhir.
const FOTO_BANDARA_BERANGKAT = { file: 'keberangkatan-di-bandara.png', label: 'Keberangkatan di bandara' };
const FOTO_BANDARA_PULANG = { file: 'kepulangan-di-bandara.png', label: 'Kepulangan di bandara' };

/**
 * Foto per aktivitas untuk seluruh itinerary: Array per hari berisi
 * ({file,label} | null) sejajar dengan day.activities. Dedup global — tiap foto
 * hanya di kemunculan pertamanya. Menerima activities campuran string /
 * {time,text} seperti ItineraryDayData.
 *
 * Murni: hasilnya hanya bergantung pada `days` (termasuk giliran ROTATION_GROUPS
 * yang di-seed dari isi `days`), jadi web dan PDF selalu menampilkan foto yang
 * sama untuk jadwal yang sama.
 */
export function destinationPhotosForDays(days) {
  const list = Array.isArray(days) ? days : [];
  const half = list.length / 2;
  const seen = new Set();
  const seed = itineraryFingerprint(list);
  const take = (photo) => {
    if (!photo || seen.has(photo.file)) return null;
    seen.add(photo.file);
    return photo;
  };
  return list.map((day, dayIndex) => (Array.isArray(day?.activities) ? day.activities : []).map((raw, activityIndex) => {
    const text = String((typeof raw === 'string' ? raw : raw?.text) || '');
    if (!text) return null;
    if (dayIndex >= half && isHomeArrival(text)) {
      return take(FOTO_BANDARA_PULANG);
    }
    if (dayIndex < half && classifyActivity(text, { dayIndex, activityIndex }) === 'takeoff') {
      return take(FOTO_BANDARA_BERANGKAT);
    }
    return take(rotatedPhotoForText(text, seed, seen));
  }));
}
