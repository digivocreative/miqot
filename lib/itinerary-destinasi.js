// Pencocokan aktivitas itinerary → foto destinasi (Bunny CDN /foto-destinasi).
// Logika murni tanpa dependensi — dipakai FE (src/components/itinerary/) dan bisa
// dipakai server. Nama file di CDN sudah disesuaikan user dengan nama destinasi.
//
// Aturan tampilan (permintaan 2026-07-31): satu kegiatan maksimal SATU foto
// (kegiatan yang menyebut beberapa tempat wisata ambil salah satu saja), dan
// satu foto hanya tampil SEKALI per itinerary — "sholat di Masjidil Haram"
// berulang tiap hari, fotonya cukup di kemunculan pertama.
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
// cocok menang). Yang penting hanya: 'arafah' HARUS di atas 'rahmah' supaya
// "Padang Arafah dan Jabal Rahmah" memakai foto gabungan, bukan foto Jabal
// Rahmah saja. Ejaan PDF beragam — regex menampung varian yang benar-benar
// muncul di tabel itineraries ("Burj Ar Arab", "Cornice", "Khalifah", dst.).
const DESTINASI_PATTERNS = [
  // Saudi — situs suci & ziarah
  { file: 'masjidil-haram.png', label: 'Masjidil Haram', re: /masjidil\s*haram|masjid\s*(?:al[-\s]?)?haram\b|ka['’]?bah|\btawaf|\bthawaf/i },
  { file: 'masjid-nabawi.png', label: 'Masjid Nabawi', re: /nabawi|raud[hl]?ah/i },
  { file: 'masjid-quba.png', label: 'Masjid Quba', re: /\bquba\b/i },
  { file: 'masjid-qiblatain.png', label: 'Masjid Qiblatain', re: /[qk]iblatain/i },
  { file: 'jabal-uhud.png', label: 'Jabal Uhud', re: /\buhud\b/i },
  { file: 'makam-baqi.png', label: 'Makam Baqi', re: /\bbaqi['’]?/i },
  { file: 'padang-arafah-jabal-rahmah.png', label: 'Padang Arafah', re: /arafah/i },
  { file: 'jabal-rahmah.png', label: 'Jabal Rahmah', re: /\brahmah\b/i },
  { file: 'mina-tenda-putih.png', label: 'Mina', re: /\bmina\b/i },
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
 */
export function destinationPhotosForDays(days) {
  const list = Array.isArray(days) ? days : [];
  const half = list.length / 2;
  const seen = new Set();
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
    return take(destinationPhotoForText(text));
  }));
}
