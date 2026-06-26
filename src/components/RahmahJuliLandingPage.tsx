import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronUp, Moon, Pencil, Search, SlidersHorizontal, Sun, UsersRound } from 'lucide-react';
import WhatsAppIcon from '@/components/common/WhatsAppIcon';
import logoAlhijaz from '@/logo-alhijaz.webp';
import { fetchRahmahJuliPrepFromDb, saveRahmahJuliPrepToDb } from '@/lib/rahmahJuliPrepDb';
import {
  RAHMAH_JULI_CHECKLIST_ITEMS,
  RAHMAH_JULI_CONTACTS,
  RAHMAH_JULI_JAMAAH,
  RAHMAH_JULI_ROOM_FIELDS,
  RAHMAH_JULI_SLUG,
  RAHMAH_JULI_TRIP,
  getRahmahJuliGroups,
  type RahmahJuliChecklistId,
  type RahmahJuliContact,
  type RahmahJuliGroup,
  type RahmahJuliJamaah,
  type RahmahJuliRoomFieldId,
} from '@/lib/rahmahJuliLanding.js';

type JamaahPrepItem = Partial<Record<RahmahJuliChecklistId, boolean>>
  & Partial<Record<RahmahJuliRoomFieldId | 'phone', string>>;
type JamaahPrepState = Record<number, JamaahPrepItem>;
type FilterMode = 'all' | 'nusuk' | 'raudhah';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline';
type EditingRoom = { jamaahNo: number; fieldId: RahmahJuliRoomFieldId } | null;

const CHECKLIST_STORAGE_KEY = `${RAHMAH_JULI_SLUG}:checklist`;
const PREP_STORAGE_KEY = `${RAHMAH_JULI_SLUG}:prep`;
const RAHMAH_THEME_KEY = `${RAHMAH_JULI_SLUG}:theme`;
const ROOM_NUMBER_REGEX = /^\d{1,4}$/;
const FILTER_OPTIONS: { id: FilterMode; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'nusuk', label: 'Belum Nusuk' },
  { id: 'raudhah', label: 'Belum Raudhah' },
];

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function loadPrepState(): JamaahPrepState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PREP_STORAGE_KEY);
    if (raw) return JSON.parse(raw);

    const legacyRaw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (!legacyRaw) return {};
    return JSON.parse(legacyRaw);
  } catch {
    return {};
  }
}

function isChecked(prep: JamaahPrepState, jamaahNo: number, itemId: RahmahJuliChecklistId) {
  return !!prep[jamaahNo]?.[itemId];
}

function getMemberPhone(prep: JamaahPrepState, member: RahmahJuliJamaah) {
  const savedPhone = prep[member.no]?.phone;
  return typeof savedPhone === 'string' ? savedPhone : member.phone;
}

function normalizeJamaahWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

function getJamaahWhatsAppUrl(phone: string) {
  const normalized = normalizeJamaahWhatsAppNumber(phone);
  return normalized ? `https://wa.me/${normalized}` : '#';
}

function getRoomValue(prep: JamaahPrepState, jamaahNo: number, fieldId: RahmahJuliRoomFieldId) {
  return prep[jamaahNo]?.[fieldId]?.trim() || '';
}

function isMemberReady(prep: JamaahPrepState, member: RahmahJuliJamaah) {
  return RAHMAH_JULI_CHECKLIST_ITEMS.every((item) => isChecked(prep, member.no, item.id))
    && RAHMAH_JULI_ROOM_FIELDS.every((field) => getRoomValue(prep, member.no, field.id).length > 0);
}

function getMemberSummaryItems(prep: JamaahPrepState, member: RahmahJuliJamaah) {
  return [
    { id: 'wa', label: 'WA Sesuai', done: isChecked(prep, member.no, 'wa') },
    { id: 'nusuk', label: 'Nusuk', done: isChecked(prep, member.no, 'nusuk') },
    { id: 'raudhah', label: 'Raudhah', done: isChecked(prep, member.no, 'raudhah') },
  ];
}

function readInitialTheme() {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(RAHMAH_THEME_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function RahmahThemeToggle() {
  const [isDark, setIsDark] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      window.localStorage.setItem(RAHMAH_THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Theme persistence is optional; the visible toggle remains functional.
    }
  }, [isDark]);

  return (
    <button
      type="button"
      onClick={() => setIsDark((value) => !value)}
      aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
      className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {isDark ? <Sun className="h-4 w-4" strokeWidth={2} /> : <Moon className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}

function ContactPersonCard({ contact }: { contact: RahmahJuliContact }) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="relative h-12 w-12 flex-none">
        <span className={`absolute inset-0 rounded-full bg-gradient-to-br ${contact.photoClassName} opacity-70 blur-[1px] motion-safe:animate-pulse`} />
        <div className={`relative h-full w-full overflow-hidden rounded-full bg-gradient-to-br p-[2px] shadow-sm ring-2 ring-white dark:ring-slate-800 transition-transform duration-300 hover:scale-105 ${contact.photoClassName}`}>
          <img
            src={contact.photoUrl}
            alt={`Foto ${contact.name}`}
            className="h-full w-full rounded-full object-cover"
            style={{ objectPosition: contact.photoObjectPosition }}
          />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-gray-900 dark:text-slate-100">{contact.name}</p>
        <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-gray-500 dark:text-slate-400">
          <WhatsAppIcon size={12} className="flex-none text-emerald-500" />
          <span className="truncate">{contact.whatsappDisplay}</span>
        </div>
      </div>
      <div className="ml-auto flex flex-none flex-col items-end gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">
          {contact.role}
        </span>
        <a
          href={contact.whatsappUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Chat WhatsApp ${contact.name}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm shadow-emerald-500/20 transition-all duration-200 active:scale-95 hover:bg-emerald-600"
        >
          <WhatsAppIcon size={13} />
          <span>Chat WA</span>
        </a>
      </div>
    </article>
  );
}

function RoomValueEditor({
  member,
  field,
  value,
  editingRoom,
  roomDraft,
  onStartEditRoom,
  onRoomDraftChange,
  onCommitRoom,
}: {
  member: RahmahJuliJamaah;
  field: { id: RahmahJuliRoomFieldId; label: string };
  value: string;
  editingRoom: EditingRoom;
  roomDraft: string;
  onStartEditRoom: (member: RahmahJuliJamaah, field: { id: RahmahJuliRoomFieldId; label: string }) => void;
  onRoomDraftChange: (value: string) => void;
  onCommitRoom: () => void;
}) {
  const isEditing = editingRoom?.jamaahNo === member.no && editingRoom.fieldId === field.id;

  if (isEditing) {
    return (
      <div className="ml-auto flex flex-none items-center gap-1.5">
        <input
          data-jamaah-no={member.no}
          data-room-field={field.id}
          value={roomDraft}
          onChange={(event) => onRoomDraftChange(event.target.value)}
          aria-label={`${field.label} ${member.name}`}
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]{1,4}"
          className="h-8 w-16 rounded-lg border border-emerald-200 bg-white px-2 text-center text-xs font-bold tabular-nums text-gray-800 outline-none transition-all focus:ring-2 focus:ring-emerald-500/50 dark:border-emerald-800/40 dark:bg-slate-900 dark:text-white"
        />
        <button
          type="button"
          data-room-ok={`${member.no}:${field.id}`}
          onClick={onCommitRoom}
          disabled={!ROOM_NUMBER_REGEX.test(roomDraft)}
          className="h-8 rounded-lg bg-emerald-500 px-2.5 text-[10px] font-bold text-white shadow-sm shadow-emerald-500/20 transition active:scale-95 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-white disabled:shadow-none dark:disabled:bg-slate-700"
        >OK</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-room-edit={`${member.no}:${field.id}`}
      data-jamaah-no={member.no}
      data-room-field={field.id}
      onClick={() => onStartEditRoom(member, field)}
      className="ml-auto inline-flex h-8 flex-none items-center gap-1.5 rounded-lg bg-white px-2.5 text-[10px] font-bold tabular-nums text-gray-700 shadow-sm ring-1 ring-gray-100 transition-all active:scale-95 hover:bg-gray-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
    >
      <Pencil size={11} strokeWidth={2.5} className="text-gray-400 dark:text-slate-500" />
      <span>{value || '000'}</span>
    </button>
  );
}

function JamaahGroupMemberRow({
  member,
  prep,
  onToggle,
  editingPhoneNo,
  expandedJamaahNos,
  editingRoom,
  roomDraft,
  onStartEditPhone,
  onPhoneChange,
  onStopEditPhone,
  onToggleExpanded,
  onStartEditRoom,
  onRoomDraftChange,
  onCommitRoom,
}: {
  member: RahmahJuliJamaah;
  prep: JamaahPrepState;
  onToggle: (jamaahNo: number, itemId: RahmahJuliChecklistId) => void;
  editingPhoneNo: number | null;
  expandedJamaahNos: Set<number>;
  editingRoom: EditingRoom;
  roomDraft: string;
  onStartEditPhone: (member: RahmahJuliJamaah) => void;
  onPhoneChange: (jamaahNo: number, value: string) => void;
  onStopEditPhone: () => void;
  onToggleExpanded: (jamaahNo: number) => void;
  onStartEditRoom: (member: RahmahJuliJamaah, field: { id: RahmahJuliRoomFieldId; label: string }) => void;
  onRoomDraftChange: (value: string) => void;
  onCommitRoom: () => void;
}) {
  const avatarClass = member.gender === 'P'
    ? 'bg-pink-50 ring-pink-300 text-pink-700'
    : 'bg-blue-50 ring-blue-300 text-blue-700';
  const phone = getMemberPhone(prep, member);
  const memberWhatsAppUrl = getJamaahWhatsAppUrl(phone);
  const isEditingPhone = editingPhoneNo === member.no;
  const isExpanded = expandedJamaahNos.has(member.no);
  const summaryItems = getMemberSummaryItems(prep, member);
  const toggleLabel = isExpanded ? `Tutup detail ${member.name}` : `Buka detail ${member.name}`;
  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onToggleExpanded(member.no);
  };

  return (
    <article className="px-3 py-3">
      <div
        role="button"
        tabIndex={0}
        data-jamaah-toggle={member.no}
        onClick={() => onToggleExpanded(member.no)}
        onKeyDown={handleHeaderKeyDown}
        aria-expanded={isExpanded}
        aria-label={toggleLabel}
        className="-m-2 flex cursor-pointer items-start gap-2.5 rounded-xl p-2 transition-colors duration-200 hover:bg-gray-50/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:hover:bg-slate-800/60"
      >
        <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gray-50 text-xs font-extrabold ring-2 dark:bg-slate-800 ${avatarClass}`}>
          {getInitials(member.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-800 dark:text-slate-100">{member.name}</p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] font-medium text-gray-400 dark:text-slate-500">
            <span>{member.age} tahun</span>
            <span className="h-1 w-1 rounded-full bg-gray-300" />
            <span className="inline-flex min-w-0 items-center gap-1 font-semibold text-gray-500 dark:text-slate-400">
              <WhatsAppIcon size={12} className="flex-none text-emerald-500" />
              <span className={`truncate ${phone ? '' : 'text-gray-400 dark:text-slate-500'}`}>{phone || 'Belum diisi'}</span>
            </span>
            <button
              type="button"
              data-phone-edit={member.no}
              aria-label={`Edit nomor WhatsApp ${member.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onStartEditPhone(member);
              }}
              className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-md text-gray-400 transition-colors active:scale-95 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Pencil size={10} strokeWidth={2.6} />
            </button>
          </div>
        </div>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 flex-none items-center justify-center text-gray-400 transition-transform duration-200 dark:text-slate-400"
        >
          {isExpanded ? <ChevronUp size={16} strokeWidth={2.4} /> : <ChevronDown size={16} strokeWidth={2.4} />}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {summaryItems.map((item) => (
          <span
            key={item.id}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold transition-colors ${
              item.done
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'border-gray-200 bg-white text-gray-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500'
            }`}
          >
            <Check size={10} strokeWidth={3} className={item.done ? 'text-emerald-500' : 'text-gray-300 dark:text-slate-600'} />
            <span>{item.label}</span>
          </span>
        ))}
      </div>

      <div
        aria-hidden={!isExpanded}
        inert={isExpanded ? undefined : ''}
        className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
          isExpanded ? 'mt-3 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`space-y-3 transition-transform duration-300 ease-out motion-reduce:transition-none ${
            isExpanded ? 'translate-y-0 scale-100' : '-translate-y-1 scale-[0.98]'
          }`}>
            {isExpanded && (
              <a
                href={memberWhatsAppUrl}
                target="_blank"
                rel="noreferrer"
                data-member-whatsapp={member.no}
                aria-label={`Chat WhatsApp ${member.name}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-500/20 transition active:scale-[0.99] hover:bg-emerald-600"
              >
                <WhatsAppIcon size={14} />
                <span>WhatsApp</span>
              </a>
            )}

            {isEditingPhone && (
              <div className="flex gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2 dark:border-emerald-900/40 dark:bg-emerald-900/10">
                <input
                  type="tel"
                  data-phone-input={member.no}
                  value={phone}
                  onChange={(event) => onPhoneChange(member.no, event.target.value)}
                  placeholder="Nomor WA"
                  className="min-w-0 flex-1 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs font-bold text-gray-800 outline-none transition-all focus:ring-2 focus:ring-emerald-500/50 dark:border-emerald-800/40 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  data-phone-done={member.no}
                  onClick={onStopEditPhone}
                  className="inline-flex h-9 flex-none items-center gap-1 rounded-lg bg-emerald-500 px-3 text-[10px] font-bold text-white shadow-sm shadow-emerald-500/20 transition active:scale-95"
                >
                  <Check size={12} strokeWidth={2.8} />
                  Selesai
                </button>
              </div>
            )}

            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Checklist Persiapan</p>
                <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold ${
                  isMemberReady(prep, member)
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                    : 'bg-white text-gray-400 dark:bg-slate-900 dark:text-slate-500'
                }`}>
                  {isMemberReady(prep, member) ? 'Siap' : 'Belum lengkap'}
                </span>
              </div>

              <div className="space-y-1.5">
              {RAHMAH_JULI_CHECKLIST_ITEMS.map((item) => {
                const checked = isChecked(prep, member.no, item.id);
                const description = item.id === 'wa'
                  ? 'Nomor WhatsApp sudah sesuai apa belum?'
                  : item.id === 'nusuk'
                    ? 'Nusuk sudah install apa belum?'
                    : 'Raudhah sudah reserved jadwal apa belum?';
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-jamaah-no={member.no}
                    data-checklist-id={item.id}
                    onClick={() => onToggle(member.no, item.id)}
                    aria-pressed={checked}
                    className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-2 text-left transition active:scale-[0.99] dark:bg-slate-900 ${
                      checked
                        ? 'border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300'
                        : 'border-gray-200 text-gray-500 dark:border-slate-700 dark:text-slate-400'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[10px] font-extrabold text-gray-800 dark:text-slate-100">{item.label}</span>
                      <span className="mt-0.5 block truncate text-[9px] font-semibold opacity-70">{description}</span>
                    </span>
                    <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md border ${
                      checked ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                    }`}>
                      {checked && <Check size={13} strokeWidth={3} className="text-white" />}
                    </span>
                  </button>
                );
              })}

              {RAHMAH_JULI_ROOM_FIELDS.map((field) => {
                const question = field.id === 'roomMekkah'
                  ? 'Nomor Kamar Mekkah berapa?'
                  : 'Nomor Kamar Madinah berapa?';
                return (
                  <div
                    key={field.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold text-gray-600 dark:text-slate-300">{field.label}</span>
                      <span className="mt-0.5 block truncate text-[9px] font-semibold text-gray-400 dark:text-slate-500">{question}</span>
                    </div>
                    <RoomValueEditor
                      member={member}
                      field={field}
                      value={getRoomValue(prep, member.no, field.id)}
                      editingRoom={editingRoom}
                      roomDraft={roomDraft}
                      onStartEditRoom={onStartEditRoom}
                      onRoomDraftChange={onRoomDraftChange}
                      onCommitRoom={onCommitRoom}
                    />
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function JamaahGroupCard({
  group,
  prep,
  onToggle,
  editingPhoneNo,
  expandedJamaahNos,
  editingRoom,
  roomDraft,
  onStartEditPhone,
  onPhoneChange,
  onStopEditPhone,
  onToggleExpanded,
  onStartEditRoom,
  onRoomDraftChange,
  onCommitRoom,
}: {
  group: RahmahJuliGroup;
  prep: JamaahPrepState;
  onToggle: (jamaahNo: number, itemId: RahmahJuliChecklistId) => void;
  editingPhoneNo: number | null;
  expandedJamaahNos: Set<number>;
  editingRoom: EditingRoom;
  roomDraft: string;
  onStartEditPhone: (member: RahmahJuliJamaah) => void;
  onPhoneChange: (jamaahNo: number, value: string) => void;
  onStopEditPhone: () => void;
  onToggleExpanded: (jamaahNo: number) => void;
  onStartEditRoom: (member: RahmahJuliJamaah, field: { id: RahmahJuliRoomFieldId; label: string }) => void;
  onRoomDraftChange: (value: string) => void;
  onCommitRoom: () => void;
}) {
  const completedMembers = group.members.filter((member) => isMemberReady(prep, member)).length;

  return (
    <section className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden dark:border-amber-900/40 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-amber-50/60 border-b border-amber-100 dark:border-amber-900/30 dark:bg-amber-900/10">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/30 dark:text-amber-300">
            {group.displayName}
          </span>
          <span className="text-[11px] font-semibold text-gray-600 dark:text-slate-300">{group.members.length} jamaah</span>
        </div>
        <span className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300">
          {completedMembers}/{group.members.length} siap
        </span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {group.members.map((member) => (
          <JamaahGroupMemberRow
            key={member.no}
            member={member}
            prep={prep}
            onToggle={onToggle}
            editingPhoneNo={editingPhoneNo}
            expandedJamaahNos={expandedJamaahNos}
            editingRoom={editingRoom}
            roomDraft={roomDraft}
            onStartEditPhone={onStartEditPhone}
            onPhoneChange={onPhoneChange}
            onStopEditPhone={onStopEditPhone}
            onToggleExpanded={onToggleExpanded}
            onStartEditRoom={onStartEditRoom}
            onRoomDraftChange={onRoomDraftChange}
            onCommitRoom={onCommitRoom}
          />
        ))}
      </div>
    </section>
  );
}

export default function RahmahJuliLandingPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [prep, setPrep] = useState<JamaahPrepState>(() => loadPrepState());
  const [editingPhoneNo, setEditingPhoneNo] = useState<number | null>(null);
  const [expandedJamaahNos, setExpandedJamaahNos] = useState<Set<number>>(() => new Set());
  const [editingRoom, setEditingRoom] = useState<EditingRoom>(null);
  const [roomDraft, setRoomDraft] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const prepRef = useRef<JamaahPrepState>(prep);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Kloter 9 | Rahmah 1-9 Juli 2026 | Alhijaz Indowisata';
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRahmahJuliPrepFromDb()
      .then((dbPrep) => {
        if (cancelled || Object.keys(dbPrep).length === 0) return;
        prepRef.current = {
          ...prepRef.current,
          ...dbPrep,
        };
        setPrep((prev) => ({
          ...prev,
          ...dbPrep,
        }));
      })
      .catch((error) => {
        console.warn('[RahmahJuliLandingPage] Failed to load prep DB state:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isFilterOpen) {
      filterPanelRef.current?.removeAttribute('inert');
    } else {
      filterPanelRef.current?.setAttribute('inert', '');
    }
  }, [isFilterOpen]);

  useEffect(() => {
    if (!isFilterOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!filterWrapRef.current?.contains(event.target as Node)) setIsFilterOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFilterOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFilterOpen]);

  useEffect(() => {
    prepRef.current = prep;
    try {
      window.localStorage.setItem(PREP_STORAGE_KEY, JSON.stringify(prep));
    } catch {
      // Local prep persistence is optional; the page still works without it.
    }
  }, [prep]);

  const groups = useMemo(() => getRahmahJuliGroups(), []);
  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return groups
      .map((group) => {
        const members = group.members.filter((member) => {
          const matchesQuery = !normalizedQuery
            || group.displayName.toLowerCase().includes(normalizedQuery)
            || member.name.toLowerCase().includes(normalizedQuery)
            || getMemberPhone(prep, member).toLowerCase().includes(normalizedQuery);
          if (!matchesQuery) return false;
          if (filter === 'nusuk') return !isChecked(prep, member.no, 'nusuk');
          if (filter === 'raudhah') return !isChecked(prep, member.no, 'raudhah');
          return true;
        });
        return { ...group, members };
      })
      .filter((group) => group.members.length > 0);
  }, [filter, groups, prep, query]);

  const completedCount = useMemo(() => {
    return RAHMAH_JULI_JAMAAH.filter((member) => isMemberReady(prep, member)).length;
  }, [prep]);

  const persistPrepPatch = async (jamaahNo: number, nextItem: JamaahPrepItem) => {
    setSaveStatus('saving');
    try {
      await saveRahmahJuliPrepToDb(jamaahNo, nextItem);
      setSaveStatus('saved');
    } catch (error) {
      console.warn('[RahmahJuliLandingPage] Failed to save prep DB state:', error);
      setSaveStatus('offline');
    }
  };

  const handlePrepChange = (jamaahNo: number, patch: JamaahPrepItem) => {
    const nextItem = {
      ...prepRef.current[jamaahNo],
      ...patch,
    };
    const nextPrep = {
      ...prepRef.current,
      [jamaahNo]: nextItem,
    };
    prepRef.current = nextPrep;
    setPrep(nextPrep);
    void persistPrepPatch(jamaahNo, nextItem);
  };

  const handleToggle = (jamaahNo: number, itemId: RahmahJuliChecklistId) => {
    handlePrepChange(jamaahNo, { [itemId]: !prepRef.current[jamaahNo]?.[itemId] });
  };

  const handleStartEditPhone = (member: RahmahJuliJamaah) => {
    setEditingPhoneNo((current) => (current === member.no ? null : member.no));
    setExpandedJamaahNos((current) => new Set(current).add(member.no));
  };

  const handlePhoneChange = (jamaahNo: number, value: string) => {
    handlePrepChange(jamaahNo, { phone: value });
  };

  const handleStopEditPhone = () => {
    setEditingPhoneNo(null);
  };

  const handleToggleExpanded = (jamaahNo: number) => {
    setExpandedJamaahNos((current) => {
      const next = new Set(current);
      if (next.has(jamaahNo)) next.delete(jamaahNo);
      else next.add(jamaahNo);
      return next;
    });
  };

  const handleStartEditRoom = (
    member: RahmahJuliJamaah,
    field: { id: RahmahJuliRoomFieldId; label: string }
  ) => {
    setExpandedJamaahNos((current) => new Set(current).add(member.no));
    setEditingRoom({ jamaahNo: member.no, fieldId: field.id });
    setRoomDraft(getRoomValue(prepRef.current, member.no, field.id));
  };

  const handleRoomDraftChange = (value: string) => {
    setRoomDraft(value.replace(/\D/g, '').slice(0, 4));
  };

  const handleCommitRoom = () => {
    if (!editingRoom) return;
    if (!ROOM_NUMBER_REGEX.test(roomDraft)) return;
    handlePrepChange(editingRoom.jamaahNo, { [editingRoom.fieldId]: roomDraft });
    setEditingRoom(null);
    setRoomDraft('');
  };

  const waText = encodeURIComponent(
    `Assalamualaikum, saya ingin koreksi data jamaah Paket Rahmah 1 Juli 2026.`
  );
  const activeFilterLabel = FILTER_OPTIONS.find((option) => option.id === filter)?.label || 'Filter';
  const tourLeaderContact = RAHMAH_JULI_CONTACTS[0];
  const packageNameWithoutPrefix = RAHMAH_JULI_TRIP.packageName.replace(/^Paket\s+/i, '');
  const packageTitle = `${packageNameWithoutPrefix} (${RAHMAH_JULI_TRIP.packageVariant})`.toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 font-sans text-gray-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <a href="/" className="block flex-none" aria-label="Alhijaz Indowisata">
            <img
              src={logoAlhijaz}
              alt="Alhijaz Indowisata"
              className="h-8 w-auto object-contain"
            />
          </a>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-600 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300">
              {RAHMAH_JULI_TRIP.totalJamaah} JAMAAH
            </div>
            <RahmahThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-8 pt-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-slate-100">
                {packageTitle}
              </p>
              <p className="mt-1 text-[10px] font-semibold tracking-wide text-amber-600">
                <span>{RAHMAH_JULI_TRIP.travelDateRange}</span>
                <span className="text-gray-300"> · </span>
                <span className="text-gray-500 dark:text-slate-400">by {RAHMAH_JULI_TRIP.airline}</span>
              </p>
            </div>
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300">
              <UsersRound size={18} strokeWidth={2.4} />
            </div>
          </div>

        </section>

        <section className="space-y-2">
          {RAHMAH_JULI_CONTACTS.map((contact) => (
            <ContactPersonCard key={contact.role} contact={contact} />
          ))}
        </section>

        {/* Command Bar (Search + Filters) */}
        <section ref={filterWrapRef} className="relative z-20 rounded-2xl border border-gray-100 bg-white dark:bg-slate-800 p-3 shadow-sm dark:border-slate-700">
          <div className="flex gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-gray-50 px-3 transition-all focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/50 dark:bg-slate-900 dark:focus-within:bg-slate-900">
              <Search size={14} strokeWidth={2.4} className="flex-none text-gray-400 dark:text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama jamaah"
                className="min-w-0 flex-1 bg-transparent text-xs font-medium text-gray-800 dark:text-white outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
            </label>
            <button
              type="button"
              onClick={() => setIsFilterOpen((open) => !open)}
              aria-expanded={isFilterOpen}
              aria-haspopup="listbox"
              aria-label={`Filter jamaah: ${activeFilterLabel}`}
              className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg transition-all duration-200 active:scale-95 ${
                filter === 'all'
                  ? 'bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/70'
                  : 'bg-emerald-50 text-emerald-600 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800/40'
              }`}
            >
              <SlidersHorizontal size={16} strokeWidth={2.4} />
            </button>
          </div>

          <div
            ref={filterPanelRef}
            role="listbox"
            aria-label="Filter jamaah"
            aria-hidden={!isFilterOpen}
            className={`absolute right-3 top-[52px] z-40 w-48 origin-top rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden transition duration-150 ease-out ${
              isFilterOpen
                ? 'opacity-100 scale-100 translate-y-0'
                : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
            }`}
          >
            {FILTER_OPTIONS.map((option) => {
              const active = filter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setFilter(option.id);
                    setIsFilterOpen(false);
                  }}
                  role="option"
                  aria-selected={active}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-bold transition-colors ${
                    active
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                      : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span>{option.label}</span>
                  {active && <Check size={13} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-slate-100">DAFTAR JAMAAH</h2>
            <div className="flex items-center gap-2 text-[10px] font-medium text-gray-400 dark:text-slate-500">
              {saveStatus !== 'idle' && (
                <span className={`rounded-md px-1.5 py-0.5 font-bold ${
                  saveStatus === 'offline'
                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300'
                }`}>
                  {saveStatus === 'saving' ? 'Menyimpan' : saveStatus === 'saved' ? 'Tersimpan' : 'Offline'}
                </span>
              )}
              <p>{completedCount}/{RAHMAH_JULI_TRIP.totalJamaah} siap</p>
            </div>
          </div>

          {filteredGroups.length > 0 ? (
            <div className="space-y-4">
              {filteredGroups.map((group) => (
                <JamaahGroupCard
                  key={group.idUmrah}
                  group={group}
                  prep={prep}
                  onToggle={handleToggle}
                  editingPhoneNo={editingPhoneNo}
                  expandedJamaahNos={expandedJamaahNos}
                  editingRoom={editingRoom}
                  roomDraft={roomDraft}
                  onStartEditPhone={handleStartEditPhone}
                  onPhoneChange={handlePhoneChange}
                  onStopEditPhone={handleStopEditPhone}
                  onToggleExpanded={handleToggleExpanded}
                  onStartEditRoom={handleStartEditRoom}
                  onRoomDraftChange={handleRoomDraftChange}
                  onCommitRoom={handleCommitRoom}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Data tidak ditemukan</p>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">Coba cari dengan nama lain atau ID Umrah.</p>
            </div>
          )}
        </section>

        <a
          href={`${tourLeaderContact.whatsappUrl}?text=${waText}`}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition active:scale-95"
        >
          <WhatsAppIcon size={17} />
          Laporkan data yang belum sesuai
        </a>
      </main>
    </div>
  );
}
