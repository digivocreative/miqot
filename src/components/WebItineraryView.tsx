import { AlertCircle, MapPin, Sparkles, Plane, Calendar, Users, Clock } from 'lucide-react';
import { UmrohPackage } from '@/types';

// ============================================
// Types
// ============================================

interface ItineraryActivity {
  time: string;
  text: string;
}

interface ItineraryDay {
  dayNumber: string;
  title: string;
  location: string;
  activities: ItineraryActivity[];
}

export interface ItineraryContent {
  days: ItineraryDay[];
}

interface WebItineraryViewProps {
  content: ItineraryContent | null;
  loading: boolean;
  error: string | null;
  paket: UmrohPackage;
  agentSlug: string | null;
  agentName: string | null;
  agentPhone: string | null;
  agentPhoto: string | null;
}

// ============================================
// Helpers
// ============================================

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const getDurationDays = (paket: UmrohPackage): number => {
  if (!paket.keberangkatan?.tgl || !paket.kepulangan?.tgl) return 9;
  const dep = new Date(paket.keberangkatan.tgl);
  const ret = new Date(paket.kepulangan.tgl);
  const diff = Math.ceil((ret.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 9;
};

/** Pick a subtle accent based on day index */
const DAY_ACCENTS = [
  { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800/40' },
  { dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-100 dark:border-blue-800/40' },
  { dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-100 dark:border-violet-800/40' },
  { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-100 dark:border-amber-800/40' },
  { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-100 dark:border-rose-800/40' },
  { dot: 'bg-cyan-500', badge: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-100 dark:border-cyan-800/40' },
  { dot: 'bg-teal-500', badge: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border-teal-100 dark:border-teal-800/40' },
  { dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-100 dark:border-indigo-800/40' },
];

// ============================================
// Component
// ============================================

export default function WebItineraryView({
  content,
  loading,
  error,
  paket,
  agentSlug,
  agentName,
  agentPhone,
  agentPhoto,
}: WebItineraryViewProps) {

  // ── Loading State ──
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 min-h-[60vh]">
        <div className="h-28 bg-emerald-50 dark:bg-emerald-900/10 animate-pulse" />
        <div className="px-5 py-4 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3">
              <div className="w-10 flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse" />
                <div className="w-px flex-1 bg-gray-100 dark:bg-slate-800 mt-1" />
              </div>
              <div className="flex-1 pb-4 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/3 animate-pulse" />
                <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded w-2/3 animate-pulse" />
                <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center py-4 gap-2">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-[10px] text-gray-400 dark:text-slate-500">Membaca PDF & menyusun itinerary...</p>
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-3">
          <AlertCircle size={22} className="text-red-500" />
        </div>
        <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">Gagal memuat itinerary</p>
        <p className="text-xs text-gray-400 mt-1 max-w-[240px] leading-relaxed">{error}</p>
      </div>
    );
  }

  if (!content) return null;

  const durationDays = getDurationDays(paket);

  return (
    <div className="bg-white dark:bg-slate-900">

      {/* ── Header — clean, minimal ── */}
      <div className="border-b border-gray-100 dark:border-slate-800 px-5 py-4 bg-gray-50/50 dark:bg-slate-800/30">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Itinerary Perjalanan</p>
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-white leading-snug">{paket.nama}</h3>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">{formatDate(paket.keberangkatan?.tgl)}</p>
          </div>
        </div>

        {/* Compact info row */}
        <div className="flex gap-3 mt-3">
          <span className="text-[10px] text-gray-500 dark:text-slate-400 inline-flex items-center gap-1">
            <Calendar size={10} className="text-gray-400" /> {durationDays} Hari
          </span>
          <span className="text-[10px] text-gray-500 dark:text-slate-400 inline-flex items-center gap-1">
            <Plane size={10} className="text-gray-400" /> {paket.maskapai}
          </span>
          <span className="text-[10px] text-gray-500 dark:text-slate-400 inline-flex items-center gap-1">
            <Users size={10} className="text-gray-400" /> {paket.seatSisa} seat
          </span>
        </div>
      </div>

      {/* ── AI source badge ── */}
      <div className="px-5 pt-3 pb-1">
        <div className="inline-flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-slate-500">
          <Sparkles size={10} />
          <span>Diekstrak dari PDF asli</span>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="px-5 pt-2 pb-4">
        {content.days.map((day, idx) => {
          const isLast = idx === content.days.length - 1;
          const accent = DAY_ACCENTS[idx % DAY_ACCENTS.length];

          return (
            <div key={idx} className="flex gap-0">

              {/* Left rail: dot + connector */}
              <div className="w-8 flex flex-col items-center flex-shrink-0 pt-1">
                <div className={`w-3 h-3 rounded-full ${accent.dot} ring-4 ring-white dark:ring-slate-900 flex-shrink-0`} />
                {!isLast && <div className="w-px flex-1 bg-gray-200 dark:bg-slate-700" />}
              </div>

              {/* Right: day content */}
              <div className={`flex-1 ${!isLast ? 'pb-5' : 'pb-1'} -mt-0.5`}>

                {/* Day badge */}
                <div className={`inline-flex items-center gap-1.5 border rounded-md px-2 py-0.5 mb-1.5 ${accent.badge}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wide">{day.dayNumber}</span>
                </div>

                {/* Title + location */}
                <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-snug">{day.title}</p>
                <div className="flex items-center gap-1 mt-0.5 mb-2.5">
                  <MapPin size={9} className="text-gray-400 dark:text-slate-500" />
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">{day.location}</span>
                </div>

                {/* Activities with time */}
                <div className="space-y-0">
                  {day.activities.map((act, i) => {
                    const activity = typeof act === 'string' ? { time: '-', text: act } : act;
                    const showTime = activity.time && activity.time !== '-';

                    return (
                      <div key={i} className="flex items-start gap-0 group">
                        {/* Time column */}
                        <div className="w-[46px] flex-shrink-0 pt-[7px]">
                          {showTime ? (
                            <span className="text-[10px] font-mono font-semibold text-gray-500 dark:text-slate-400">{activity.time}</span>
                          ) : (
                            <span className="text-[10px] text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </div>

                        {/* Activity text */}
                        <div className="flex-1 flex items-start gap-2 py-[6px] border-b border-gray-50 dark:border-slate-800/50 group-last:border-0">
                          <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-slate-600 flex-shrink-0 mt-[7px]" />
                          <p className="text-[12px] text-gray-700 dark:text-slate-300 leading-relaxed">{activity.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Agent CTA ── */}
      {agentSlug && (
        <div className="px-5 pb-4">
          <div className="border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold overflow-hidden flex-shrink-0">
                {agentPhoto
                  ? <img src={agentPhoto} alt={agentName || ''} className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                  : agentName?.[0]?.toUpperCase()
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{agentName}</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500">Agen Umroh · Alhijaz Indowisata</p>
              </div>
            </div>
            <div className="px-4 pb-3">
              <button
                onClick={() => {
                  const msg = encodeURIComponent(`Assalamualaikum, Saya mau tanya terkait paket ${paket.nama}`);
                  window.open(`https://wa.me/${agentPhone}?text=${msg}`, '_blank');
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors active:scale-[0.97]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.109.547 4.09 1.505 5.814L0 24l6.334-1.49A11.933 11.933 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-4.989-1.364l-.357-.213-3.762.986.998-3.649-.233-.375A9.818 9.818 0 1112 21.818z"/>
                </svg>
                Chat WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
