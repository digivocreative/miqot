import { useMemo, useState } from 'react';
import { AlertCircle, BookOpen, ChevronRight, RefreshCw, Search } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import { useQuranSurahList } from '../hooks/useQuranSurahList';
import { useQuranSurahDetail } from '../hooks/useQuranSurahDetail';
import type { QuranSurahMeta } from '../lib/quranApi';

const ICON_CLASS = 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400';
const BISMILLAH = 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ';

function ErrorState({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-500 dark:text-red-400" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">{label}</p>
          <p className="mt-1 text-xs leading-5 text-red-600 dark:text-red-400">Periksa koneksi internet lalu coba lagi.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-red-600 shadow-sm transition-colors hover:bg-red-100 active:scale-95 dark:bg-slate-800 dark:text-red-300 dark:hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
            Coba lagi
          </button>
        </div>
      </div>
    </div>
  );
}

function SurahListSkeleton() {
  return (
    <div className="space-y-2.5" role="status" aria-label="Memuat daftar surah">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="h-9 w-9 flex-none rounded-lg bg-gray-100 dark:bg-slate-700" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-slate-700" />
            <div className="h-2.5 w-1/4 rounded bg-gray-100 dark:bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SurahList({ onOpen, onBack }: { onOpen: (nomor: number) => void; onBack: () => void }) {
  const { data, loading, error, refetch } = useQuranSurahList();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.namaLatin.toLowerCase().includes(q) ||
        s.arti.toLowerCase().includes(q) ||
        String(s.nomor) === q
    );
  }, [data, query]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Al-Quran" onBack={onBack} icon={BookOpen} iconClassName={ICON_CLASS} />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" strokeWidth={2} />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari surah (nama atau arti)"
            aria-label="Cari surah"
            className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm font-medium text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-teal-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
          />
        </div>

        {loading ? (
          <SurahListSkeleton />
        ) : error ? (
          <ErrorState label="Daftar surah belum bisa dimuat" onRetry={() => void refetch()} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white px-5 py-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-bold text-gray-800 dark:text-slate-100">Surah tidak ditemukan</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">Coba kata kunci lain.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((surah) => (
              <li key={surah.nomor}>
                <SurahCard surah={surah} onOpen={() => onOpen(surah.nomor)} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function SurahCard({ surah, onOpen }: { surah: QuranSurahMeta; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/60"
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-teal-50 text-xs font-bold text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
        {surah.nomor}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-gray-900 dark:text-white">{surah.namaLatin}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-slate-400">
          {surah.arti} · {surah.jumlahAyat} ayat · {surah.tempatTurun}
        </span>
      </span>
      <span className="flex-none text-right font-arabic text-lg leading-none text-teal-700 dark:text-teal-300" dir="rtl">
        {surah.nama}
      </span>
      <ChevronRight className="h-4 w-4 flex-none text-gray-300 dark:text-slate-600" strokeWidth={2.2} />
    </button>
  );
}

function ReaderSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat surah">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="animate-pulse space-y-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="ml-auto h-5 w-2/3 rounded bg-gray-100 dark:bg-slate-700" />
          <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-slate-700" />
          <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );
}

function SurahReader({ nomor, onBack }: { nomor: number; onBack: () => void }) {
  const { data, loading, error, refetch } = useQuranSurahDetail(nomor);
  // Bismillah tidak ditampilkan sebagai pembuka pada Al-Fatihah (sudah jadi ayat 1) dan At-Taubah.
  const showBismillah = !!data && data.nomor !== 1 && data.nomor !== 9;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title={data?.namaLatin || 'Al-Quran'} onBack={onBack} icon={BookOpen} iconClassName={ICON_CLASS} />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        {loading ? (
          <ReaderSkeleton />
        ) : error ? (
          <ErrorState label="Surah belum bisa dimuat" onRetry={() => void refetch()} />
        ) : !data ? null : (
          <>
            <section
              className="overflow-hidden rounded-2xl p-4 text-center text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, #0f766e 0%, #059669 50%, #047857 100%)' }}
            >
              <p className="font-arabic text-2xl leading-snug" dir="rtl">{data.nama}</p>
              <p className="mt-1 text-sm font-bold">{data.namaLatin}</p>
              <p className="mt-0.5 text-xs text-emerald-50">
                {data.arti} · {data.jumlahAyat} ayat · {data.tempatTurun}
              </p>
            </section>

            {showBismillah && (
              <p className="pt-1 text-center font-arabic text-2xl leading-loose text-gray-800 dark:text-slate-100" dir="rtl">
                {BISMILLAH}
              </p>
            )}

            <ul className="space-y-3">
              {data.ayat.map((ayat) => (
                <li
                  key={ayat.nomorAyat}
                  className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-teal-50 px-2 text-xs font-bold text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                      {ayat.nomorAyat}
                    </span>
                  </div>
                  <p className="mt-3 font-arabic text-2xl leading-loose text-gray-900 dark:text-white" dir="rtl" lang="ar">
                    {ayat.teksArab}
                  </p>
                  <p className="mt-3 text-sm italic leading-6 text-teal-700 dark:text-teal-300">{ayat.teksLatin}</p>
                  <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-slate-300">{ayat.teksIndonesia}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

export default function AlQuranPage({ onBack }: { data?: unknown; onBack: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);

  if (selected != null) {
    return <SurahReader nomor={selected} onBack={() => setSelected(null)} />;
  }
  return <SurahList onOpen={setSelected} onBack={onBack} />;
}
