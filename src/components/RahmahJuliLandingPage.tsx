import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronUp, Loader2, Moon, Package, Pencil, Save, Search, SlidersHorizontal, Sun, Truck, UsersRound } from 'lucide-react';
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
  & Partial<Record<
    RahmahJuliRoomFieldId | 'phone' | 'zamzamRecipientName' | 'zamzamRecipientPhone' | 'zamzamAddress',
    string
  >>
  & { zamzamMethod?: ZamzamMethod };
type JamaahPrepState = Record<number, JamaahPrepItem>;
type FilterMode = 'all' | 'nusuk' | 'raudhah';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline';
type ZamzamMethod = 'pickup' | 'delivery';
type ZamzamSaveFeedback = 'idle' | 'saved' | 'offline';
type ZamzamPrepPatch = Pick<
  JamaahPrepItem,
  'zamzamMethod' | 'zamzamRecipientName' | 'zamzamRecipientPhone' | 'zamzamAddress'
>;

const CHECKLIST_STORAGE_KEY = `${RAHMAH_JULI_SLUG}:checklist`;
const PREP_STORAGE_KEY = `${RAHMAH_JULI_SLUG}:prep`;
const RAHMAH_THEME_KEY = `${RAHMAH_JULI_SLUG}:theme`;
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

function getRoomValue(prep: JamaahPrepState, jamaahNo: number, fieldId: RahmahJuliRoomFieldId) {
  return prep[jamaahNo]?.[fieldId]?.trim() || '';
}

function isMemberReady(prep: JamaahPrepState, member: RahmahJuliJamaah) {
  return RAHMAH_JULI_CHECKLIST_ITEMS.every((item) => isChecked(prep, member.no, item.id))
    && RAHMAH_JULI_ROOM_FIELDS.every((field) => getRoomValue(prep, member.no, field.id).length > 0);
}

function getMemberSummaryItems(prep: JamaahPrepState, member: RahmahJuliJamaah) {
  const zamzamMethod = prep[member.no]?.zamzamMethod;
  return [{
    id: 'zamzam',
    label: zamzamMethod === 'delivery'
      ? 'Diantar ke Rumah'
      : zamzamMethod === 'pickup'
        ? 'Ambil Sendiri'
        : 'Belum Pilih',
    method: zamzamMethod || 'unselected',
  }];
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

function ZamzamPickupEditor({
  member,
  prep,
  onSave,
}: {
  member: RahmahJuliJamaah;
  prep: JamaahPrepState;
  onSave: (jamaahNo: number, patch: ZamzamPrepPatch) => Promise<boolean>;
}) {
  const savedMethod = prep[member.no]?.zamzamMethod || '';
  const savedRecipientName = prep[member.no]?.zamzamRecipientName || '';
  const savedRecipientPhone = prep[member.no]?.zamzamRecipientPhone || '';
  const savedAddress = prep[member.no]?.zamzamAddress || '';
  const [zamzamMethod, setZamzamMethod] = useState<ZamzamMethod | ''>(savedMethod);
  const [recipientName, setRecipientName] = useState(savedRecipientName);
  const [recipientPhone, setRecipientPhone] = useState(savedRecipientPhone);
  const [address, setAddress] = useState(savedAddress);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<ZamzamSaveFeedback>('idle');

  useEffect(() => {
    setZamzamMethod(savedMethod);
    setRecipientName(savedRecipientName);
    setRecipientPhone(savedRecipientPhone);
    setAddress(savedAddress);
  }, [savedAddress, savedMethod, savedRecipientName, savedRecipientPhone]);

  const deliveryDetailsComplete = recipientName.trim().length > 0
    && recipientPhone.trim().length > 0
    && address.trim().length > 0;
  const canSave = zamzamMethod === 'pickup'
    || (zamzamMethod === 'delivery' && deliveryDetailsComplete);

  return (
    <form
      data-zamzam-form={member.no}
      aria-busy={isSaving}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSave || !zamzamMethod || isSaving) return;
        setIsSaving(true);
        setSaveFeedback('idle');
        try {
          const savedOnline = await onSave(member.no, {
            zamzamMethod,
            zamzamRecipientName: zamzamMethod === 'delivery' ? recipientName.trim() : '',
            zamzamRecipientPhone: zamzamMethod === 'delivery' ? recipientPhone.trim() : '',
            zamzamAddress: zamzamMethod === 'delivery' ? address.trim() : '',
          });
          setSaveFeedback(savedOnline ? 'saved' : 'offline');
        } finally {
          setIsSaving(false);
        }
      }}
      className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 dark:border-emerald-800/40 dark:bg-emerald-900/10"
    >
      <div className="mb-3 flex items-start gap-2.5">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400">
          <Package size={16} strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-slate-200">Pengambilan Air Zam-zam</p>
          <p className="mt-0.5 text-[10px] font-medium leading-4 text-gray-500 dark:text-slate-400">Pilih ambil di kantor atau diantar ke rumah.</p>
        </div>
      </div>

      <fieldset>
        <legend className="sr-only">Cara pengambilan Air Zam-zam untuk {member.name}</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs font-semibold transition-all dark:bg-slate-900 ${
            zamzamMethod === 'pickup'
              ? 'border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:text-emerald-400'
              : 'border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-300'
          }`}>
            <input
              type="radio"
              name={`zamzam-method-${member.no}`}
              value="pickup"
              data-zamzam-method="pickup"
              checked={zamzamMethod === 'pickup'}
              onChange={() => {
                setZamzamMethod('pickup');
                setSaveFeedback('idle');
              }}
              className="h-4 w-4 flex-none accent-emerald-500"
            />
            <span>Ambil Sendiri</span>
          </label>
          <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs font-semibold transition-all dark:bg-slate-900 ${
            zamzamMethod === 'delivery'
              ? 'border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:text-emerald-400'
              : 'border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-300'
          }`}>
            <input
              type="radio"
              name={`zamzam-method-${member.no}`}
              value="delivery"
              data-zamzam-method="delivery"
              checked={zamzamMethod === 'delivery'}
              onChange={() => {
                setZamzamMethod('delivery');
                setSaveFeedback('idle');
              }}
              className="h-4 w-4 flex-none accent-emerald-500"
            />
            <Truck size={13} className="flex-none" />
            <span>Diantar ke Rumah</span>
          </label>
        </div>
      </fieldset>

      {zamzamMethod === 'delivery' && (
        <div data-zamzam-delivery-fields={member.no} className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
              Nama penerima <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={recipientName}
              onChange={(event) => {
                setRecipientName(event.target.value);
                setSaveFeedback('idle');
              }}
              data-zamzam-field="recipient-name"
              placeholder="Nama lengkap penerima"
              autoComplete="name"
              maxLength={120}
              required
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
              Nomor HP penerima <span className="text-red-500">*</span>
            </span>
            <input
              type="tel"
              value={recipientPhone}
              onChange={(event) => {
                setRecipientPhone(event.target.value);
                setSaveFeedback('idle');
              }}
              data-zamzam-field="recipient-phone"
              placeholder="Contoh: 0812 3456 7890"
              autoComplete="tel"
              inputMode="tel"
              maxLength={32}
              required
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
              Alamat lengkap <span className="text-red-500">*</span>
            </span>
            <textarea
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setSaveFeedback('idle');
              }}
              data-zamzam-field="address"
              placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan, kecamatan, kota, dan kode pos"
              autoComplete="street-address"
              rows={3}
              maxLength={500}
              required
              className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-5 text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white disabled:opacity-50"
            />
          </label>
        </div>
      )}

      <button
        type="submit"
        data-zamzam-save={member.no}
        disabled={!canSave || isSaving}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
      >
        {isSaving ? (
          <>
            <Loader2 size={16} strokeWidth={2.5} className="animate-spin" />
            Menyimpan Pilihan...
          </>
        ) : saveFeedback === 'saved' ? (
          <>
            <Check size={16} strokeWidth={2.5} />
            Pilihan Tersimpan
          </>
        ) : (
          <>
            <Save size={16} strokeWidth={2.5} />
            Simpan Pilihan
          </>
        )}
      </button>

      <div aria-live="polite" className="min-h-4">
        {saveFeedback === 'offline' && (
          <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            Tersimpan di perangkat. Coba simpan kembali saat koneksi tersedia.
          </p>
        )}
        {saveFeedback === 'saved' && (
          <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Pilihan Air Zam-zam berhasil disimpan.
          </p>
        )}
      </div>
    </form>
  );
}

function JamaahGroupMemberRow({
  member,
  prep,
  editingPhoneNo,
  expandedJamaahNos,
  onStartEditPhone,
  onPhoneChange,
  onStopEditPhone,
  onToggleExpanded,
  onSaveZamzam,
}: {
  member: RahmahJuliJamaah;
  prep: JamaahPrepState;
  editingPhoneNo: number | null;
  expandedJamaahNos: Set<number>;
  onStartEditPhone: (member: RahmahJuliJamaah) => void;
  onPhoneChange: (jamaahNo: number, value: string) => void;
  onStopEditPhone: () => void;
  onToggleExpanded: (jamaahNo: number) => void;
  onSaveZamzam: (jamaahNo: number, patch: ZamzamPrepPatch) => Promise<boolean>;
}) {
  const avatarClass = member.gender === 'P'
    ? 'bg-pink-50 ring-pink-300 text-pink-700'
    : 'bg-blue-50 ring-blue-300 text-blue-700';
  const phone = getMemberPhone(prep, member);
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
            data-zamzam-status={item.method}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold transition-colors ${
              item.method === 'unselected'
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300'
            }`}
          >
            {item.method === 'delivery'
              ? <Truck size={10} strokeWidth={2.5} />
              : <Package size={10} strokeWidth={2.5} />}
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

            <ZamzamPickupEditor
              member={member}
              prep={prep}
              onSave={onSaveZamzam}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function JamaahGroupCard({
  group,
  prep,
  editingPhoneNo,
  expandedJamaahNos,
  onStartEditPhone,
  onPhoneChange,
  onStopEditPhone,
  onToggleExpanded,
  onSaveZamzam,
}: {
  group: RahmahJuliGroup;
  prep: JamaahPrepState;
  editingPhoneNo: number | null;
  expandedJamaahNos: Set<number>;
  onStartEditPhone: (member: RahmahJuliJamaah) => void;
  onPhoneChange: (jamaahNo: number, value: string) => void;
  onStopEditPhone: () => void;
  onToggleExpanded: (jamaahNo: number) => void;
  onSaveZamzam: (jamaahNo: number, patch: ZamzamPrepPatch) => Promise<boolean>;
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
            editingPhoneNo={editingPhoneNo}
            expandedJamaahNos={expandedJamaahNos}
            onStartEditPhone={onStartEditPhone}
            onPhoneChange={onPhoneChange}
            onStopEditPhone={onStopEditPhone}
            onToggleExpanded={onToggleExpanded}
            onSaveZamzam={onSaveZamzam}
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
      return true;
    } catch (error) {
      console.warn('[RahmahJuliLandingPage] Failed to save prep DB state:', error);
      setSaveStatus('offline');
      return false;
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
    return persistPrepPatch(jamaahNo, nextItem);
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

  const handleSaveZamzam = (jamaahNo: number, patch: ZamzamPrepPatch) => {
    return handlePrepChange(jamaahNo, patch);
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
                  editingPhoneNo={editingPhoneNo}
                  expandedJamaahNos={expandedJamaahNos}
                  onStartEditPhone={handleStartEditPhone}
                  onPhoneChange={handlePhoneChange}
                  onStopEditPhone={handleStopEditPhone}
                  onToggleExpanded={handleToggleExpanded}
                  onSaveZamzam={handleSaveZamzam}
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
