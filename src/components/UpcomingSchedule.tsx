import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plane, User, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAuthHeaders } from './LoginPage';

interface EventDetail {
  group_number: string | null;
  pesawat: string | null;
  jam: string | null;
  paket: string | null;
  pax: number;
  staff: string | null;
  tour_leader: string | null;
}

interface CalendarEvent {
  date: string;
  type: 'manasik' | 'keberangkatan' | 'kepulangan';
  details: EventDetail[];
}

const TYPE_CONFIG = {
  manasik: {
    label: 'MANASIK',
    dotColor: 'bg-purple-500',
    textColor: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-l-purple-400',
  },
  keberangkatan: {
    label: 'KEBERANGKATAN',
    dotColor: 'bg-emerald-500',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    borderColor: 'border-l-emerald-400',
  },
  kepulangan: {
    label: 'KEPULANGAN',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-l-blue-400',
  },
} as const;

const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function cacheKey(year: number, month: number) {
  return `${year}-${month}`;
}

export default function UpcomingSchedule() {
  const now = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [calendarData, setCalendarData] = useState<Record<string, CalendarEvent[]>>({});
  const [loading, setLoading] = useState(true);

  // Fetch data for a specific month (with caching)
  const fetchMonth = useCallback(async (year: number, month: number) => {
    const key = cacheKey(year, month);
    if (calendarData[key]) return;

    try {
      const res = await fetch(`/api/calendar/events?month=${month}&year=${year}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        setCalendarData(prev => ({ ...prev, [key]: [] }));
        return;
      }
      const result = await res.json();
      const events: CalendarEvent[] = result.success ? (result.data?.events || []) : [];
      setCalendarData(prev => ({ ...prev, [key]: events }));
    } catch {
      setCalendarData(prev => ({ ...prev, [key]: [] }));
    }
  }, [calendarData]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchMonth(currentMonth.year, currentMonth.month).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch when month changes
  useEffect(() => {
    const key = cacheKey(currentMonth.year, currentMonth.month);
    if (!calendarData[key]) {
      setLoading(true);
      fetchMonth(currentMonth.year, currentMonth.month).finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth.year, currentMonth.month]);

  // Body scroll lock
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

  // Event map: day number → Set of event types
  const eventMap = useMemo(() => {
    const map: Record<number, Set<string>> = {};
    for (const ev of monthEvents) {
      const day = parseInt(ev.date.split('-')[2], 10);
      if (!map[day]) map[day] = new Set();
      map[day].add(ev.type);
    }
    return map;
  }, [monthEvents]);

  // Calendar grid cells
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

  // Events for selected day (bottom sheet)
  const selectedEvents = useMemo(() => {
    if (selectedDay === null) return [];
    const dateStr = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    return monthEvents.filter(ev => ev.date === dateStr);
  }, [selectedDay, monthEvents, currentMonth.year, currentMonth.month]);

  // Loading skeleton
  if (loading && monthEvents.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden mb-5">
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

  return (
    <>
      {/* ── Calendar Card (fixed size) ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden mb-5">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400 dark:text-slate-500" />
            <span className="text-sm font-bold text-gray-800 dark:text-white">
              {MONTH_NAMES[currentMonth.month - 1]} {currentMonth.year}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors active:scale-95"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={nextMonth}
              className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors active:scale-95"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 px-3">
          {DAY_HEADERS.map(d => (
            <div key={d} className="text-center text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        {monthEvents.length === 0 && !loading ? (
          <div className="py-8 text-center text-[11px] text-gray-400 dark:text-slate-500">
            Data kalender belum tersedia
          </div>
        ) : (
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
                  onClick={() => {
                    if (!hasEvent) return;
                    setSelectedDay(selected ? null : day);
                  }}
                  className={`flex flex-col items-center py-1.5 rounded-lg transition-colors ${
                    selected ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                  } ${hasEvent ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/30' : 'cursor-default'}`}
                >
                  {today ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-semibold">
                      {day}
                    </div>
                  ) : (
                    <span className={`text-xs font-semibold leading-6 ${
                      selected
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : hasEvent
                          ? 'text-gray-700 dark:text-slate-300'
                          : 'text-gray-400 dark:text-slate-500'
                    }`}>
                      {day}
                    </span>
                  )}
                  {hasEvent ? (
                    <div className="flex gap-0.5 mt-1">
                      {(['manasik', 'keberangkatan', 'kepulangan'] as const).map(t =>
                        types.has(t) ? (
                          <div key={t} className={`w-1.5 h-1.5 rounded-full ${TYPE_CONFIG[t].dotColor}`} />
                        ) : null
                      )}
                    </div>
                  ) : (
                    <div className="h-1.5 mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="px-4 py-2 border-t border-gray-50 dark:border-slate-700/50 flex gap-3">
          {(['manasik', 'keberangkatan', 'kepulangan'] as const).map(t => (
            <div key={t} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${TYPE_CONFIG[t].dotColor}`} />
              <span className="text-[8px] font-semibold text-gray-400 dark:text-slate-500 uppercase">
                {TYPE_CONFIG[t].label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Sheet ── */}
      <AnimatePresence>
        {selectedDay !== null && (
          <>
            {/* Overlay */}
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelectedDay(null)}
            />

            {/* Sheet */}
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

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {selectedEvents.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-gray-400 dark:text-slate-500">
                    Tidak ada jadwal
                  </div>
                ) : (
                  selectedEvents.map(event => {
                    const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.manasik;
                    const validDetails = event.details.filter(d => d.group_number && d.group_number !== '-' && d.pax > 0);
                    const totalPax = validDetails.reduce((s, d) => s + (d.pax || 0), 0);

                    return (
                      <div key={`${event.date}_${event.type}`}>
                        {/* Event type header */}
                        <div className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${config.bgColor} ${config.textColor}`}>
                              {config.label}
                            </span>
                            <span className="text-[10px] text-gray-500 dark:text-slate-400">
                              {validDetails.length > 0 && `${validDetails.length} group · ${totalPax} pax`}
                            </span>
                          </div>
                        </div>

                        {/* Group cards */}
                        <div className="space-y-1.5 mb-3">
                          {validDetails.map((detail, di) => (
                            <div
                              key={di}
                              className={`bg-gray-50 dark:bg-slate-700/30 rounded-xl px-3 py-2.5 border border-gray-100 dark:border-slate-600/30 border-l-2 ${config.borderColor}`}
                            >
                              {/* Row 1: Group + Jam + PAX */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-600/50 px-2 py-0.5 rounded-md border border-gray-200 dark:border-slate-500/30">
                                    Group {detail.group_number}
                                  </span>
                                  <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">
                                    {detail.jam || '-'}
                                  </span>
                                </div>
                                <span className="text-[11px] font-bold text-gray-700 dark:text-slate-200">
                                  {detail.pax} pax
                                </span>
                              </div>

                              {/* Row 2: Pesawat */}
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <Plane size={11} className="text-gray-300 dark:text-slate-500 shrink-0" />
                                <span className="text-[10px] text-gray-500 dark:text-slate-400">
                                  {detail.pesawat || '-'}
                                </span>
                              </div>

                              {/* Row 3: Paket */}
                              <p className="text-[10px] text-gray-600 dark:text-slate-300 leading-relaxed mt-1">
                                {detail.paket || '-'}
                              </p>

                              {/* Row 4: Tour Leader */}
                              {detail.tour_leader && detail.tour_leader !== '-' && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <User size={10} className="text-gray-300 dark:text-slate-500 shrink-0" />
                                  <span className="text-[9px] font-medium text-gray-400 dark:text-slate-500">
                                    TL: {detail.tour_leader}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
