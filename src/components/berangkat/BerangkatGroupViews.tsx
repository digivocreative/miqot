// Komponen baris "Berangkat Mendatang" yang dipakai bersama oleh halaman
// Statistik dan kartu kalender dashboard. Satu salinan saja: kalau tampilan
// barisnya berubah, berubah di kedua layar sekaligus.

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronRight, Copy, Link2, Users } from 'lucide-react';
import { normalizeWaNumber } from '../../utils/phone';
import { trackEvent } from '../../utils/analytics';
import { shareLinkCopyText } from '../../utils/share';
import { getDestinationFlags, fmtTgl, fmtTglLong, realDateKey } from '../../../lib/berangkat-groups.js';
import type { BerangkatItem, BerangkatGroup, DestinationFlag } from '../../../lib/berangkat-groups.js';

export function toWaTitleCase(value: string | null | undefined): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '-';
  return normalized
    .toLocaleLowerCase('id-ID')
    .replace(/(^|[\s([/+.-])([a-z])/g, (_match, prefix, char) => `${prefix}${char.toLocaleUpperCase('id-ID')}`)
    .replace(/\b(\d+)\s*hr\b/gi, '$1HR');
}

function getInitials(name: string): string {
  return (name || '?').split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
}

// ── WhatsApp SVG icon ──
function WaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Row renderers ──
function buildBerangkatWaText(item: BerangkatItem): string {
  const honorific = item.jk === 'P' ? 'Ibu' : 'Bapak';
  const jamaahName = toWaTitleCase(item.nama);
  const packageName = toWaTitleCase(item.paket || 'Umroh');
  const departureDate = fmtTglLong(item.tgl_berangkat);
  const lines = [
    `Assalamualaikum ${honorific} *${jamaahName}*, mau mengingatkan bahwa keberangkatan Umroh ${packageName} dijadwalkan pada ${departureDate}.`,
    '',
    `Dimohon ${honorific} untuk mempersiapkan diri sebelum hari keberangkatan.`,
  ];
  return lines.join('\n');
}

// Dipakai daftar Berangkat Mendatang DAN daftar peserta sesi manasik, karena
// itu namanya bukan lagi BerangkatRow. `buildWaText` dioper supaya pengingat
// manasik tidak memakai kalimat keberangkatan.
export function JamaahRow({ item, showPackage = true, buildWaText = buildBerangkatWaText }: {
  item: BerangkatItem;
  showPackage?: boolean;
  buildWaText?: (item: BerangkatItem) => string;
}) {
  const initials = getInitials(item.nama);
  const isFemale = item.jk === 'P';
  const waNumber = normalizeWaNumber(item.wa);
  const waUrl = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(buildWaText(item))}`
    : null;
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="relative shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold ${
          isFemale ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 ring-2 ring-pink-300'
                   : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-300'
        }`}>{initials}</div>
        {item.lunas && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 flex items-center justify-center">
            <Check size={9} className="text-white" strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{item.nama}</p>
        {showPackage && (
          <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">{item.paket || '-'}</p>
        )}
      </div>
      {showPackage ? (
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
            item.hari_lagi <= 15 ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                 : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
          }`}>✈ {item.hari_lagi} hari</span>
          <span className="text-[10px] text-gray-400 dark:text-slate-500">{fmtTgl(item.tgl_berangkat)}</span>
        </div>
      ) : (
        waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Chat WhatsApp ${item.nama}`}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 text-[10px] font-bold text-emerald-600 transition-colors hover:bg-emerald-500/15 active:scale-95 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
          >
            <WaIcon size={13} />
            <span>Chat</span>
          </a>
        ) : (
          <span className="shrink-0 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 dark:border-slate-700 dark:bg-slate-700/40 dark:text-slate-500">
            WA kosong
          </span>
        )
      )}
    </div>
  );
}

// Satu definisi gaya label untuk seluruh header detail — dipakai grid meta dan
// baris link itinerary, supaya keduanya tak pernah berbeda sendiri.
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="truncate text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">{children}</p>
  );
}

export function GroupMeta({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-700 dark:text-slate-100">{value || '-'}</p>
    </div>
  );
}

export function DestinationFlags({ paket }: { paket: string }) {
  const flags = getDestinationFlags(paket);
  const visibleFlags = flags.slice(0, 3);
  const overflowCount = flags.length - visibleFlags.length;
  const title = flags.map(flag => flag.label).join(' + ');
  const flagSizeClass = visibleFlags.length > 1 ? 'h-4 w-6' : 'h-5 w-7';

  return (
    <div
      className="w-9 h-9 flex items-center justify-center shrink-0"
      title={title}
      aria-label={title}
    >
      <div className="flex items-center justify-center gap-0.5">
        {visibleFlags.map(flag => (
          <span
            key={flag.code}
            className={`relative flex ${flagSizeClass} items-center justify-center overflow-hidden bg-gray-100 text-[7px] font-bold text-gray-500 shadow-sm dark:bg-slate-700 dark:text-slate-300`}
          >
            <span>{flag.fallback}</span>
            <img
              src={flag.src}
              alt={flag.label}
              className="absolute inset-0 h-full w-full object-cover shadow-sm"
              onError={(event) => { event.currentTarget.style.display = 'none'; }}
            />
          </span>
        ))}
        {overflowCount > 0 && (
          <span className="ml-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-300">+{overflowCount}</span>
        )}
      </div>
    </div>
  );
}

export function BerangkatGroupSummaryRow({ group, onSelect }: { group: BerangkatGroup; onSelect: (key: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(group.key)}
      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50/80 dark:hover:bg-slate-700/30 active:scale-[0.99] transition-all"
    >
      <DestinationFlags paket={group.paket} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-gray-800 dark:text-white truncate">
          {group.paket}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] font-medium">
          <span className="inline-flex min-w-0 items-center gap-1 text-blue-600 dark:text-blue-400">
            <CalendarDays size={11} strokeWidth={2.2} className="shrink-0" />
            <span className="truncate">{fmtTglLong(group.tgl_berangkat)}</span>
          </span>
          <span className="text-gray-300 dark:text-slate-600">·</span>
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Users size={11} strokeWidth={2.2} className="shrink-0" />
            <span>{group.count} Jamaah</span>
          </span>
        </div>
      </div>
      <ChevronRight size={15} className="shrink-0 text-gray-300 dark:text-slate-600" />
    </button>
  );
}

// `window` dijaga karena komponen ini ikut terseret ke lingkungan tanpa DOM
// (harness render di node) lewat impor lain.
function siteOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

// Link halaman share publik /:slug/:jadwalId/itinerary — sama persis dengan
// yang disalin tombol di ItineraryModal, supaya agen tak perlu membuka kartu
// paket hanya untuk mengambil linknya. URL-nya ditampilkan apa adanya supaya
// agen tahu persis apa yang akan dikirim ke jamaah sebelum menyalin.
function ItineraryLinkRow({ group, agentSlug }: { group: BerangkatGroup; agentSlug: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sheet bisa ditutup sebelum label "Tersalin" habis waktunya
  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  if (!group.jadwal_id || !group.itinerary_ready) {
    // Label sudah menyebut "itinerary", jadi isinya cukup "Belum tersedia" —
    // menulis "Itinerary belum ada" di bawahnya jadi mengulang kata.
    return (
      <div className="mt-3">
        <FieldLabel>Link Itinerary</FieldLabel>
        <div className="mt-1 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-center text-[10px] font-semibold text-gray-400 dark:border-slate-700 dark:bg-slate-700/40 dark:text-slate-500">
          Belum tersedia
        </div>
      </div>
    );
  }

  const shareUrl = `${siteOrigin()}/${agentSlug}/${group.jadwal_id}/itinerary`;
  // Skema dibuang dari tampilan saja (yang disalin tetap URL utuh) — di lebar
  // sheet HP, "https://" memakan ruang yang lebih berguna buat nama jadwalnya.
  const displayUrl = shareUrl.replace(/^https?:\/\//, '');

  const copyLink = async () => {
    trackEvent('action', 'copy_itinerary_link', { paket: group.paket });
    const copyText = shareLinkCopyText(shareUrl);
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      // Clipboard ditolak / bukan secure context — agen tetap bisa menyalin manual
      window.prompt('Salin link:', copyText);
      return;
    }
    setCopied(true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3">
      <FieldLabel>Link Itinerary</FieldLabel>
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 py-1.5 pl-2.5 pr-1.5 dark:border-slate-700 dark:bg-slate-700/30">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Link2 size={13} strokeWidth={2.2} className="shrink-0 text-gray-400 dark:text-slate-500" />
          {/* Sepadan dengan nilai GroupMeta di atasnya (11px, gray-700/slate-100)
              supaya URL terbaca sebagai data, bukan keterangan kaki */}
          <span
            title={shareUrl}
            dir="ltr"
            className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-700 dark:text-slate-100"
          >
            {displayUrl}
          </span>
        </div>
        <button
          type="button"
          onClick={copyLink}
          aria-label={`Salin link itinerary ${group.paket}`}
          className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors active:scale-95 ${
            copied
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
              : 'border-blue-500/20 bg-blue-500/10 text-blue-600 hover:bg-blue-500/15 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300'
          }`}
        >
          {copied ? <Check size={11} strokeWidth={3} /> : <Copy size={11} strokeWidth={2.4} />}
          <span>{copied ? 'Tersalin' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}

export function BerangkatGroupDetail({ group, agentSlug }: { group: BerangkatGroup; agentSlug?: string | null }) {
  // realDateKey, bukan sekadar cek kosong: manasik_tgl bisa berisi sentinel
  // '0000-00-00' dari umroh_schedules, dan fmtTglLong() akan memajangnya
  // sebagai literal "Invalid Date" ke agen.
  const manasikLabel = realDateKey(group.manasik_tgl)
    ? fmtTglLong(group.manasik_tgl)
    : null;

  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 bg-white/40 dark:bg-slate-800/40">
        <div className="flex items-center gap-2">
          <DestinationFlags paket={group.paket} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-gray-800 dark:text-white">{group.paket}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <GroupMeta label="Berangkat" value={fmtTglLong(group.tgl_berangkat)} />
          <GroupMeta label="Penerbangan" value={group.berangkat_kode_penerbangan} />
          <GroupMeta label="Tour Leader" value={group.tour_leader} />
          <GroupMeta label="Manasik" value={manasikLabel} />
        </div>
        {agentSlug && <ItineraryLinkRow group={group} agentSlug={agentSlug} />}
      </div>
      <div className="divide-y divide-gray-50 dark:divide-slate-700/40">
        {group.items.map((item, i) => <JamaahRow key={`${group.key}-${item.nama}-${i}`} item={item} showPackage={false} />)}
      </div>
    </div>
  );
}
