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
          <img
            src={pkg.brosur || ''}
            alt={`Brosur ${pkg.nama}`}
            loading="lazy"
            className="w-full h-full object-cover object-top"
            onError={() => setImageFailed(true)}
          />
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
            {formatRupiah(pkg.harga)}
          </p>
        )}
      </div>
    </button>
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
