import { useEffect, useRef, useState } from 'react';
import { FileDown, Loader2, Plane } from 'lucide-react';
import { computeNightSegments } from '../../../lib/itinerary-view.js';
import { CITY_HEX, CITY_LABEL, type CityKey } from './cityTheme';

interface Props {
  days: Array<{ location?: string | null }>;
  pdfUrl?: string | null;
}

export default function JourneyStrip({ days, pdfUrl }: Props) {
  // Animasi unduh 2 detik: bar terisi + pesawat terbang menyeberangi tombol, lalu buka PDF.
  // Navigasi via location.assign (bukan window.open) — aman dari popup blocker setelah delay.
  const [downloading, setDownloading] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);
  const startDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    if (downloading || !pdfUrl) return;
    setDownloading(true);
    timerRef.current = window.setTimeout(() => {
      setDownloading(false);
      window.location.assign(pdfUrl);
    }, 2000);
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
