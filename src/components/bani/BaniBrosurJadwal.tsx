// Brosur Jadwal di dalam percakapan Bani.
//
// Brosur ini tidak punya berkas siap pakai: ia dirakit di klien dari data bulan
// (endpoint yang sama dengan /dashboard/brosur) memakai template desain yang
// sama persis. Di sini template itu dirender sekali di luar layar lalu
// DIRASTER jadi gambar — supaya hasilnya berperilaku seperti brosur paket:
// satu <img> yang bisa diketuk untuk layar penuh, bisa dizoom, dibagikan, dan
// diunduh lewat BrochureModal yang sama. Rasterisasinya memakai pipeline milik
// halaman Brosur (src/utils/brosurCapture.ts), jadi gambarnya sejenis dengan
// hasil tombol Simpan di sana.
//
// Berat (template + font brosur + rasterisasi), jadi pemanggil memuatnya lazy.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  BROCHURE_W,
  BROCHURE_H,
  type BrochureAgent,
  type BrochureMonth,
} from '../BrochureScheduleTemplate';
import { getBrochureDesign, normalizeBrochureDesignId } from '../brochure-designs';
import { splitPackagesIntoPages } from '@/lib/brosurJadwalPages';
import { captureCanvasFromElement, canvasToBlob } from '../../utils/brosurCapture';
import { getAuthHeaders } from '../LoginPage';

interface ApiResponse {
  months: BrochureMonth[];
  agent: BrochureAgent;
}

export interface BrosurJadwalImage {
  url: string;
  label: string;
}

// Satu percakapan bisa memuat beberapa kartu brosur jadwal (mis. dua bulan
// ditanya berurutan). Tanpa berbagi hasil, tiap kartu memanggil endpoint yang
// sama sendiri-sendiri saat percakapan lama dimuat ulang dari localStorage.
let cache: { at: number; promise: Promise<ApiResponse> } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function fetchBulan(): Promise<ApiResponse> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.promise;
  const promise = (async () => {
    const res = await fetch('/api/ai-tools/brosur-jadwal-bulan', { headers: getAuthHeaders() });
    if (!res.ok) {
      let payload: { message?: string } | null = null;
      try { payload = await res.json(); } catch { /* galat non-JSON */ }
      if (res.status === 401) throw new Error('Sesi login berakhir. Silakan login ulang.');
      if (res.status === 403) throw new Error(payload?.message || 'Anda tidak memiliki akses ke fitur ini.');
      throw new Error(payload?.message || 'Gagal memuat brosur jadwal.');
    }
    return res.json() as Promise<ApiResponse>;
  })();
  // Kegagalan tidak boleh mengendap di cache — pertanyaan berikutnya harus
  // boleh mencoba lagi.
  promise.catch(() => { if (cache?.promise === promise) cache = null; });
  cache = { at: now, promise };
  return promise;
}

function readDesignId() {
  try { return normalizeBrochureDesignId(localStorage.getItem('brosurDesignId')); }
  catch { return normalizeBrochureDesignId(null); }
}

function readDisplayMode(): 'hari' | 'seat' {
  try { return localStorage.getItem('brosurDisplayMode') === 'seat' ? 'seat' : 'hari'; }
  catch { return 'hari'; }
}

export default function BaniBrosurJadwal({ bulan, agent, onReady }: {
  /** Bulan YYYY-MM yang diminta agent; null = bulan terdekat yang masih tersedia. */
  bulan: string | null;
  agent: BrochureAgent;
  /** Gambar hasil raster diserahkan ke pemanggil, yang merendernya persis
   *  seperti brosur paket (satu gambar inline / carousel + BrochureModal). */
  onReady: (images: BrosurJadwalImage[]) => void;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panggungRef = useRef<HTMLDivElement | null>(null);
  const halamanRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let alive = true;
    fetchBulan()
      .then((json) => { if (alive) setData(json); })
      .catch((e: Error) => { if (alive) setError(e.message || 'Gagal memuat brosur jadwal.'); });
    return () => { alive = false; };
  }, []);

  const { pages, label } = useMemo(() => {
    const months = data?.months ?? [];
    if (!months.length) return { pages: [] as BrochureMonth[], label: '' };
    // Bulan yang diminta menang; yang tidak ketemu jatuh ke bulan terdekat yang
    // masih punya kursi — perilaku yang sama dengan halaman Brosur.
    const diminta = bulan ? months.find((m) => m.key === bulan) : null;
    const pertamaTersedia = months.find((m) => m.packages.some((p) => !p.soldOut));
    const bulanAktif = diminta ?? pertamaTersedia ?? months[0];
    // availableOnly = true, sama dengan bawaan halaman Brosur: brosur promosi
    // tidak menampilkan keberangkatan yang sudah penuh.
    const tersedia = bulanAktif.packages.filter((p) => !p.soldOut);
    return {
      pages: splitPackagesIntoPages(tersedia, `bani-${bulanAktif.key}`, bulanAktif.label),
      label: bulanAktif.label,
    };
  }, [data, bulan]);

  const design = useMemo(() => getBrochureDesign(readDesignId()), []);
  const displayMode = useMemo(() => readDisplayMode(), []);
  const DesignTemplate = design.Component;

  // Raster tiap halaman begitu panggungnya terpasang, lalu serahkan URL-nya.
  // Panggung sengaja tetap terpasang sampai gambar jadi: html-to-image butuh
  // node yang benar-benar ter-layout, bukan display:none.
  useEffect(() => {
    if (!pages.length) return;
    let alive = true;
    // Begitu gambarnya diserahkan, KEPEMILIKAN blob pindah ke pemanggil — dan
    // komponen ini langsung dilepas karena tugasnya selesai. Tanpa penanda ini,
    // cleanup-nya mencabut URL yang detik itu juga sedang dipasang ke <img>,
    // dan gambarnya gagal dimuat (naturalWidth 0).
    let diserahkan = false;
    const urls: string[] = [];
    (async () => {
      try {
        const hasil: BrosurJadwalImage[] = [];
        for (let i = 0; i < pages.length; i += 1) {
          const node = halamanRefs.current[i];
          if (!node) continue;
          const canvas = await captureCanvasFromElement(node);
          const blob = await canvasToBlob(canvas);
          if (!alive) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          hasil.push({
            url,
            label: pages.length > 1 ? `${label} (${i + 1}/${pages.length})` : label,
          });
        }
        if (!alive) return;
        if (!hasil.length) throw new Error('kosong');
        diserahkan = true;
        onReady(hasil);
      } catch {
        if (alive) setError('Brosur jadwalnya gagal dibuat. Coba tanya lagi sebentar lagi ya.');
      }
    })();
    return () => {
      alive = false;
      // Hanya blob yang BELUM diserahkan yang dilepas di sini (raster batal di
      // tengah jalan). Yang sudah diserahkan dilepas pemanggil saat gilirannya
      // hilang dari layar.
      if (!diserahkan) for (const url of urls) URL.revokeObjectURL(url);
    };
    // onReady sengaja tidak jadi dependensi: pemanggil membuatnya stabil, dan
    // memasukkannya ke sini membuat raster berulang tiap render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, label]);

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-900 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200">
        {error}
      </div>
    );
  }

  if (data && !pages.length) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-[11.5px] text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        Belum ada keberangkatan yang bisa dibrosurkan{label ? ` untuk ${label}` : ''}.
      </div>
    );
  }

  return (
    <>
      {/* Rangka penunggu: seukuran brosur supaya percakapan tidak melompat
          begitu gambarnya menggantikan tempat ini. */}
      <div
        className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"
        style={{ aspectRatio: `${BROCHURE_W} / ${BROCHURE_H}` }}
      >
        <Loader2 size={18} className="animate-spin text-gray-400 dark:text-slate-500" />
      </div>

      {/* Panggung raster — DI LUAR layar, bukan display:none: html-to-image
          menyalin node yang ter-layout, dan node tersembunyi menghasilkan
          gambar kosong. Ukurannya kanvas brosur penuh (1080×1620), tidak
          diskalakan, supaya hasilnya sama dengan ekspor halaman Brosur. */}
      <div
        ref={panggungRef}
        aria-hidden
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: BROCHURE_W,
          height: BROCHURE_H,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1,
          overflow: 'hidden',
        }}
      >
        {pages.map((page, i) => (
          <div
            key={page.key}
            ref={(node) => { halamanRefs.current[i] = node; }}
            style={{ width: BROCHURE_W, height: BROCHURE_H }}
          >
            <DesignTemplate month={page} agent={agent} showFullDate={false} displayMode={displayMode} />
          </div>
        ))}
      </div>
    </>
  );
}
