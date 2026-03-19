import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plane, Users as UsersIcon } from 'lucide-react';
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
  },
  keberangkatan: {
    label: 'KEBERANGKATAN',
    dotColor: 'bg-emerald-500',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
  kepulangan: {
    label: 'KEPULANGAN',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
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
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [calendarData, setCalendarData] = useState<Record<string, CalendarEvent[]>>({});
  const [loading, setLoading] = useState(true);

  // Fetch data for a specific month (with caching)
  const fetchMonth = useCallback(async (year: number, month: number) => {
    const key = cacheKey(year, month);
    if (calendarData[key]) return; // already cached

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

  // Navigate months
  function prevMonth() {
    setSelectedDay(null);
    setExpandedEvent(null);
    setCurrentMonth(prev => {
      const m = prev.month === 1 ? 12 : prev.month - 1;
      const y = prev.month === 1 ? prev.year - 1 : prev.year;
      return { year: y, month: m };
    });
  }

  function nextMonth() {
    setSelectedDay(null);
    setExpandedEvent(null);
    setCurrentMonth(prev => {
      const m = prev.month === 12 ? 1 : prev.month + 1;
      const y = prev.month === 12 ? prev.year + 1 : prev.year;
      return { year: y, month: m };
    });
  }

  // Current month's events
  const key = cacheKey(currentMonth.year, currentMonth.month);
  const monthEvents = calendarData[key] || [];

  // Build event map: dateStr → types[]
  const eventMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const ev of monthEvents) {
      const day = parseInt(ev.date.split('-')[2], 10);
      if (!map[day]) map[day] = new Set();
      map[day].add(ev.type);
    }
    return map;
  }, [monthEvents]);

  // Calendar grid cells
  const { cells, totalRows } = useMemo(() => {
    const firstDay = new Date(currentMonth.year, currentMonth.month - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(currentMonth.year, currentMonth.month, 0).getDate();
    const cells: (number | null)[] = [];

    // Leading blanks
    for (let i = 0; i < firstDay; i++) cells.push(null);
    // Days
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Trailing blanks to fill rows
    while (cells.length % 7 !== 0) cells.push(null);

    return { cells, totalRows: cells.length / 7 };
  }, [currentMonth.year, currentMonth.month]);

  // Is today
  const isToday = (day: number) =>
    day === now.getDate() &&
    currentMonth.month === now.getMonth() + 1 &&
    currentMonth.year === now.getFullYear();

  // Events for selected day
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
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden mb-5">
      {/* ── Header ── */}
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

      {/* ── Day Headers ── */}
      <div className="grid grid-cols-7 px-3">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar Grid ── */}
      {monthEvents.length === 0 && !loading ? (
        <div className="py-8 text-center text-[11px] text-gray-400 dark:text-slate-500">
          Data kalender belum tersedia
        </div>
      ) : (
        <div className="grid grid-cols-7 px-3 pb-2">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`blank-${i}`} className="py-1.5" />;
            }

            const types = eventMap[day];
            const hasEvent = types && types.size > 0;
            const today = isToday(day);
            const selected = selectedDay === day;

            return (
              <button
                key={day}
                onClick={() => {
                  if (selectedDay === day) {
                    setSelectedDay(null);
                    setExpandedEvent(null);
                  } else {
                    setSelectedDay(day);
                    setExpandedEvent(null);
                  }
                }}
                className={`flex flex-col items-center py-1.5 rounded-lg transition-colors ${
                  selected
                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'
                } ${hasEvent ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {today ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-semibold">
                    {day}
                  </div>
                ) : (
                  <span className={`text-xs font-semibold leading-6 ${
                    hasEvent
                      ? 'text-gray-700 dark:text-slate-300'
                      : 'text-gray-400 dark:text-slate-500'
                  } ${selected ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    {day}
                  </span>
                )}
                {/* Colored dots */}
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

      {/* ── Legend ── */}
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

      {/* ── Selected Day Detail ── */}
      <AnimatePresence>
        {selectedDay !== null && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-3">
              <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                {selectedDay} {MONTH_NAMES[currentMonth.month - 1]} {currentMonth.year}
              </p>

              {selectedEvents.length === 0 ? (
                <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center py-3">
                  Tidak ada jadwal tanggal {selectedDay} {MONTH_NAMES[currentMonth.month - 1]}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selectedEvents.map(event => {
                    const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.manasik;
                    const totalPax = event.details.reduce((s, d) => s + (d.pax || 0), 0);
                    const groupCount = event.details.filter(d => d.group_number).length;
                    const eventKey = `${event.date}_${event.type}`;
                    const isExpanded = expandedEvent === eventKey;

                    return (
                      <div key={eventKey}>
                        <button
                          onClick={() => setExpandedEvent(isExpanded ? null : eventKey)}
                          className="w-full flex items-center justify-between py-1.5 hover:bg-gray-50/50 dark:hover:bg-slate-700/20 rounded-lg px-1 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${config.bgColor} ${config.textColor}`}>
                              {config.label}
                            </span>
                            <span className="text-[10px] text-gray-500 dark:text-slate-400">
                              {groupCount > 0 && `${groupCount} group`}
                              {groupCount > 0 && totalPax > 0 && ' · '}
                              {totalPax > 0 && `${totalPax} pax`}
                            </span>
                          </div>
                          {isExpanded
                            ? <ChevronUp size={14} className="text-gray-300 dark:text-slate-600" />
                            : <ChevronDown size={14} className="text-gray-300 dark:text-slate-600" />
                          }
                        </button>

                        {/* Expanded detail rows */}
                        <AnimatePresence>
                          {isExpanded && event.details.length > 0 && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="mt-1.5 space-y-1">
                                {event.details.map((detail, di) => (
                                  <div
                                    key={di}
                                    className="bg-gray-50 dark:bg-slate-700/30 rounded-lg px-3 py-2"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold text-gray-700 dark:text-slate-200">
                                        Group {detail.group_number || '-'}
                                      </span>
                                      <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 flex items-center gap-0.5">
                                        <UsersIcon size={9} className="text-gray-400 dark:text-slate-500" />
                                        {detail.pax || 0} pax
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                                      <Plane size={9} className="text-gray-400 dark:text-slate-500 shrink-0" />
                                      {detail.pesawat || '-'} · {detail.jam || '-'}
                                    </p>
                                    <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">
                                      {detail.paket || '-'}
                                    </p>
                                    {detail.tour_leader && detail.tour_leader !== '-' && (
                                      <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">
                                        TL: {detail.tour_leader}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
