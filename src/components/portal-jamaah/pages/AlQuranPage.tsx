import { useMemo, useState } from 'react';
import { AlertCircle, BookOpen, ChevronRight, Minus, Plus, RefreshCw, Search, Settings2 } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import { Card, IconTile, InvertedPanel, PortalPageShell, SectionLabel, cn } from '../ui';
import { useQuranSurahList } from '../hooks/useQuranSurahList';
import { useQuranSurahDetail } from '../hooks/useQuranSurahDetail';
import {
  ARABIC_SIZES,
  SIZE_LABELS,
  TRANSLATION_SIZES,
  useQuranReaderSettings,
  type QuranSizeField,
} from '../hooks/useQuranReaderSettings';
import type { QuranSurahMeta } from '../lib/quranApi';

// Back-bar icon pill — soft burgundy tint (see redesign spec §8.9).
const ICON_CLASS = 'bg-burgundy-700/8 text-burgundy-700';
const BISMILLAH = 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ';

function ErrorState({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-lega border border-red-200 bg-red-50 p-4" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-500" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-red-700">{label}</p>
          <p className="mt-1 text-xs leading-5 text-red-600">Periksa koneksi internet lalu coba lagi.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-red-600 shadow-soft transition-colors hover:bg-red-100 active:scale-95"
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
        <Card key={index} className="flex animate-pulse items-center gap-3 p-4">
          <div className="h-9 w-9 flex-none rounded-lg bg-burgundy-700/8" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-burgundy-700/8" />
            <div className="h-2.5 w-1/4 rounded bg-burgundy-700/8" />
          </div>
        </Card>
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
    <PortalPageShell>
      <PortalBackBar title="Al-Quran" onBack={onBack} icon={BookOpen} iconClassName={ICON_CLASS} />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" strokeWidth={2} />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari surah (nama atau arti)"
            aria-label="Cari surah"
            className="h-12 w-full rounded-lega border border-black/10 bg-white pl-10 pr-4 text-sm font-medium text-ink shadow-soft outline-none transition-colors placeholder:text-ink/40 focus:border-burgundy-700 focus:ring-2 focus:ring-burgundy-700 focus:ring-offset-2 focus:ring-offset-canvas"
          />
        </div>

        {loading ? (
          <SurahListSkeleton />
        ) : error ? (
          <ErrorState label="Daftar surah belum bisa dimuat" onRetry={() => void refetch()} />
        ) : filtered.length === 0 ? (
          <Card className="px-5 py-6 text-center">
            <p className="text-sm font-bold text-ink">Surah tidak ditemukan</p>
            <p className="mt-1 text-xs leading-5 text-ink/50">Coba kata kunci lain.</p>
          </Card>
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
    </PortalPageShell>
  );
}

function SurahCard({ surah, onOpen }: { surah: QuranSurahMeta; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lega border border-black/5 bg-white p-3.5 text-left shadow-soft transition-colors hover:bg-burgundy-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <IconTile tint="neutral" size="sm">
        <span className="font-mono text-xs font-medium tabular-nums">{surah.nomor}</span>
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm text-ink">{surah.namaLatin}</span>
        <span className="mt-0.5 block truncate text-xs text-ink/50">
          {surah.arti} · {surah.jumlahAyat} ayat · {surah.tempatTurun}
        </span>
      </span>
      <span className="flex-none text-right font-arabic text-lg leading-none text-burgundy-700" dir="rtl">
        {surah.nama}
      </span>
      <ChevronRight className="h-4 w-4 flex-none text-ink/30" strokeWidth={2.2} />
    </button>
  );
}

function ReaderSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat surah">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="animate-pulse space-y-2 p-4">
          <div className="ml-auto h-5 w-2/3 rounded bg-burgundy-700/8" />
          <div className="h-3 w-1/2 rounded bg-burgundy-700/8" />
          <div className="h-3 w-3/4 rounded bg-burgundy-700/8" />
        </Card>
      ))}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        checked ? 'bg-burgundy-700' : 'bg-black/15',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function SizeStepper({
  index,
  onAdjust,
  ariaBase,
}: {
  index: number;
  onAdjust: (delta: number) => void;
  ariaBase: string;
}) {
  return (
    <div className="flex flex-none items-center gap-2">
      <button
        type="button"
        onClick={() => onAdjust(-1)}
        disabled={index <= 0}
        aria-label={`Perkecil ${ariaBase}`}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-burgundy-700/8 text-burgundy-700 transition-colors hover:bg-burgundy-700/15 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <Minus className="h-4 w-4" strokeWidth={2.4} />
      </button>
      <span className="w-20 flex-none text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink/60">
        {SIZE_LABELS[index]}
      </span>
      <button
        type="button"
        onClick={() => onAdjust(1)}
        disabled={index >= SIZE_LABELS.length - 1}
        aria-label={`Perbesar ${ariaBase}`}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-burgundy-700/8 text-burgundy-700 transition-colors hover:bg-burgundy-700/15 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <Plus className="h-4 w-4" strokeWidth={2.4} />
      </button>
    </div>
  );
}

function ReaderSettingsPanel({
  settings,
  adjustSize,
  toggleLatin,
  toggleTerjemah,
}: ReturnType<typeof useQuranReaderSettings>) {
  const makeAdjuster = (field: QuranSizeField) => (delta: number) => adjustSize(field, delta);
  return (
    <section className="space-y-3 rounded-lega border border-black/5 bg-white p-4 shadow-soft">
      <h2>
        <SectionLabel>Pengaturan Tampilan</SectionLabel>
      </h2>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-bold text-ink">Ukuran Teks Arab</p>
        <SizeStepper index={settings.arabicSizeIndex} onAdjust={makeAdjuster('arabicSizeIndex')} ariaBase="teks Arab" />
      </div>

      <div className="space-y-3 border-t border-black/5 pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-ink">Teks Latin</p>
          <ToggleSwitch checked={settings.showLatin} onChange={toggleLatin} label="Tampilkan teks latin" />
        </div>
        {settings.showLatin && (
          <div className="flex items-center justify-between gap-3 pl-3">
            <p className="min-w-0 text-xs text-ink/50">Ukuran teks latin</p>
            <SizeStepper index={settings.latinSizeIndex} onAdjust={makeAdjuster('latinSizeIndex')} ariaBase="teks latin" />
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-black/5 pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-ink">Terjemahan</p>
          <ToggleSwitch checked={settings.showTerjemah} onChange={toggleTerjemah} label="Tampilkan terjemahan" />
        </div>
        {settings.showTerjemah && (
          <div className="flex items-center justify-between gap-3 pl-3">
            <p className="min-w-0 text-xs text-ink/50">Ukuran terjemahan</p>
            <SizeStepper index={settings.terjemahSizeIndex} onAdjust={makeAdjuster('terjemahSizeIndex')} ariaBase="terjemahan" />
          </div>
        )}
      </div>
    </section>
  );
}

function SurahReader({ nomor, onBack }: { nomor: number; onBack: () => void }) {
  const { data, loading, error, refetch } = useQuranSurahDetail(nomor);
  const readerSettings = useQuranReaderSettings();
  const { settings } = readerSettings;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const arabicSize = ARABIC_SIZES[settings.arabicSizeIndex];
  const latinSize = TRANSLATION_SIZES[settings.latinSizeIndex];
  const terjemahSize = TRANSLATION_SIZES[settings.terjemahSizeIndex];
  // Bismillah tidak ditampilkan sebagai pembuka pada Al-Fatihah (sudah jadi ayat 1) dan At-Taubah.
  const showBismillah = !!data && data.nomor !== 1 && data.nomor !== 9;

  const settingsButton = (
    <button
      type="button"
      onClick={() => setSettingsOpen((v) => !v)}
      aria-label="Pengaturan tampilan"
      aria-expanded={settingsOpen}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-xl transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        settingsOpen
          ? 'bg-gradient-burgundy text-white shadow-accent'
          : 'bg-burgundy-700/8 text-burgundy-700 hover:bg-burgundy-700/15',
      )}
    >
      <Settings2 className="h-4 w-4" strokeWidth={2.2} />
    </button>
  );

  return (
    <PortalPageShell>
      <PortalBackBar
        title={data?.namaLatin || 'Al-Quran'}
        onBack={onBack}
        icon={BookOpen}
        iconClassName={ICON_CLASS}
        rightSlot={settingsButton}
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        {settingsOpen && <ReaderSettingsPanel {...readerSettings} />}
        {loading ? (
          <ReaderSkeleton />
        ) : error ? (
          <ErrorState label="Surah belum bisa dimuat" onRetry={() => void refetch()} />
        ) : !data ? null : (
          <>
            <InvertedPanel className="p-4 text-center" texture>
              <p className="font-arabic text-2xl leading-snug" dir="rtl">{data.nama}</p>
              <p className="mt-1 font-display text-base">{data.namaLatin}</p>
              <p className="mt-0.5 text-xs text-white/60">
                {data.arti} · {data.jumlahAyat} ayat · {data.tempatTurun}
              </p>
            </InvertedPanel>

            {showBismillah && (
              <p className={cn('pt-1 text-center font-arabic text-burgundy-800', arabicSize)} dir="rtl">
                {BISMILLAH}
              </p>
            )}

            <ul className="space-y-3">
              {data.ayat.map((ayat) => (
                <li
                  key={ayat.nomorAyat}
                  className="rounded-lega border border-black/5 bg-white p-4 shadow-soft"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-gradient-burgundy px-2 font-mono text-xs font-medium tabular-nums text-white shadow-accent ring-1 ring-inset ring-gold/30">
                      {ayat.nomorAyat}
                    </span>
                  </div>
                  <p className={cn('mt-3 font-arabic text-ink', arabicSize)} dir="rtl" lang="ar">
                    {ayat.teksArab}
                  </p>
                  {settings.showLatin && (
                    <p className={cn('mt-3 italic text-burgundy-700', latinSize)}>{ayat.teksLatin}</p>
                  )}
                  {settings.showTerjemah && (
                    <p className={cn('mt-1.5 text-ink/70', terjemahSize)}>{ayat.teksIndonesia}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </PortalPageShell>
  );
}

export default function AlQuranPage({ onBack }: { data?: unknown; onBack: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);

  if (selected != null) {
    return <SurahReader nomor={selected} onBack={() => setSelected(null)} />;
  }
  return <SurahList onOpen={setSelected} onBack={onBack} />;
}
