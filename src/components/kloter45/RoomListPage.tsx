import { useMemo, useState } from 'react';
import { BedDouble, FileText, Search } from 'lucide-react';
import WhatsAppIcon from '@/components/common/WhatsAppIcon';
import Kloter45SubPageShell from '@/components/kloter45/SubPageShell';
import {
  KLOTER45_CONTACTS,
  KLOTER45_JAMAAH,
  KLOTER45_ROOM_LISTS,
  KLOTER45_TRIP,
  findKloter45RoomsByName,
  type Kloter45Room,
} from '@/lib/kloter45Landing.js';

const ROOM_TYPE_LABEL: Record<Kloter45Room['type'], string> = {
  Double: 'Double · 2 orang',
  Twin: 'Twin · 2 orang',
  Triple: 'Triple · 3 orang',
  Quad: 'Quad · 4 orang',
};

// Warna avatar mengikuti Daftar Jamaah: merah muda = wanita, biru = pria.
// Nama di luar manifest (Muthowif) memakai warna netral.
const GENDER_BY_NAME = new Map(KLOTER45_JAMAAH.map((member) => [member.name, member.gender]));
const AVATAR_CLASS = {
  P: 'bg-pink-50 ring-pink-300 text-pink-700',
  L: 'bg-blue-50 ring-blue-300 text-blue-700',
  neutral: 'bg-gray-100 ring-gray-200 text-gray-600 dark:bg-slate-800 dark:ring-slate-700 dark:text-slate-300',
} as const;

function getAvatarClass(name: string) {
  const gender = GENDER_BY_NAME.get(name);
  return gender === 'P' || gender === 'L' ? AVATAR_CLASS[gender] : AVATAR_CLASS.neutral;
}

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('');
}

// Room list ditampilkan langsung (bukan cuma tautan PDF) supaya jamaah bisa
// mencari namanya sendiri dari HP. PDF resmi tetap bisa dibuka di bawah.
export default function Kloter45RoomListPage({ onBack }: { onBack: () => void }) {
  const [activeId, setActiveId] = useState(KLOTER45_ROOM_LISTS[0]?.id ?? 'dubai');
  const [query, setQuery] = useState('');
  const roomList = KLOTER45_ROOM_LISTS.find((list) => list.id === activeId) ?? KLOTER45_ROOM_LISTS[0];
  const rooms = useMemo(() => findKloter45RoomsByName(roomList, query), [roomList, query]);
  const tourLeader = KLOTER45_CONTACTS[0];
  const waText = encodeURIComponent(
    `Assalamualaikum, saya mau tanya room list ${KLOTER45_TRIP.kloterLabel} ${KLOTER45_TRIP.departureDate}.`
  );

  return (
    <Kloter45SubPageShell title="Room List" icon={BedDouble} onBack={onBack}>
      <div data-room-list-page={roomList.id} className="space-y-3">
        <div
          role="tablist"
          aria-label="Pilih room list"
          data-room-list-tabs
          className="grid grid-cols-2 gap-1 rounded-2xl border border-gray-100 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          {KLOTER45_ROOM_LISTS.map((list) => {
            const active = list.id === roomList.id;
            return (
              <button
                key={list.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-room-list-tab={list.id}
                onClick={() => setActiveId(list.id)}
                className={`min-h-10 rounded-xl px-2 py-2 text-xs font-bold transition-all active:scale-[0.98] ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                }`}
              >
                {list.label}
              </button>
            );
          })}
        </div>

        <section className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {roomList.hotels.map((hotel) => (
            <div key={hotel.city} data-room-list-hotel={hotel.city} className="flex items-start gap-3 px-4 py-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-900/25 dark:text-sky-300">
                <BedDouble size={16} strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                  {hotel.city} · {hotel.nights} malam
                </p>
                <p className="truncate text-sm font-bold text-gray-900 dark:text-slate-100">{hotel.name}</p>
                <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                  {hotel.checkIn} – {hotel.checkOut}
                </p>
              </div>
            </div>
          ))}
          <p className="px-4 py-2 text-[10px] font-medium text-gray-400 dark:text-slate-500">
            Diperbarui {roomList.updatedAt} · {roomList.rooms.length} kamar
          </p>
        </section>

        <label className="flex h-10 items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 shadow-sm transition-all focus-within:ring-2 focus-within:ring-emerald-500/50 dark:border-slate-700 dark:bg-slate-800">
          <Search size={14} strokeWidth={2.4} className="flex-none text-gray-400 dark:text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama atau nomor kamar"
            aria-label="Cari kamar"
            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-gray-800 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-slate-500"
          />
        </label>

        {rooms.length === 0 ? (
          <div data-room-list-empty className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Tidak ditemukan</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">Coba nama lain, atau tanya Tour Leader di bawah.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <article
                key={room.no}
                data-room={room.no}
                className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 dark:border-slate-800">
                  <span className="text-xs font-bold text-gray-900 dark:text-slate-100">Kamar {room.no}</span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-800/40 dark:bg-sky-900/20 dark:text-sky-300">
                    {ROOM_TYPE_LABEL[room.type]}
                  </span>
                </div>
                <ul className="divide-y divide-gray-50 dark:divide-slate-800/60">
                  {room.guests.map((guest) => (
                    <li key={guest.name} className="flex items-center gap-2.5 px-3 py-2">
                      <span
                        data-guest-gender={GENDER_BY_NAME.get(guest.name) ?? 'neutral'}
                        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ring-2 text-[10px] font-extrabold ${getAvatarClass(guest.name)}`}
                      >
                        {getInitials(guest.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-800 dark:text-slate-100">{guest.name}</span>
                      {guest.note && (
                        <span className="flex-none rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                          {guest.note}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}

        <a
          href={roomList.pdfUrl}
          target="_blank"
          rel="noreferrer"
          data-room-list-open
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition active:scale-95 hover:bg-emerald-600"
        >
          <FileText size={16} strokeWidth={2.4} />
          Buka PDF {roomList.title}
        </a>
        <a
          href={`${tourLeader.whatsappUrl}?text=${waText}`}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700 transition active:scale-95 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300"
        >
          <WhatsAppIcon size={16} />
          Tanya Tour Leader
        </a>
      </div>
    </Kloter45SubPageShell>
  );
}
