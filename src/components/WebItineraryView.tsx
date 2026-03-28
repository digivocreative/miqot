import { AlertCircle, Sparkles, Plane, Users, CalendarRange } from 'lucide-react';
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

const formatDateFull = (dateStr: string): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const getDurationDays = (paket: UmrohPackage): number => {
  if (!paket.keberangkatan?.tgl || !paket.kepulangan?.tgl) return 9;
  const dep = new Date(paket.keberangkatan.tgl);
  const ret = new Date(paket.kepulangan.tgl);
  const diff = Math.ceil((ret.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 9;
};

function formatPackageName(raw: string): { main: string; sub: string | null } {
  const titleCase = raw
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bHr\b/g, 'HR')
    .replace(/\bSv\b/g, 'SV')
    .replace(/\bVip\b/g, 'VIP');

  // Split at "Mix Paket", "Paket Rahmah/Uhud", or parenthesized suffix
  const splitMatch = titleCase.match(/^(.+?)\s*(?:Mix\s+Paket\s+(.+)|Paket\s+(Rahmah|Uhud|.+?)\s*(?:\((.+)\))?|\((.+)\))$/i);
  if (splitMatch) {
    const main = splitMatch[1].trim();
    const sub = (splitMatch[2] || splitMatch[3] || splitMatch[5] || '').trim();
    const extra = splitMatch[4] ? ` (${splitMatch[4]})` : '';
    return { main, sub: (sub + extra).trim() || null };
  }

  // Try split at last parenthesized group
  const parenMatch = titleCase.match(/^(.+?)\s*\((.+)\)$/);
  if (parenMatch) {
    return { main: parenMatch[1].trim(), sub: parenMatch[2].trim() };
  }

  return { main: titleCase, sub: null };
}

type ItemType = 'kumpul' | 'takeoff' | 'landing' | 'regular';

function classifyItem(text: string): ItemType {
  const lower = text.toLowerCase();
  if (lower.includes('berkumpul') || /kumpul\b/.test(lower)) return 'kumpul';
  if (lower.includes('tiba di bandara') || lower.includes('mendarat')) return 'landing';
  if (
    /berangkat\s+menuju/.test(lower) ||
    lower.includes('take off') ||
    /pesawat.*menuju/.test(lower) ||
    /dengan\s+(pesawat|saudi|garuda|emirates|saudia)/.test(lower)
  ) return 'takeoff';
  return 'regular';
}

/** Day header colors — cycling 4 */
const DAY_COLORS = [
  { bg: 'bg-emerald-50 dark:bg-emerald-900/20', numColor: 'text-emerald-600 dark:text-emerald-400', labelColor: 'text-emerald-800 dark:text-emerald-300', line: 'border-emerald-100 dark:border-emerald-800/40' },
  { bg: 'bg-blue-50 dark:bg-blue-900/20', numColor: 'text-blue-600 dark:text-blue-400', labelColor: 'text-blue-800 dark:text-blue-300', line: 'border-blue-100 dark:border-blue-800/40' },
  { bg: 'bg-violet-50 dark:bg-violet-900/20', numColor: 'text-violet-600 dark:text-violet-400', labelColor: 'text-violet-800 dark:text-violet-300', line: 'border-violet-100 dark:border-violet-800/40' },
  { bg: 'bg-amber-50 dark:bg-amber-900/20', numColor: 'text-amber-600 dark:text-amber-400', labelColor: 'text-amber-800 dark:text-amber-300', line: 'border-amber-100 dark:border-amber-800/40' },
];

/** Highlight style configs */
const HIGHLIGHT_STYLES: Record<Exclude<ItemType, 'regular'>, { cardBg: string; cardBgDark: string; accent: string; textColor: string; textColorDark: string; badge: string }> = {
  kumpul: {
    cardBg: '#E1F5EE',
    cardBgDark: 'rgba(16,185,129,0.1)',
    accent: '#0F6E56',
    textColor: '#085041',
    textColorDark: '#6EE7B7',
    badge: 'KUMPUL',
  },
  takeoff: {
    cardBg: '#E6F1FB',
    cardBgDark: 'rgba(37,99,235,0.1)',
    accent: '#185FA5',
    textColor: '#0C447C',
    textColorDark: '#93C5FD',
    badge: 'TAKE OFF',
  },
  landing: {
    cardBg: '#E6F1FB',
    cardBgDark: 'rgba(37,99,235,0.1)',
    accent: '#185FA5',
    textColor: '#0C447C',
    textColorDark: '#93C5FD',
    badge: 'LANDING',
  },
};

/** Extract day number from "Hari 1", "Hari 3-5", etc. */
function extractDayNum(dayNumber: string): string {
  const m = dayNumber.match(/\d[\d\-]*/);
  return m ? m[0] : dayNumber.replace(/\D/g, '') || '?';
}

/** Compute the actual date for a given day index based on departure date */
function getDayDate(paket: UmrohPackage, dayIndex: number): string {
  if (!paket.keberangkatan?.tgl) return '';
  const dep = new Date(paket.keberangkatan.tgl);
  dep.setDate(dep.getDate() + dayIndex);
  return dep.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

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
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

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
  const pkgName = formatPackageName(paket.nama);

  return (
    <div className="bg-white dark:bg-slate-900">

      {/* ── Hero Card ── */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-emerald-900 via-emerald-700 to-emerald-800 rounded-2xl p-4 text-white relative overflow-hidden mb-4">
        <div className="absolute -top-10 -right-8 w-[120px] h-[120px] rounded-full bg-white/5" />
        <div className="absolute -bottom-6 -left-6 w-[80px] h-[80px] rounded-full bg-white/[0.03]" />

        <div className="relative z-10">
          <div className="text-[15px] font-bold leading-tight">{pkgName.main}</div>
          {pkgName.sub && (
            <div className="text-[11px] text-white/50 mt-0.5">{pkgName.sub}</div>
          )}

          <div className="text-[11px] text-white/60 mt-2">
            {formatDateFull(paket.keberangkatan?.tgl)}
          </div>

          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.12] text-[10px] text-white/80">
              <CalendarRange size={10} className="opacity-60" />
              {durationDays} hari
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.12] text-[10px] text-white/80">
              <Plane size={10} className="opacity-60" />
              {paket.maskapai}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.12] text-[10px] text-white/80">
              <Users size={10} className="opacity-60" />
              {paket.seatSisa} seat
            </span>
          </div>
        </div>
      </div>

      {/* ── AI source badge ── */}
      <div className="flex items-center gap-1.5 mb-3.5 px-5">
        <Sparkles size={12} className="text-gray-300 dark:text-slate-600" />
        <span className="text-[10px] text-gray-400 dark:text-slate-500">Diekstrak dari PDF asli</span>
      </div>

      {/* ── Timeline ── */}
      <div className="px-5 pb-4 space-y-5">
        {content.days.map((day, idx) => {
          const color = DAY_COLORS[idx % DAY_COLORS.length];
          const dayNum = extractDayNum(day.dayNumber);
          const dayDate = getDayDate(paket, idx);

          return (
            <div key={idx}>
              {/* Day header */}
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`w-[42px] h-[42px] rounded-xl ${color.bg} flex flex-col items-center justify-center flex-shrink-0`}>
                  <div className={`text-[8px] font-bold ${color.labelColor} uppercase tracking-wide`}>Hari</div>
                  <div className={`text-base font-bold ${color.numColor} leading-none`}>{dayNum}</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800 dark:text-white">{day.title}</div>
                  {dayDate && <div className="text-[11px] text-gray-400 dark:text-slate-500">{dayDate}</div>}
                </div>
              </div>

              {/* Timeline items */}
              <div className={`ml-5 pl-5 border-l-[1.5px] ${color.line}`}>
                {day.activities.map((act, i) => {
                  const activity = typeof act === 'string' ? { time: '-', text: act } : act;
                  const itemType = classifyItem(activity.text);
                  const showTime = activity.time && activity.time !== '-';

                  if (itemType !== 'regular') {
                    const style = HIGHLIGHT_STYLES[itemType];
                    return (
                      <div key={i} className="relative mb-3.5">
                        {/* Dot besar */}
                        <div className="absolute -left-[27px] top-2.5 w-3 h-3 rounded-full"
                          style={{ background: style.accent, border: `2px solid ${isDark ? '#1e293b' : style.cardBg}` }} />

                        {/* Card */}
                        <div className="rounded-xl p-2.5"
                          style={{
                            background: isDark ? style.cardBgDark : style.cardBg,
                            borderLeft: `3px solid ${style.accent}`,
                          }}>
                          <div className="flex items-center gap-1.5">
                            {showTime && (
                              <span className="text-xs font-bold" style={{ color: style.accent, fontVariantNumeric: 'tabular-nums' }}>
                                {activity.time}
                              </span>
                            )}
                            <span className="text-[9px] font-bold px-1.5 py-px rounded uppercase tracking-wide text-white"
                              style={{ background: style.accent }}>
                              {style.badge}
                            </span>
                          </div>
                          <div className="text-xs mt-1 leading-relaxed"
                            style={{ color: isDark ? style.textColorDark : style.textColor }}>
                            {activity.text}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Regular item
                  return (
                    <div key={i} className="relative mb-3.5">
                      <div className="absolute -left-[25px] top-1.5 w-2 h-2 rounded-full bg-gray-200 dark:bg-slate-700" />
                      <div className="flex gap-2.5 items-start">
                        <span className="text-xs font-bold text-gray-400 dark:text-slate-500 min-w-[36px]"
                          style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {showTime ? activity.time : '-'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
                          {activity.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
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
