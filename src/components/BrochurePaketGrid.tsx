// src/components/BrochurePaketGrid.tsx
import { useState } from 'react';
import { FileImage } from 'lucide-react';
import { BrochureModal } from './BrochureModal';
import { CaptionAIModal } from './CaptionAIModal';
import type { BrochureAgent, BrochurePackage } from './BrochureScheduleTemplate';

const MONTH_ABBR_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_FULL_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Same round-trip guard as formatTglID in BrochureScheduleTemplate: rejects
// calendar overflow like '2026-02-30' instead of silently showing 1 Mar.
function parseISODateUTC(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCDate() !== parseInt(iso.slice(8, 10), 10)) return null;
  return d;
}

function formatTglShortID(iso: string): string {
  const d = parseISODateUTC(iso);
  return d ? `${d.getUTCDate()} ${MONTH_ABBR_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
}

function formatTglLongID(iso: string): string {
  const d = parseISODateUTC(iso);
  return d ? `${d.getUTCDate()} ${MONTH_FULL_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '-';
}

function formatRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

/** Buang ".0" supaya 25.000.000 jadi "25 Juta", bukan "25.0 Juta". */
function trimDesimalNol(s: string): string {
  return s.replace(/\.0$/, '');
}

/**
 * Harga ringkas untuk kartu grid: 31.900.000 → "31.9 Juta".
 *
 * Kartu hanya seukuran setengah layar ponsel, jadi angka penuh memaksa nama
 * paket terpotong. Nilai PENUH tetap dipakai di caption (buildCaptionFallback)
 * dan di brosur resminya sendiri — ringkasan ini murni label sekilas.
 */
function formatHargaRingkas(n: number): string {
  const juta = Math.round(n) / 1_000_000;
  if (juta >= 1000) return `Rp ${trimDesimalNol((juta / 1000).toFixed(1))} Miliar`;
  if (juta >= 1) return `Rp ${trimDesimalNol(juta.toFixed(1))} Juta`;
  return formatRupiah(n);
}

/**
 * Placeholder kartu brosur selama gambar belum turun. Sengaja BUKAN kotak abu
 * polos: bentuknya meniru brosur (header, judul, tabel jadwal) supaya di
 * jaringan lambat layar tetap terbaca sebagai grid brosur, bukan halaman rusak.
 */
function BrosurImageSkeleton() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-emerald-50 to-white dark:from-slate-800 dark:to-slate-900">
      <div className="flex h-full flex-col gap-1.5 p-3">
        <div className="h-3.5 w-1/2 rounded bg-emerald-100/80 dark:bg-slate-700" />
        <div className="h-2 w-3/4 rounded bg-emerald-100/60 dark:bg-slate-700/70" />
        {/* Kotak jadwal: baris dibagi rata setinggi kotak supaya tidak
            menyisakan ruang kosong besar seperti kartu yang gagal render. */}
        <div className="mt-1 flex flex-1 flex-col justify-between rounded-lg border border-emerald-100/70 bg-white/70 p-2 dark:border-slate-700/60 dark:bg-slate-800/70">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-1.5 w-2.5 shrink-0 rounded-sm bg-emerald-200/70 dark:bg-slate-600/60" />
              <div
                className="h-1.5 rounded bg-emerald-100/80 dark:bg-slate-700/60"
                style={{ width: `${58 + ((i * 37) % 34)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      {/* Sapuan kilau — idiom yang sama dengan JamaahEditPage/UmrahRegisterPage. */}
      <div className="pointer-events-none absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-emerald-400/10" />
    </div>
  );
}

function hotelByCity(pkg: BrochurePackage, re: RegExp) {
  return pkg.hotel?.find(h => re.test(h.city || ''));
}

// Tier harga backend (`tierName`) → key kamar yang dipahami /api/ai-copy.
// Sengaja TIDAK menebak: kalau nama tier tidak cocok pola mana pun, harga
// dibuang dari payload. Caption tanpa harga lebih baik daripada harga yang
// dilabeli tipe kamar karangan.
const TIER_ROOM_PATTERNS: Array<[RegExp, 'Quard' | 'Triple' | 'Double']> = [
  [/qua/i, 'Quard'],
  [/trip/i, 'Triple'],
  [/dou/i, 'Double'],
];

export function buildHargaFromTier(pkg: BrochurePackage): Record<string, string> | null {
  const harga = pkg.harga;
  if (typeof harga !== 'number' || !Number.isFinite(harga) || harga <= 0) return null;
  const tier = pkg.tierName;
  if (!tier) return null;
  const match = TIER_ROOM_PATTERNS.find(([re]) => re.test(tier));
  if (!match) return null;
  return { [match[1]]: String(harga) };
}

function buildCaptionPayload(pkg: BrochurePackage, agent: BrochureAgent): Record<string, unknown> {
  const mekkah = hotelByCity(pkg, /mek/i);
  const madinah = hotelByCity(pkg, /mad/i);
  return {
    packageData: {
      nama: pkg.nama,
      maskapai: pkg.maskapai,
      keberangkatan: { tgl: pkg.berangkat_tgl },
      kepulangan: { tgl: pkg.pulang_tgl },
      seatSisa: pkg.seatSisa,
      hotel: {
        mekkah_hotel: mekkah?.name,
        mekkah_bintang: mekkah?.stars,
        madinah_hotel: madinah?.name,
        madinah_bintang: madinah?.stars,
      },
      harga: buildHargaFromTier(pkg),
    },
    agentName: agent.name || '',
    agentWebsite: agent.website || '',
  };
}

// Template lokal saat /api/ai-copy gagal — mengikuti pola buildAiCopyFallback di
// PackageCard. Harga ditulis "mulai Rp …" (bukan per tipe kamar) karena backend
// hanya memberi harga termurah paket, bukan harga per kamar.
function buildCaptionFallback(pkg: BrochurePackage, agent: BrochureAgent): string {
  const mekkah = hotelByCity(pkg, /mek/i);
  const madinah = hotelByCity(pkg, /mad/i);

  let text = `Assalamu'alaikum 🙏\n\nTelah dibuka pendaftaran *${pkg.nama}* bersama Alhijaz Indowisata.`;
  text += `\n\n🗓 Berangkat: ${formatTglLongID(pkg.berangkat_tgl)}`;
  text += `\n✈️ Maskapai: ${pkg.maskapai || '-'}`;
  if (mekkah?.name) text += `\n🏨 Hotel Mekkah: ${mekkah.name}`;
  if (madinah?.name) text += `\n🏨 Hotel Madinah: ${madinah.name}`;
  if (typeof pkg.harga === 'number' && pkg.harga > 0) text += `\n💰 Harga mulai ${formatRupiah(pkg.harga)}`;
  if (pkg.soldOut) text += `\n\n*Seat paket ini sudah habis* — hubungi kami untuk tanggal terdekat lainnya.`;
  else if (typeof pkg.seatSisa === 'number' && pkg.seatSisa > 0) text += `\n\n*Sisa ${pkg.seatSisa} seat!* Segera amankan kursi Anda.`;
  if (agent.name) text += `\n\nInfo & pendaftaran:\n${agent.name}`;
  if (agent.website) text += ` - ${agent.website}`;
  text += `\n\nSemoga Allah memudahkan langkah kita menuju Baitullah. Aamiin 🤲`;
  return text;
}

function PaketBrosurCard({ pkg, onOpen }: { pkg: BrochurePackage; onOpen: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const showSisa = pkg.seatSisa !== null && pkg.seatSisa !== undefined && pkg.seatSisa > 0 && pkg.seatSisa <= 5;
  const tgl = formatTglShortID(pkg.berangkat_tgl);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden active:scale-[0.97] transition-transform duration-200"
    >
      <div className="relative aspect-[3/4] bg-gray-100 dark:bg-slate-900">
        {imageFailed ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-slate-900">
            <FileImage size={22} className="text-gray-300 dark:text-slate-600" />
          </div>
        ) : (
          <>
            {!imageLoaded && <BrosurImageSkeleton />}
            <img
              // Thumb 400px kalau sudah ada; brosur penuh (bisa >8 MB) hanya
              // sebagai cadangan saat sync belum sempat membuat turunannya.
              src={pkg.brosurThumb || pkg.brosur || ''}
              alt={`Brosur ${pkg.nama}`}
              loading="lazy"
              decoding="async"
              width={400}
              height={533}
              // Gambar dari cache bisa selesai SEBELUM React memasang onLoad —
              // tanpa cek .complete di ref, kartunya tinggal skeleton selamanya.
              ref={el => { if (el?.complete && el.naturalWidth > 0) setImageLoaded(true); }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
              className={`relative h-full w-full object-cover object-top transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </>
        )}

        {pkg.isPromo && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm">
            Promo
          </span>
        )}
        {showSisa && (
          <span className="absolute top-1.5 right-1.5 rounded-md bg-red-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm">
            Sisa {pkg.seatSisa}
          </span>
        )}
        {pkg.soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="-rotate-12 text-sm font-black uppercase tracking-widest text-red-400">
              Sold Out
            </span>
          </div>
        )}
      </div>

      <div className="p-2.5">
        <p className="text-[11px] font-bold leading-snug line-clamp-2 text-gray-800 dark:text-white">
          {pkg.nama}
        </p>
        <p className="mt-1 text-[10px] text-gray-400 dark:text-slate-400 truncate">
          {[tgl, pkg.maskapai].filter(Boolean).join(' · ')}
        </p>
        {typeof pkg.harga === 'number' && pkg.harga > 0 && (
          <p className="mt-0.5 text-xs font-black text-emerald-600 dark:text-emerald-400">
            <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">mulai</span>
            {formatHargaRingkas(pkg.harga)}
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * Skeleton grid saat data jadwal MASIH diambil (belum ada paket sama sekali).
 * Berbeda dari BrosurImageSkeleton yang menutup satu kartu saat gambarnya saja
 * yang belum turun. Jumlah kartu = 6 (kira-kira satu layar ponsel penuh).
 */
export function BrochurePaketGridSkeleton() {
  return (
    <div className="px-4 pt-4">
      <div className="mb-2 h-3 w-28 rounded bg-gray-100 dark:bg-slate-800" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="relative aspect-[3/4]">
              <BrosurImageSkeleton />
            </div>
            <div className="p-2.5">
              <div className="h-2.5 w-11/12 rounded bg-gray-100 dark:bg-slate-700" />
              <div className="mt-1.5 h-2.5 w-2/3 rounded bg-gray-100 dark:bg-slate-700" />
              <div className="mt-2 h-2 w-1/2 rounded bg-gray-100/80 dark:bg-slate-700/70" />
              <div className="mt-2 h-3 w-3/5 rounded bg-emerald-100/70 dark:bg-emerald-900/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BrochurePaketGridProps {
  /** Sudah difilter oleh halaman (dimensi + nilai + toggle Ready). */
  packages: BrochurePackage[];
  filterLabel: string;
  agent: BrochureAgent;
}

/**
 * Mode "Brosur Paket": grid brosur resmi per paket (webp AWAPI via Bunny CDN).
 * Tap kartu → BrochureModal (Bagikan/Download) + Caption AI. Filter & sumber
 * data datang dari BrochureSchedulePage — komponen ini tidak memfilter ulang
 * selain membuang paket yang belum punya brosur.
 */
export default function BrochurePaketGrid({ packages, filterLabel, agent }: BrochurePaketGridProps) {
  const [selected, setSelected] = useState<BrochurePackage | null>(null);
  // `selected` sengaja tidak di-null-kan saat modal ditutup supaya animasi exit
  // BrochureModal tetap punya data untuk dirender sampai selesai.
  const [view, setView] = useState<'brosur' | 'caption' | null>(null);

  const withBrosur = packages.filter(p => p.brosur);

  return (
    <div className="px-4 pt-4">
      {withBrosur.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-900">
            <FileImage size={22} className="text-gray-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-bold text-gray-800 dark:text-white">Belum ada brosur untuk filter ini</p>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
            Coba pilih bulan lain atau matikan filter Ready.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-gray-400 dark:text-slate-500">
            {withBrosur.length} brosur{filterLabel ? ` · ${filterLabel}` : ''}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {withBrosur.map(p => (
              <PaketBrosurCard
                key={p.id}
                pkg={p}
                onOpen={() => { setSelected(p); setView('brosur'); }}
              />
            ))}
          </div>
        </>
      )}

      {selected && (
        <>
          <BrochureModal
            isOpen={view === 'brosur'}
            onClose={() => setView(null)}
            imageUrl={selected.brosur || ''}
            title={selected.nama}
            tone="emerald"
            onCaption={() => setView('caption')}
          />
          {/* Di-mount SETELAH BrochureModal supaya portal-nya menumpuk di atas. */}
          <CaptionAIModal
            isOpen={view === 'caption'}
            onClose={() => setView(null)}
            subject={selected.nama}
            buildPayload={() => buildCaptionPayload(selected, agent)}
            buildFallbackText={() => buildCaptionFallback(selected, agent)}
          />
        </>
      )}
    </div>
  );
}
