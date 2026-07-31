import { useEffect, useRef, useState } from 'react';
import { FileDown, Loader2, Plane, Share2 } from 'lucide-react';
import { computeNightSegments } from '../../../lib/itinerary-view.js';
import { canShareFiles, isTouchPrimary } from '../../utils/share';
import { CITY_HEX, CITY_LABEL, type CityKey } from './cityTheme';

interface Props {
  days: Array<{ location?: string | null }>;
  pdfUrl?: string | null;
}

export default function JourneyStrip({ days, pdfUrl }: Props) {
  // Animasi 2 detik: bar terisi + pesawat menyeberangi tombol. Sesudahnya:
  // - Perangkat sentuh → share sheet native (PDF di-fetch paralel selama
  //   animasi; share dipanggil ±2 dtk setelah klik, masih di jendela user
  //   activation). Batal share = bukan error, cukup reset.
  // - Desktop → unduh langsung via location.assign (aman dari popup blocker).
  const [downloading, setDownloading] = useState(false);
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
      {pdfUrl && (
        <a
          href={pdfUrl}
          onClick={startDownload}
          aria-busy={downloading}
          className={`relative mt-3 flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-burgundy py-2.5 text-[13px] font-bold text-white ${
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
          <span className="relative flex items-center gap-2">
            {downloading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Menyiapkan dokumen…
              </>
            ) : shareMode ? (
              <>
                <Share2 size={15} /> Bagikan Itinerary PDF
              </>
            ) : (
              <>
                <FileDown size={15} /> Unduh Itinerary PDF
              </>
            )}
          </span>
        </a>
      )}
    </div>
  );
}
