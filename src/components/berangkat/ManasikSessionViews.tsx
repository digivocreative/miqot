// Tampilan "Manasik Mendatang" di kartu kalender dashboard. Dipisah dari
// BerangkatGroupViews.tsx karena berkas itu ikut dipakai halaman Statistik,
// yang tidak menampilkan manasik sama sekali.
//
// Warnanya ungu, mengikuti warna yang sudah jadi milik manasik di legenda dan
// titik kalender kartu ini (TAB_CONFIG.manasik di UpcomingSchedule.tsx).

import { Clock, Users } from 'lucide-react';
import { fmtTgl, fmtTglLong } from '../../../lib/berangkat-groups.js';
import type { BerangkatItem } from '../../../lib/berangkat-groups.js';
import type { ManasikSession } from '../../../lib/manasik-sessions.js';
import { FieldLabel, GroupMeta, JamaahRow, toWaTitleCase } from './BerangkatGroupViews';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function buildManasikWaText(item: BerangkatItem, session: ManasikSession): string {
  const honorific = item.jk === 'P' ? 'Ibu' : 'Bapak';
  const jamaahName = toWaTitleCase(item.nama);
  const packageName = toWaTitleCase(item.paket || 'Umroh');
  const jam = session.manasik_jam ? ` pukul ${session.manasik_jam} WIB` : '';
  const lines = [
    `Assalamualaikum ${honorific} *${jamaahName}*, mau mengingatkan bahwa manasik untuk ${packageName} dijadwalkan pada ${fmtTglLong(session.manasik_tgl)}${jam}.`,
    '',
    `Mohon kehadiran ${honorific} tepat waktu ya. Jazakumullah khairan.`,
  ];
  return lines.join('\n');
}

// Menggantikan bendera destinasi yang dipakai baris berangkat: satu sesi memuat
// banyak paket dengan destinasi berbeda, jadi bendera justru menyesatkan.
// Dibaca sebagai UTC karena kuncinya sudah 'YYYY-MM-DD' hasil realDateKey.
function ManasikDateChip({ tgl }: { tgl: string }) {
  const date = new Date(`${tgl}T00:00:00Z`);
  return (
    <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-violet-50 leading-none dark:bg-violet-900/20">
      <span className="text-[11px] font-extrabold text-violet-600 dark:text-violet-300">{date.getUTCDate()}</span>
      <span className="mt-0.5 text-[7px] font-bold uppercase tracking-wide text-violet-400 dark:text-violet-400/80">
        {SHORT_MONTHS[date.getUTCMonth()]}
      </span>
    </div>
  );
}

function hariLagiLabel(hariLagi: number): string {
  return hariLagi === 0 ? 'Hari ini' : `${hariLagi} hari`;
}

export function ManasikSessionSummaryRow({ session, onSelect }: {
  session: ManasikSession;
  onSelect: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(session.key)}
      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50/80 dark:hover:bg-slate-700/30 active:scale-[0.99] transition-all"
    >
      <ManasikDateChip tgl={session.manasik_tgl} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-gray-800 dark:text-white truncate">
          {fmtTglLong(session.manasik_tgl)}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] font-medium">
          {session.manasik_jam && (
            <>
              <span className="inline-flex shrink-0 items-center gap-1 text-violet-600 dark:text-violet-400">
                <Clock size={11} strokeWidth={2.2} className="shrink-0" />
                <span>{session.manasik_jam}</span>
              </span>
              <span className="text-gray-300 dark:text-slate-600">·</span>
            </>
          )}
          <span className="shrink-0 text-gray-500 dark:text-slate-400">{session.groups.length} paket</span>
          <span className="text-gray-300 dark:text-slate-600">·</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-400">
            <Users size={11} strokeWidth={2.2} className="shrink-0" />
            <span>{session.count} Jamaah</span>
          </span>
        </div>
      </div>
      {/* Badge menggantikan chevron (baris berangkat memakai chevron): dengan
          chip tanggal di kiri, memasang keduanya membuat baris sesak di HP. */}
      <span className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
        session.hari_lagi <= 3
          ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
          : 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400'
      }`}>
        {hariLagiLabel(session.hari_lagi)}
      </span>
    </button>
  );
}

export function ManasikSessionDetail({ session }: { session: ManasikSession }) {
  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 bg-white/40 dark:bg-slate-800/40">
        <div className="flex items-center gap-2">
          <ManasikDateChip tgl={session.manasik_tgl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-gray-800 dark:text-white">
              {fmtTglLong(session.manasik_tgl)}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <GroupMeta label="Jam" value={session.manasik_jam ? `${session.manasik_jam} WIB` : null} />
          <GroupMeta label="Jamaah" value={`${session.count} orang`} />
          <GroupMeta label="Paket" value={`${session.groups.length} paket`} />
          <GroupMeta label="Sisa Waktu" value={session.hari_lagi === 0 ? 'Hari ini' : `${session.hari_lagi} hari lagi`} />
        </div>
      </div>
      {session.groups.map(group => (
        <div key={group.key}>
          <div className="flex items-baseline justify-between gap-2 bg-gray-50/80 px-4 py-1.5 dark:bg-slate-700/30">
            <FieldLabel>{group.paket}</FieldLabel>
            <span className="shrink-0 text-[9px] font-semibold text-gray-400 dark:text-slate-500">
              Berangkat {fmtTgl(group.tgl_berangkat)}
            </span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-700/40">
            {group.items.map((item, i) => (
              <JamaahRow
                key={`${group.key}-${item.nama}-${i}`}
                item={item}
                showPackage={false}
                buildWaText={(jamaah) => buildManasikWaText(jamaah, session)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
