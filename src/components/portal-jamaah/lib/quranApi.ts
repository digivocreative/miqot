// Pembaca Al-Quran Portal Jamaah — fetch + cache dari API publik equran.id v2.
// CORS `*` sudah dipastikan, jadi dipanggil langsung dari browser tanpa proxy backend.

const API_BASE = 'https://equran.id/api/v2/surat';
const LIST_CACHE_KEY = 'portal_quran_surah_list_v1';

export interface QuranSurahMeta {
  nomor: number;
  namaLatin: string;
  nama: string; // Arab
  arti: string;
  jumlahAyat: number;
  tempatTurun: string; // "Mekah" | "Madinah"
}

export interface QuranAyat {
  nomorAyat: number;
  teksArab: string;
  teksLatin: string;
  teksIndonesia: string;
}

export interface QuranSurahDetail extends QuranSurahMeta {
  ayat: QuranAyat[];
}

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

function pickMeta(raw: QuranSurahMeta): QuranSurahMeta {
  return {
    nomor: raw.nomor,
    namaLatin: raw.namaLatin,
    nama: raw.nama,
    arti: raw.arti,
    jumlahAyat: raw.jumlahAyat,
    tempatTurun: raw.tempatTurun,
  };
}

let listMemoryCache: QuranSurahMeta[] | null = null;
const detailMemoryCache = new Map<number, QuranSurahDetail>();

export async function fetchSurahList(): Promise<QuranSurahMeta[]> {
  if (listMemoryCache) return listMemoryCache;

  try {
    const cached = localStorage.getItem(LIST_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as QuranSurahMeta[];
      if (Array.isArray(parsed) && parsed.length === 114) {
        listMemoryCache = parsed;
        return parsed;
      }
    }
  } catch {
    // localStorage tak tersedia / korup — abaikan, ambil dari jaringan.
  }

  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error(`Gagal memuat daftar surah (${res.status})`);
  const json = (await res.json()) as ApiEnvelope<QuranSurahMeta[]>;
  const list = (json.data ?? []).map(pickMeta);
  if (!list.length) throw new Error('Daftar surah kosong');

  listMemoryCache = list;
  try {
    localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(list));
  } catch {
    // penyimpanan penuh / mode privat — cukup andalkan memory cache.
  }
  return list;
}

export async function fetchSurahDetail(nomor: number): Promise<QuranSurahDetail> {
  const cached = detailMemoryCache.get(nomor);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/${nomor}`);
  if (!res.ok) throw new Error(`Gagal memuat surah (${res.status})`);
  const json = (await res.json()) as ApiEnvelope<QuranSurahDetail>;
  const raw = json.data;
  if (!raw || !Array.isArray(raw.ayat)) throw new Error('Data surah tidak lengkap');

  const detail: QuranSurahDetail = {
    ...pickMeta(raw),
    ayat: raw.ayat.map((a) => ({
      nomorAyat: a.nomorAyat,
      teksArab: a.teksArab,
      teksLatin: a.teksLatin,
      teksIndonesia: a.teksIndonesia,
    })),
  };

  detailMemoryCache.set(nomor, detail);
  return detail;
}
