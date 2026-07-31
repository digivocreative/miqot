import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, Loader2, Plane } from 'lucide-react';
import { computeNightSegments, daysUntilDeparture } from '../../../lib/itinerary-view.js';
import { canShareFiles, isTouchPrimary } from '../../utils/share';
import BrochureModal from '../BrochureModal';
import { CITY_HEX, CITY_LABEL, type CityKey } from './cityTheme';

interface Props {
  days: Array<{ location?: string | null }>;
  pdfUrl?: string | null;
  /** URL gambar brosur paket — tombol Brosur hanya tampil bila ada. */
  brosurUrl?: string | null;
  /** berangkat_tgl (YYYY-MM-DD) — brosur disembunyikan mulai H-3. */
  departISO?: string | null;
  /** Nama paket untuk judul/berkas share brosur. */
  paketNama?: string | null;
}

export default function JourneyStrip({ days, pdfUrl, brosurUrl, departISO, paketNama }: Props) {
  // Animasi 2 detik: bar terisi + pesawat menyeberangi tombol. Sesudahnya:
  // - Perangkat sentuh → share sheet native (PDF di-fetch paralel selama
  //   animasi; share dipanggil ±2 dtk setelah klik, masih di jendela user
  //   activation). Batal share = bukan error, cukup reset.
  // - Desktop → unduh langsung via location.assign (aman dari popup blocker).
  const [downloading, setDownloading] = useState(false);
  const [brosurOpen, setBrosurOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);
  const shareMode = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const startDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    if (downloading || !pdfUrl) return;
    setDownloading(true);
    const animationDone = new Promise<void>(resolve => {
      timerRef.current = window.setTimeout(resolve, 2000);
    });
    const run = async () => {
      if (shareMode) {
        const fileName = `itinerary-${(pdfUrl.split('/').pop() || 'alhijaz.pdf').replace(/\?.*$/, '')}`;
        const blobPromise = fetch(pdfUrl).then(r => (r.ok ? r.blob() : null)).catch(() => null);
        const [blob] = await Promise.all([blobPromise, animationDone]);
        setDownloading(false);
        const file = blob ? new File([blob], fileName, { type: 'application/pdf' }) : null;
        try {
          if (file && canShareFiles([file])) {
            await navigator.share({ files: [file], title: 'Itinerary Alhijaz' });
          } else {
            await navigator.share({ title: 'Itinerary Alhijaz', url: pdfUrl });
          }
        } catch (err) {
          // Batal (AbortError) = keputusan pengguna; selain itu (activation
          // kedaluwarsa dsb.) → fallback buka PDF langsung.
          if ((err as DOMException)?.name !== 'AbortError') window.location.assign(pdfUrl);
        }
      } else {
        await animationDone;
        setDownloading(false);
        window.location.assign(pdfUrl);
      }
    };
    void run();
  };

  // Brosur = materi promosi pra-berangkat: tampil hanya bila asetnya ada DAN
  // masih jauh dari berangkat — HILANG mulai H-3 (permintaan user 2026-07-31).
  // Tanggal berangkat tak terbaca → sembunyikan (fail-closed).
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const untilDepart = daysUntilDeparture(departISO || '', todayISO) as number | null;
  const showBrosur = Boolean(brosurUrl) && untilDepart !== null && untilDepart > 3;

  const allSegments = computeNightSegments(days) as Array<{ key: CityKey; nights: number }> | null;
  // Hitungan tak masuk akal → lebih baik hilang daripada salah (spec, bagian rawan #1)
  if (!allSegments) return null;
  // Malam 'home' (Indonesia — malam di perjalanan pulang) tak perlu disebut;
  // total malam dihitung dari segmen yang tampil supaya angka legend konsisten.
  const segments = allSegments.filter(s => s.key !== 'home');
  if (!segments.length) return null;
  const totalNights = segments.reduce((n, s) => n + s.nights, 0);

  return (
    <div className="mx-3 rounded-2xl border border-[#EAE2D8] bg-white p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-bold text-itin-ink">Ringkasan Perjalanan</span>
        <span className="text-[11.5px] font-semibold tabular-nums text-itin-ink3">
          {totalNights} malam · {days.length} hari
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-1">
        {segments.map((s, i) => (
          <div
            key={i}
            className="h-2 rounded-full"
            style={{ backgroundColor: CITY_HEX[s.key], flexGrow: s.nights, flexBasis: 0 }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-2">
        {segments.map((s, i) => (
          <div key={i} className="flex min-w-0 items-center gap-1.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: CITY_HEX[s.key] }} />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-itin-ink">{CITY_LABEL[s.key]}</span>
              <span className="block text-[11px] text-itin-ink3">{s.nights} malam</span>
            </span>
          </div>
        ))}
      </div>
      {(pdfUrl || showBrosur) && (
        <div className="mt-3 flex gap-2">
          {showBrosur && (
            /* Ghost burgundy — dipilih user dari 3 alternatif (2026-07-31),
               mengesampingkan D7 "burgundy = tombol penuh saja" untuk tombol ini. */
            <button
              type="button"
              onClick={() => setBrosurOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-[1.5px] border-burgundy-600 bg-white py-2.5 text-[13px] font-bold text-burgundy-700"
            >
              <BookOpen size={15} /> Brosur
            </button>
          )}
          {pdfUrl && (
            <a
              href={pdfUrl}
              onClick={startDownload}
              aria-busy={downloading}
              className={`relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-burgundy py-2.5 text-[13px] font-bold text-white ${
                downloading ? 'pointer-events-none' : ''}`}
            >
              {/* Bar kemajuan terisi 2 detik + pesawat terbang di ujungnya (selalu ter-mount agar transisi jalan) */}
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-[2000ms] ease-in-out ${
                  downloading ? 'w-full' : 'w-0'}`}
              />
              <Plane
                aria-hidden
                size={15}
                className={`absolute top-1/2 -translate-y-1/2 transition-[left,opacity] duration-[2000ms] ease-in-out ${
                  downloading ? 'left-[calc(100%-26px)] opacity-90' : 'left-2 opacity-0'}`}
              />
              {/* Wording & ikon SERAGAM mobile/desktop (permintaan user 2026-07-31) —
                  yang berbeda hanya fungsinya: sentuh = share sheet, desktop = unduh. */}
              {/* nowrap + label pendek: sejak tombol Brosur hadir, lebar tombol tinggal
                  setengah — "Menyiapkan dokumen…" membungkus 2 baris dan kartu melar. */}
              <span className="relative flex items-center gap-2 whitespace-nowrap">
                {downloading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Menyiapkan PDF…
                  </>
                ) : (
                  <>
                    <FileText size={15} /> Itinerary PDF
                  </>
                )}
              </span>
            </a>
          )}
        </div>
      )}
      {showBrosur && brosurUrl && (
        <BrochureModal
          isOpen={brosurOpen}
          onClose={() => setBrosurOpen(false)}
          imageUrl={brosurUrl}
          title={paketNama || 'Paket Alhijaz'}
          tone="burgundy"
        />
      )}
    </div>
  );
}
