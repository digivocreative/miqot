import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, FileText, Plane, PlaneTakeoff, User, UserCheck, Users, Clock, X, MapPin } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAuthHeaders } from './LoginPage';
import { airportTerminalLabel } from '../lib/calendarTerminal';
import { formatCalendarMeetingPoint, formatCalendarPrimaryPerson } from '../lib/calendarPeople';

const ItineraryModal = lazy(() => import('./ItineraryModal').then(module => ({ default: module.ItineraryModal })));

interface EventDetail {
  jadwal_id: string | null;
  group_number: string | null;
  pesawat: string | null;
  jam: string | null;
  paket: string | null;
  pax: number;
  pax_jamaah: number | null;
  pax_terisi: number | null;
  staff: string | null;
  mutawif: string | null;
  tour_leader: string | null;
  jam_kumpul: string | null;
  titik_kumpul: string | null;
  departure_airport_code: string | null;
  departure_airport_city: string | null;
  departure_terminal: string | null;
  arrival_airport_code: string | null;
  arrival_airport_city: string | null;
  arrival_terminal: string | null;
  itinerary_url: string | null;
}

// pax legacy = kuota grup nasional, bukan jumlah jamaah. Tampilkan kursi
// terisi nasional (pax_terisi = kuota − sisa) bila baris ter-map ke jadwal;
// fallback ke kuota legacy bila tidak (mis. WAITINGLIST tanpa jadwal padanan).
function displayPax(d: EventDetail): number {
  return d.pax_terisi ?? d.pax ?? 0;
}

function hasDisplayableDetail(d: EventDetail): boolean {
  return displayPax(d) > 0 || !!(d.paket || d.pesawat || d.jam || d.group_number);
}

interface CalendarEvent {
  date: string;
  type: 'manasik' | 'keberangkatan' | 'kepulangan';
  details: EventDetail[];
}

type TabKey = 'keberangkatan' | 'kepulangan' | 'manasik';

const TAB_CONFIG: Record<TabKey, {
  label: string;
  dotColor: string;
  activeTab: string;
  borderColor: string;
  textColor: string;
  textColorDark: string;
  iconColor: string;
  footerBg: string;
  footerBorder: string;
}> = {
  keberangkatan: {
    label: 'Berangkat',
    dotColor: 'bg-emerald-500',
    activeTab: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20',
    borderColor: 'border-l-emerald-400',
    textColor: 'text-emerald-600',
    textColorDark: 'dark:text-emerald-400',
    iconColor: 'text-emerald-400 dark:text-emerald-400',
    footerBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    footerBorder: 'border-emerald-100 dark:border-emerald-800/40',
  },
  kepulangan: {
    label: 'Pulang',
    dotColor: 'bg-blue-500',
    activeTab: 'bg-blue-500 text-white shadow-md shadow-blue-500/20',
    borderColor: 'border-l-blue-400',
    textColor: 'text-blue-600',
    textColorDark: 'dark:text-blue-400',
    iconColor: 'text-blue-400 dark:text-blue-400',
    footerBg: 'bg-blue-50 dark:bg-blue-900/20',
    footerBorder: 'border-blue-100 dark:border-blue-800/40',
  },
  manasik: {
    label: 'Manasik',
    dotColor: 'bg-violet-500',
    activeTab: 'bg-violet-500 text-white shadow-md shadow-violet-500/20',
    borderColor: 'border-l-violet-400',
    textColor: 'text-violet-600',
    textColorDark: 'dark:text-violet-400',
    iconColor: 'text-violet-400 dark:text-violet-400',
    footerBg: 'bg-violet-50 dark:bg-violet-900/20',
    footerBorder: 'border-violet-100 dark:border-violet-800/40',
  },
};

const TAB_ORDER: TabKey[] = ['keberangkatan', 'kepulangan', 'manasik'];
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function cacheKey(year: number, month: number) {
  return `${year}-${month}`;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Nama paket manasik dari sistem legacy menempelkan tanggal berangkat grup
// sebagai prefix "DD/MM/YYYYNAMA PAKET" — pisahkan untuk tampilan.
function parsePaket(paket: string | null): { name: string; departure: string | null } {
  if (!paket) return { name: '-', departure: null };
  const m = paket.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(.+)$/);
  if (!m) return { name: paket, departure: null };
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return { name: paket, departure: null };
  return { name: m[4].trim(), departure: `${parseInt(m[1], 10)} ${SHORT_MONTHS[monthIdx]} ${m[3]}` };
}


export default function UpcomingSchedule() {
  const now = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('keberangkatan');
  const [calendarData, setCalendarData] = useState<Record<string, CalendarEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeItinerary, setActiveItinerary] = useState<{ url: string; title: string } | null>(null);
  const calendarDataRef = useRef(calendarData);
  calendarDataRef.current = calendarData;

  const fetchMonth = useCallback(async (year: number, month: number) => {
    const key = cacheKey(year, month);
    if (calendarDataRef.current[key]) return;
    try {
      const res = await fetch(`/api/calendar/events?month=${month}&year=${year}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) { setCalendarData(prev => ({ ...prev, [key]: [] })); return; }
      const result = await res.json();
      const events: CalendarEvent[] = result.success ? (result.data?.events || []) : [];
      setCalendarData(prev => ({ ...prev, [key]: events }));
    } catch {
      setCalendarData(prev => ({ ...prev, [key]: [] }));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchMonth(currentMonth.year, currentMonth.month).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchMonth(currentMonth.year, currentMonth.month).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth.year, currentMonth.month]);

  useEffect(() => {
    if (selectedDay !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedDay]);

  function prevMonth() {
    setSelectedDay(null);
    setCurrentMonth(prev => ({
      year: prev.month === 1 ? prev.year - 1 : prev.year,
      month: prev.month === 1 ? 12 : prev.month - 1,
    }));
  }

  function nextMonth() {
    setSelectedDay(null);
    setCurrentMonth(prev => ({
      year: prev.month === 12 ? prev.year + 1 : prev.year,
      month: prev.month === 12 ? 1 : prev.month + 1,
    }));
  }

  const key = cacheKey(currentMonth.year, currentMonth.month);
  const monthEvents = calendarData[key] || [];

  const eventMap = useMemo(() => {
    const map: Record<number, Set<string>> = {};
    for (const ev of monthEvents) {
      if (!ev.details.some(hasDisplayableDetail)) continue;
      const day = parseInt(ev.date.split('-')[2], 10);
      if (!map[day]) map[day] = new Set();
      map[day].add(ev.type);
    }
    return map;
  }, [monthEvents]);

  const cells = useMemo(() => {
    const firstDay = new Date(currentMonth.year, currentMonth.month - 1, 1).getDay();
    const daysInMonth = new Date(currentMonth.year, currentMonth.month, 0).getDate();
    const c: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) c.push(null);
    for (let d = 1; d <= daysInMonth; d++) c.push(d);
    while (c.length % 7 !== 0) c.push(null);
    return c;
  }, [currentMonth.year, currentMonth.month]);

  const isToday = (day: number) =>
    day === now.getDate() &&
    currentMonth.month === now.getMonth() + 1 &&
    currentMonth.year === now.getFullYear();

  // Events for selected day, grouped by type
  const selectedEventsByType = useMemo(() => {
    if (selectedDay === null) return {} as Record<TabKey, EventDetail[]>;
    const dateStr = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    const result: Record<TabKey, EventDetail[]> = { keberangkatan: [], kepulangan: [], manasik: [] };
    for (const ev of monthEvents) {
      if (ev.date === dateStr && result[ev.type as TabKey]) {
        // Jangan tampilkan placeholder kosong dari sync legacy; group_number bisa kosong
        // dari sumber lama maupun fallback jadwal, selama detail jadwalnya ada.
        const valid = ev.details.filter(hasDisplayableDetail);
        result[ev.type as TabKey].push(...valid);
      }
    }
    return result;
  }, [selectedDay, monthEvents, currentMonth.year, currentMonth.month]);

  // Auto-select first tab that has data when opening bottom sheet
  useEffect(() => {
    if (selectedDay !== null) {
      const firstWithData = TAB_ORDER.find(t => (selectedEventsByType[t]?.length || 0) > 0);
      if (firstWithData) setActiveTab(firstWithData);
      else setActiveTab('keberangkatan');
    }
  }, [selectedDay, selectedEventsByType]);

  // Loading skeleton
  if (loading && monthEvents.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="h-4 w-28 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="flex gap-1">
            <div className="w-7 h-7 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
            <div className="w-7 h-7 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="px-3 pb-3">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center py-1.5">
                <div className="w-5 h-5 bg-gray-100 dark:bg-slate-700/50 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const tabConfig = TAB_CONFIG[activeTab];
  const activeDetails = selectedEventsByType[activeTab] || [];
  const totalPax = activeDetails.reduce((s, d) => s + displayPax(d), 0);

  return (
    <>
      {/* ── Calendar Card (fixed size) ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400 dark:text-slate-500" />
            <span className="text-sm font-bold text-gray-800 dark:text-white">
              {MONTH_NAMES[currentMonth.month - 1]} {currentMonth.year}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors active:scale-95">
              <ChevronLeft size={16} />
            </button>
            <button onClick={nextMonth} className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors active:scale-95">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 px-3">
          {DAY_HEADERS.map(d => (
            <div key={d} className="text-center text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase py-1">{d}</div>
          ))}
        </div>

        {/* Calendar Grid — always rendered */}
        <div className="grid grid-cols-7 px-3 pb-2">
          {cells.map((day, i) => {
            if (day === null) return <div key={`blank-${i}`} className="py-1.5" />;
            const types = eventMap[day];
            const hasEvent = types && types.size > 0;
            const today = isToday(day);
            const selected = selectedDay === day;

            return (
              <button
                key={day}
                onClick={() => { if (!hasEvent) return; setSelectedDay(selected ? null : day); }}
                className={`flex flex-col items-center py-1.5 rounded-lg transition-colors ${selected ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''} ${hasEvent ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/30' : 'cursor-default'}`}
              >
                {today ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-semibold">{day}</div>
                ) : (
                  <span className={`text-xs font-semibold leading-6 ${selected ? 'text-emerald-600 dark:text-emerald-400' : hasEvent ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500'}`}>{day}</span>
                )}
                {hasEvent ? (
                  <div className="flex gap-0.5 mt-1">
                    {TAB_ORDER.map(t => types.has(t) ? <div key={t} className={`w-1.5 h-1.5 rounded-full ${TAB_CONFIG[t].dotColor}`} /> : null)}
                  </div>
                ) : (
                  <div className="h-1.5 mt-1" />
                )}
              </button>
            );
          })}
        </div>
        {monthEvents.length === 0 && !loading && (
          <div className="pb-2 text-center text-[11px] text-gray-400 dark:text-slate-500">
            Belum ada jadwal di bulan ini
          </div>
        )}

        {/* Legend */}
        <div className="px-4 py-2 border-t border-gray-50 dark:border-slate-700/50 flex gap-3">
          {TAB_ORDER.map(t => (
            <div key={t} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${TAB_CONFIG[t].dotColor}`} />
              <span className="text-[8px] font-semibold text-gray-400 dark:text-slate-500 uppercase">{TAB_CONFIG[t].label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Sheet ── */}
      <AnimatePresence>
        {selectedDay !== null && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelectedDay(null)}
            />

            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 shadow-2xl max-h-[70vh] flex flex-col"
            >
              {/* Handle bar */}
              <div className="py-2 flex justify-center">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
              </div>

              {/* Header */}
              <div className="px-4 pb-2 flex items-center justify-between">
                <span className="text-base font-bold text-gray-800 dark:text-white">
                  {selectedDay} {MONTH_NAMES[currentMonth.month - 1]} {currentMonth.year}
                </span>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Pill Tabs */}
              <div className="px-4 pb-3">
                <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-1 flex gap-1">
                  {TAB_ORDER.map(t => {
                    const conf = TAB_CONFIG[t];
                    const count = (selectedEventsByType[t] || []).length;
                    const isActive = activeTab === t;

                    return (
                      <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          isActive
                            ? conf.activeTab
                            : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                        }`}
                      >
                        {conf.label}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${
                          isActive ? 'bg-white/20' : 'bg-gray-200/60 dark:bg-slate-700'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content */}
              {activeDetails.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-[11px] text-gray-400 dark:text-slate-500">
                    Tidak ada {tabConfig.label.toLowerCase()} di tanggal ini
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto">
                    {activeDetails.map((detail, i) => {
                      const paket = parsePaket(detail.paket);
                      // Data legacy memprefiks nama tour leader dengan "•  " — buang
                      const tourLeader = formatCalendarPrimaryPerson(detail.tour_leader);
                      const hasTourLeader = !!tourLeader;
                      const mutawif = formatCalendarPrimaryPerson(detail.mutawif);
                      const meetingPoint = formatCalendarMeetingPoint(detail.titik_kumpul);
                      const airportTerminalText = airportTerminalLabel(detail, activeTab);
                      return (
                      <div
                        key={i}
                        className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors ${
                          i > 0 ? 'border-t border-gray-100 dark:border-slate-700' : ''
                        }`}
                      >
                        {/* Center — Info */}
                        <div className="flex-1 min-w-0">
                          {/* Kloter + pesawat */}
                          <div className="flex items-center gap-1.5 text-[10px]">
                            {detail.group_number && (
                              <>
                                <span className={`flex shrink-0 items-center gap-1 font-bold ${tabConfig.textColor} ${tabConfig.textColorDark}`}>
                                  <Users size={10} className="shrink-0" />
                                  KLOTER {detail.group_number}
                                </span>
                                <span className="text-gray-300 dark:text-slate-600">·</span>
                              </>
                            )}
                            <Plane size={11} className={`${tabConfig.iconColor} shrink-0`} />
                            <span className="font-bold text-gray-800 dark:text-white truncate">{detail.pesawat || '-'}</span>
                          </div>
                          {/* Paket */}
                          <p className="text-[10px] text-gray-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {paket.name}
                          </p>
                          {/* Waktu/lokasi kumpul, lalu takeoff/terminal pada baris terpisah */}
                          {activeTab === 'keberangkatan' && detail.jam ? (
                            <div className="mt-1.5 space-y-1 text-[11px] text-gray-500 dark:text-slate-400">
                              {detail.jam_kumpul ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span>Kumpul</span>
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{detail.jam_kumpul}</span>
                                  {meetingPoint && (
                                    <>
                                      <span>di</span>
                                      <span className="text-gray-600 dark:text-slate-300">{meetingPoint}</span>
                                    </>
                                  )}
                                </div>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-1">
                                <span>Take off</span>
                                <span className="font-semibold text-gray-700 dark:text-slate-200">{detail.jam}</span>
                                {airportTerminalText && (
                                  <>
                                    <span className="text-gray-300 dark:text-slate-600 mx-0.5">·</span>
                                    <PlaneTakeoff size={11} className={`${tabConfig.iconColor} shrink-0`} />
                                    <span>{airportTerminalText}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 flex-wrap text-[11px] text-gray-500 dark:text-slate-400 mt-1.5">
                              <Clock size={10} className={`${tabConfig.iconColor} shrink-0`} />
                              {activeTab === 'kepulangan' && detail.jam && <span>Tiba</span>}
                              <span>{detail.jam || '-'}</span>
                              {paket.departure && (
                                <>
                                  <span className="text-gray-300 dark:text-slate-600 mx-0.5">·</span>
                                  <Plane size={10} className={`${tabConfig.iconColor} shrink-0`} />
                                  <span>Berangkat</span>
                                  <span className="font-semibold text-gray-700 dark:text-slate-200">{paket.departure}</span>
                                </>
                              )}
                              {airportTerminalText && (
                                <>
                                  <span className="text-gray-300 dark:text-slate-600 mx-0.5">·</span>
                                  <MapPin size={10} className={`${tabConfig.iconColor} shrink-0`} />
                                  <span>{airportTerminalText}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Right — PAX + itinerary */}
                        <div className="flex flex-shrink-0 flex-col items-end text-right pt-0.5">
                          {detail.itinerary_url && (
                            <button
                              type="button"
                              onClick={() => setActiveItinerary({
                                url: detail.itinerary_url as string,
                                title: paket.name,
                              })}
                              className={`flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8px] font-extrabold tracking-wide transition-colors hover:bg-emerald-100 active:scale-95 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 ${tabConfig.textColor} ${tabConfig.textColorDark}`}
                            >
                              <FileText size={9} strokeWidth={2.5} />
                              ITINERARY
                            </button>
                          )}
                          <div className="mt-auto">
                            <div className="text-lg font-extrabold text-gray-800 dark:text-white leading-none">{displayPax(detail)}</div>
                            <div className="text-[8px] font-bold text-gray-500 dark:text-slate-400 uppercase mt-0.5">PAX</div>
                          </div>
                        </div>

                        {/* Pendamping rombongan — satu baris rapat tanpa teks saling menimpa */}
                        {(hasTourLeader || activeTab === 'keberangkatan') && (
                          <div className="col-span-2 mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] leading-relaxed text-gray-600 dark:text-slate-300">
                            {hasTourLeader && (
                              <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                                <User size={10} className={`shrink-0 ${tabConfig.textColor} ${tabConfig.textColorDark}`} />
                                <span className="truncate font-medium">{tourLeader}</span>
                              </span>
                            )}
                            {hasTourLeader && activeTab === 'keberangkatan' && (
                              <span className="shrink-0 text-gray-300 dark:text-slate-600">·</span>
                            )}
                            {activeTab === 'keberangkatan' && (
                              <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                                <UserCheck size={10} className={`shrink-0 ${tabConfig.textColor} ${tabConfig.textColorDark}`} />
                                <span className={`truncate ${mutawif ? 'font-medium' : 'italic text-gray-400 dark:text-slate-500'}`}>
                                  {mutawif ? <>UST. {mutawif}</> : 'Belum ditentukan'}
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>

                  {/* Footer Summary */}
                  <div className={`sticky bottom-0 ${tabConfig.footerBg} border-t ${tabConfig.footerBorder} px-4 py-2.5 flex items-center justify-between`}>
                    <span className={`text-[10px] font-bold ${tabConfig.textColor} ${tabConfig.textColorDark}`}>
                      Total {tabConfig.label}
                    </span>
                    <span className={`text-xs font-extrabold ${tabConfig.textColor} ${tabConfig.textColorDark}`}>
                      {activeDetails.length} kloter · {totalPax} pax
                    </span>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {activeItinerary && (
        <Suspense fallback={null}>
          <ItineraryModal
            isOpen={true}
            onClose={() => setActiveItinerary(null)}
            fileUrl={activeItinerary.url}
            title={activeItinerary.title}
          />
        </Suspense>
      )}
    </>
  );
}
