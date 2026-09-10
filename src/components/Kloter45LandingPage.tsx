import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BedDouble, BookHeart, Check, ChevronDown, ChevronRight, ChevronUp, HandHeart, Route, Search, SlidersHorizontal } from 'lucide-react';
import WhatsAppIcon from '@/components/common/WhatsAppIcon';
import Kloter45ThemeToggle from '@/components/kloter45/ThemeToggle';
import Kloter45ShineLogo from '@/components/kloter45/ShineLogo';
import Kloter45BacaanPage from '@/components/kloter45/BacaanPage';
import Kloter45RoomListPage from '@/components/kloter45/RoomListPage';
import Kloter45ItineraryPage from '@/components/kloter45/ItineraryPage';
import { KLOTER45_DOA_TABS, KLOTER45_DZIKIR_TABS } from '@/lib/kloter45Bacaan';
import { fetchKloter45PrepFromDb, saveKloter45PrepToDb } from '@/lib/kloter45PrepDb';
import {
  KLOTER45_CHECKLIST_ITEMS,
  KLOTER45_CONTACTS,
  KLOTER45_JAMAAH,
  KLOTER45_MENU,
  KLOTER45_SLUG,
  KLOTER45_TRIP,
  filterKloter45Groups,
  getKloter45Groups,
  getKloter45MemberPhone as getMemberPhone,
  getKloter45SubPagePath,
  isKloter45Checked as isChecked,
  resolveKloter45SubPage,
  type Kloter45ChecklistId,
  type Kloter45Contact,
  type Kloter45Group,
  type Kloter45Jamaah,
  type Kloter45SubPage,
} from '@/lib/kloter45Landing.js';

type JamaahPrepItem = Partial<Record<Kloter45ChecklistId, boolean>> & { phone?: string };
type JamaahPrepState = Record<number, JamaahPrepItem>;
type FilterMode = 'all' | 'nusuk';
type SaveStatus = 'idle' | 'saving' | 'saved';
type PrepLoadState = 'loading' | 'ready' | 'failed';

const PREP_STORAGE_KEY = `${KLOTER45_SLUG}:prep`;
const PAGE_TITLE = 'KLOTER 45 | 26 SEP - 5 OKT 2026 | ALHIJAZ INDOWISATA';
type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
// Tiap menu punya ikon dan warna sendiri supaya mudah dibedakan sekilas.
const MENU_STYLES: Record<Kloter45SubPage, { icon: IconComponent; iconClass: string }> = {
  doa: { icon: HandHeart, iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300' },
  dzikir: { icon: BookHeart, iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-300' },
  itinerary: { icon: Route, iconClass: 'bg-violet-50 text-violet-600 dark:bg-violet-900/25 dark:text-violet-300' },
  'room-list': { icon: BedDouble, iconClass: 'bg-sky-50 text-sky-600 dark:bg-sky-900/25 dark:text-sky-300' },
};
const CHECKLIST_QUESTIONS: Record<Kloter45ChecklistId, string> = {
  wa: 'Nomor WhatsApp sudah sesuai apa belum?',
  nusuk: 'Nusuk sudah install apa belum?',
};
const CHECKLIST_CHIP_LABELS: Record<Kloter45ChecklistId, string> = {
  wa: 'WA Sesuai',
  nusuk: 'Nusuk',
};
const FILTER_OPTIONS: { id: FilterMode; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'nusuk', label: 'Belum Nusuk' },
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
  } catch {
    // Local prep state is a convenience only; a fresh page still works.
  }
  return {};
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

function isMemberReady(prep: JamaahPrepState, member: Kloter45Jamaah) {
  return KLOTER45_CHECKLIST_ITEMS.every((item) => isChecked(prep, member.no, item.id));
}

function getMemberChecklistChips(prep: JamaahPrepState, member: Kloter45Jamaah) {
  return KLOTER45_CHECKLIST_ITEMS.map((item) => ({
    id: item.id,
    label: CHECKLIST_CHIP_LABELS[item.id],
    done: isChecked(prep, member.no, item.id),
  }));
}

function subPageFromLocation(): Kloter45SubPage | null {
  if (typeof window === 'undefined') return null;
  const segments = window.location.pathname.split('/').filter(Boolean);
  return segments.length === 2 ? resolveKloter45SubPage(segments[1]) : null;
}

// Sub-halaman (Doa / Dzikir / Room List) punya URL sendiri supaya bisa
// dibagikan langsung, tapi perpindahannya tetap di klien (pushState) supaya
// tidak memuat ulang daftar jamaah. Tombol Back HP ditangani lewat popstate.
// Arah transisi: masuk sub-halaman geser dari kanan (+1), kembali geser dari
// kiri (-1). Posisi gulir daftar jamaah disimpan saat pergi dan dipulihkan
// saat kembali, supaya tidak melompat ke atas.
function useKloter45SubPage(initial: Kloter45SubPage | null) {
  const [subPage, setSubPage] = useState<Kloter45SubPage | null>(initial);
  const [direction, setDirection] = useState<1 | -1>(1);
  const homeScrollRef = useRef(0);
  const subPageRef = useRef(subPage);
  subPageRef.current = subPage;

  const go = useCallback((next: Kloter45SubPage | null) => {
    if (subPageRef.current === null && next !== null) homeScrollRef.current = window.scrollY;
    setDirection(next ? 1 : -1);
    setSubPage(next);
  }, []);

  const navigate = useCallback((next: Kloter45SubPage | null) => {
    go(next);
    const nextPath = getKloter45SubPagePath(next);
    if (window.location.pathname !== nextPath) window.history.pushState(null, '', nextPath);
  }, [go]);

  useEffect(() => {
    const onPopState = () => go(subPageFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [go]);

  // Dipanggil saat halaman baru mulai masuk (bukan saat state berubah), jadi
  // halaman lama tidak ikut melompat selagi animasi keluarnya berjalan.
  const restoreScroll = useCallback(() => {
    window.scrollTo({ top: subPageRef.current ? 0 : homeScrollRef.current, behavior: 'auto' });
  }, []);

  return { subPage, direction, navigate, restoreScroll };
}

// Cepat: keluar 90ms + masuk 180ms ≈ 270ms total (mode="wait" menjalankannya
// berurutan). Lebih lama dari ini terasa lambat di HP.
const PAGE_TRANSITION_VARIANTS = {
  enter: (direction: number) => ({ x: direction > 0 ? 20 : -20, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.18 } },
  exit: (direction: number) => ({
    x: direction > 0 ? -14 : 14,
    opacity: 0,
    transition: { type: 'tween', ease: [0.4, 0, 1, 1], duration: 0.09 },
  }),
} as const;
const REDUCED_MOTION_VARIANTS = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
} as const;

function ContactPersonRow({ contact }: { contact: Kloter45Contact }) {
  return (
    <article className="flex items-center gap-3 px-4 py-3">
      <div className="relative h-10 w-10 flex-none">
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

function JamaahGroupMemberRow({
  member,
  prep,
  editingPhoneNo,
  expandedJamaahNos,
  onToggleChecklist,
  onStartEditPhone,
  onPhoneChange,
  onStopEditPhone,
  onToggleExpanded,
}: {
  member: Kloter45Jamaah;
  prep: JamaahPrepState;
  editingPhoneNo: number | null;
  expandedJamaahNos: Set<number>;
  onToggleChecklist: (jamaahNo: number, itemId: Kloter45ChecklistId) => void;
  onStartEditPhone: (member: Kloter45Jamaah) => void;
  onPhoneChange: (jamaahNo: number, value: string) => void;
  onStopEditPhone: () => void;
  onToggleExpanded: (jamaahNo: number) => void;
}) {
  const avatarClass = member.gender === 'P'
    ? 'bg-pink-50 ring-pink-300 text-pink-700'
    : 'bg-blue-50 ring-blue-300 text-blue-700';
  const phone = getMemberPhone(prep, member);
  const isEditingPhone = editingPhoneNo === member.no;
  const isExpanded = expandedJamaahNos.has(member.no);
  const checklistChips = getMemberChecklistChips(prep, member);
  const memberReady = isMemberReady(prep, member);
  const memberWhatsAppUrl = getJamaahWhatsAppUrl(phone);
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
              aria-label={`Ubah nomor WhatsApp ${member.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onStartEditPhone(member);
              }}
              className="-my-0.5 inline-flex flex-none items-center rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 transition-colors active:scale-95 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-800/40 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
            >
              Ubah
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
        {checklistChips.map((item) => (
          <span
            key={item.id}
            data-checklist-chip={item.id}
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
                  className="min-w-0 flex-1 rounded-lg border border-emerald-100 bg-white px-3 py-2 coarse:py-1.5 text-xs font-bold text-gray-800 outline-none transition-all focus:ring-2 focus:ring-emerald-500/50 dark:border-emerald-800/40 dark:bg-slate-900 dark:text-white"
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
                  memberReady
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                    : 'bg-white text-gray-400 dark:bg-slate-900 dark:text-slate-500'
                }`}>
                  {memberReady ? 'Siap' : 'Belum lengkap'}
                </span>
              </div>

              <div className="space-y-1.5">
                {KLOTER45_CHECKLIST_ITEMS.map((item) => {
                  const checked = isChecked(prep, member.no, item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-jamaah-no={member.no}
                      data-checklist-id={item.id}
                      onClick={() => onToggleChecklist(member.no, item.id)}
                      aria-pressed={checked}
                      className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-2 text-left transition active:scale-[0.99] dark:bg-slate-900 ${
                        checked
                          ? 'border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300'
                          : 'border-gray-200 text-gray-500 dark:border-slate-700 dark:text-slate-400'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[10px] font-extrabold text-gray-800 dark:text-slate-100">{item.label}</span>
                        <span className="mt-0.5 block truncate text-[9px] font-semibold opacity-70">{CHECKLIST_QUESTIONS[item.id]}</span>
                      </span>
                      <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md border ${
                        checked ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                      }`}>
                        {checked && <Check size={13} strokeWidth={3} className="text-white" />}
                      </span>
                    </button>
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
  editingPhoneNo,
  expandedJamaahNos,
  onToggleChecklist,
  onStartEditPhone,
  onPhoneChange,
  onStopEditPhone,
  onToggleExpanded,
}: {
  group: Kloter45Group;
  prep: JamaahPrepState;
  editingPhoneNo: number | null;
  expandedJamaahNos: Set<number>;
  onToggleChecklist: (jamaahNo: number, itemId: Kloter45ChecklistId) => void;
  onStartEditPhone: (member: Kloter45Jamaah) => void;
  onPhoneChange: (jamaahNo: number, value: string) => void;
  onStopEditPhone: () => void;
  onToggleExpanded: (jamaahNo: number) => void;
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
            onToggleChecklist={onToggleChecklist}
            onStartEditPhone={onStartEditPhone}
            onPhoneChange={onPhoneChange}
            onStopEditPhone={onStopEditPhone}
            onToggleExpanded={onToggleExpanded}
          />
        ))}
      </div>
    </section>
  );
}

export default function Kloter45LandingPage({
  initialSubPage = null,
}: {
  initialSubPage?: Kloter45SubPage | null;
}) {
  const { subPage, direction, navigate: navigateSubPage, restoreScroll } = useKloter45SubPage(initialSubPage);
  const shouldReduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [prep, setPrep] = useState<JamaahPrepState>(() => loadPrepState());
  const [editingPhoneNo, setEditingPhoneNo] = useState<number | null>(null);
  const [expandedJamaahNos, setExpandedJamaahNos] = useState<Set<number>>(() => new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const prepRef = useRef<JamaahPrepState>(prep);
  const prepLoadStateRef = useRef<PrepLoadState>('loading');
  const loadPrepPromiseRef = useRef<Promise<PrepLoadState> | null>(null);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menuLabel = KLOTER45_MENU.find((item) => item.id === subPage)?.label;
    document.title = menuLabel ? `${menuLabel} | ${PAGE_TITLE}` : PAGE_TITLE;
  }, [subPage]);

  // Menyimpan berarti menulis ulang seluruh entry jamaah, jadi tulis baru boleh
  // jalan setelah state server terbaca — kalau tidak, centang yang sudah ada di
  // database bisa terhapus oleh perangkat yang belum sinkron.
  const loadPrepFromDb = () => {
    if (loadPrepPromiseRef.current) return loadPrepPromiseRef.current;
    const pending = fetchKloter45PrepFromDb()
      .then((dbPrep) => {
        prepLoadStateRef.current = 'ready';
        if (Object.keys(dbPrep).length > 0) {
          prepRef.current = { ...prepRef.current, ...dbPrep };
          setPrep((prev) => ({ ...prev, ...dbPrep }));
        }
        return prepLoadStateRef.current;
      })
      .catch((error) => {
        prepLoadStateRef.current = 'failed';
        console.warn('[Kloter45LandingPage] Failed to load prep DB state:', error);
        return prepLoadStateRef.current;
      })
      .finally(() => {
        loadPrepPromiseRef.current = null;
      });
    loadPrepPromiseRef.current = pending;
    return pending;
  };

  useEffect(() => {
    loadPrepFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const groups = useMemo(() => getKloter45Groups(), []);
  const filteredGroups = useMemo(
    () => filterKloter45Groups(groups, { query, prep, filter }),
    [filter, groups, prep, query]
  );

  const completedCount = useMemo(() => {
    return KLOTER45_JAMAAH.filter((member) => isMemberReady(prep, member)).length;
  }, [prep]);

  const applyPrepPatchLocally = (jamaahNo: number, patch: JamaahPrepItem) => {
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
    return nextItem;
  };

  const persistPrepPatch = async (jamaahNo: number, patch: JamaahPrepItem) => {
    setSaveStatus('saving');
    if (prepLoadStateRef.current !== 'ready') {
      // Muat awal gagal — coba sekali lagi sebelum menulis, supaya gangguan
      // jaringan sesaat tidak mengunci penyimpanan sepanjang sesi.
      const state = await loadPrepFromDb();
      if (state !== 'ready') {
        setSaveStatus('idle');
        return false;
      }
      // State server baru saja ditumpangkan; pasang ulang perubahan di atasnya.
      applyPrepPatchLocally(jamaahNo, patch);
    }
    try {
      await saveKloter45PrepToDb(jamaahNo, prepRef.current[jamaahNo]);
      setSaveStatus('saved');
      return true;
    } catch (error) {
      console.warn('[Kloter45LandingPage] Failed to save prep DB state:', error);
      setSaveStatus('idle');
      return false;
    }
  };

  const handlePrepChange = (jamaahNo: number, patch: JamaahPrepItem) => {
    // Perubahan tampil dulu (optimistis), penyimpanan menyusul.
    applyPrepPatchLocally(jamaahNo, patch);
    return persistPrepPatch(jamaahNo, patch);
  };

  const handleToggleChecklist = (jamaahNo: number, itemId: Kloter45ChecklistId) => {
    handlePrepChange(jamaahNo, { [itemId]: !prepRef.current[jamaahNo]?.[itemId] });
  };

  const handleStartEditPhone = (member: Kloter45Jamaah) => {
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

  const waText = encodeURIComponent(
    `Assalamualaikum, saya ingin koreksi data jamaah ${KLOTER45_TRIP.kloterLabel} ${KLOTER45_TRIP.departureDate}.`
  );
  const activeFilterLabel = FILTER_OPTIONS.find((option) => option.id === filter)?.label || 'Filter';
  const tourLeaderContact = KLOTER45_CONTACTS[0];
  const packageNameWithoutPrefix = KLOTER45_TRIP.packageName.replace(/^Paket\s+/i, '');
  const packageTitle = `${packageNameWithoutPrefix} (${KLOTER45_TRIP.packageVariant})`.toUpperCase();
  const goHome = () => navigateSubPage(null);

  let subView: ReactNode = null;
  if (subPage === 'doa') {
    subView = <Kloter45BacaanPage pageId="doa" title="Doa" icon={HandHeart} tabs={KLOTER45_DOA_TABS} onBack={goHome} />;
  } else if (subPage === 'dzikir') {
    subView = <Kloter45BacaanPage pageId="dzikir" title="Dzikir" icon={BookHeart} tabs={KLOTER45_DZIKIR_TABS} onBack={goHome} />;
  } else if (subPage === 'itinerary') {
    subView = <Kloter45ItineraryPage onBack={goHome} />;
  } else if (subPage === 'room-list') {
    subView = <Kloter45RoomListPage onBack={goHome} />;
  }

  const homeView = (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 font-sans text-gray-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <Kloter45ShineLogo />
          <Kloter45ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-8 pt-4">
        {/* Info trip + kontak dalam satu kartu supaya hemat tinggi di HP. */}
        <section
          data-trip-card
          className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="px-4 pb-3 pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-slate-100">
              {packageTitle}
            </p>
            <p className="mt-1 text-[10px] font-semibold tracking-wide text-amber-600">
              <span>{KLOTER45_TRIP.travelDateRange}</span>
              <span className="text-gray-300"> · </span>
              <span className="text-gray-500 dark:text-slate-400">by {KLOTER45_TRIP.airline}</span>
            </p>
          </div>
          <div className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-slate-800 dark:border-slate-800">
            {KLOTER45_CONTACTS.map((contact) => (
              <ContactPersonRow key={contact.role} contact={contact} />
            ))}
          </div>
        </section>

        <nav aria-label="Menu jamaah" data-kloter45-menu className="grid grid-cols-2 gap-2">
          {KLOTER45_MENU.map((item) => {
            const { icon: Icon, iconClass } = MENU_STYLES[item.id];
            return (
              <a
                key={item.id}
                href={getKloter45SubPagePath(item.id)}
                data-kloter45-menu-item={item.id}
                onClick={(event) => {
                  event.preventDefault();
                  navigateSubPage(item.id);
                }}
                className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white py-2.5 pl-2.5 pr-3 shadow-sm transition active:scale-95 hover:border-gray-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${iconClass}`}>
                  <Icon size={20} strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-800 dark:text-slate-100">{item.label}</span>
                <ChevronRight size={14} strokeWidth={2.4} className="flex-none text-gray-300 dark:text-slate-600" />
              </a>
            );
          })}
        </nav>

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
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300">
                  {saveStatus === 'saving' ? 'Menyimpan' : 'Tersimpan'}
                </span>
              )}
              <p>{completedCount}/{KLOTER45_TRIP.totalJamaah} siap</p>
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
                  onToggleChecklist={handleToggleChecklist}
                  onStartEditPhone={handleStartEditPhone}
                  onPhoneChange={handlePhoneChange}
                  onStopEditPhone={handleStopEditPhone}
                  onToggleExpanded={handleToggleExpanded}
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

  // Satu halaman tampil pada satu waktu (mode="wait"): yang lama keluar dulu,
  // baru yang baru masuk — tanpa animasi saat muat pertama (initial={false}).
  // overflow-x-clip menahan geseran 28px agar tidak memunculkan scroll samping;
  // clip (bukan hidden) supaya header sticky di dalamnya tetap bekerja.
  return (
    <div className="overflow-x-clip">
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={subPage ?? 'home'}
          data-page-transition={subPage ?? 'home'}
          custom={direction}
          variants={shouldReduceMotion ? REDUCED_MOTION_VARIANTS : PAGE_TRANSITION_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          onAnimationStart={(definition) => {
            if (definition === 'center') restoreScroll();
          }}
        >
          {subView ?? homeView}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
