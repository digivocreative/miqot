import { useEffect, useState, lazy, Suspense } from 'react';
import { Gift } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

const BirthdayListSheet = lazy(() => import('./BirthdayListSheet'));

const DAY_LABELS = ['Hari Ini', 'Besok', 'Lusa', '3 Hari Lagi'];

export interface Birthday {
  id_umroh: string;
  nama: string;
  jk: 'L' | 'P';
  salutation: 'Ibu' | 'Bapak';
  wa: string;
  paket: string;
  tgl_lahir: string;
  birthday_date: string;
  age: number;
  day_offset: 0 | 1 | 2 | 3;
  status_bayar: 'lunas' | 'dp' | 'belum_bayar';
  tgl_berangkat: string | null;
}

interface BirthdayWidgetProps {
  onSelectJamaah?: (jamaah: Birthday) => void;
}

export default function BirthdayWidget({ onSelectJamaah }: BirthdayWidgetProps) {
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [showListSheet, setShowListSheet] = useState(false);

  useEffect(() => {
    fetch('/api/jamaah/birthdays', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.success) setBirthdays(data.birthdays);
      })
      .catch(() => { /* silent fail */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (birthdays.length === 0) return null;

  const today = birthdays.filter(b => b.day_offset === 0);

  const nearest = birthdays[0];

  const nearestDayCount = birthdays.filter(b => b.day_offset === nearest.day_offset).length;
  const otherCount = birthdays.length - nearestDayCount;
  const subtitle = otherCount > 0
    ? `${nearestDayCount} jamaah · ${otherCount} lainnya minggu ini`
    : `${nearestDayCount} jamaah ulang tahun`;

  const visibleEntries = today.length > 0
    ? today
    : birthdays.filter(b => b.day_offset === nearest.day_offset);
  const hiddenEntries = birthdays.filter(b => !visibleEntries.includes(b));

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Header — soft tint + pulse + day pill */}
        <div
          className="relative px-4 py-3.5 overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(244,114,182,0.08) 0%, transparent 100%)',
          }}
        >
          {/* Decorative right-corner glow */}
          <div
            className="absolute -top-6 -right-6 w-32 h-32 pointer-events-none"
            aria-hidden="true"
            style={{
              background: 'radial-gradient(circle, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0) 70%)',
            }}
          />

          {/* Confetti & sparkles SVG (concentrated on right) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 380 64"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Left side — sparse */}
            <circle cx="100" cy="52" r="1.5" fill="#fbbf24" opacity="0.55" />
            <path d="M120 14 L122 17 M121 13 L121 18" stroke="#a78bfa" strokeWidth="1" opacity="0.45" strokeLinecap="round" />

            {/* Right half — heboh */}
            <circle cx="220" cy="12" r="2.5" fill="#f472b6" opacity="0.7" />
            <circle cx="245" cy="44" r="2" fill="#fbbf24" opacity="0.65" />
            <circle cx="270" cy="22" r="1.8" fill="#a78bfa" opacity="0.7" />
            <circle cx="295" cy="52" r="2.5" fill="#f472b6" opacity="0.6" />
            <circle cx="318" cy="14" r="2" fill="#fbbf24" opacity="0.6" />
            <circle cx="340" cy="38" r="2.2" fill="#f472b6" opacity="0.65" />
            <circle cx="362" cy="22" r="1.8" fill="#a78bfa" opacity="0.6" />
            <circle cx="368" cy="52" r="1.5" fill="#fbbf24" opacity="0.55" />

            {/* Sparkle plus marks */}
            <path d="M250 16 L254 20 M252 14 L252 22" stroke="#f472b6" strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />
            <path d="M325 48 L329 52 M327 46 L327 54" stroke="#a78bfa" strokeWidth="1.2" opacity="0.65" strokeLinecap="round" />
            <path d="M285 8 L288 11 M286.5 6.5 L286.5 12.5" stroke="#fbbf24" strokeWidth="1" opacity="0.6" strokeLinecap="round" />
            <path d="M355 8 L357 10 M356 7 L356 11" stroke="#f472b6" strokeWidth="1" opacity="0.55" strokeLinecap="round" />

            {/* Ribbon streamers */}
            <path d="M205 30 Q215 24 220 32 T 232 36" stroke="#f472b6" strokeWidth="1.4" fill="none" opacity="0.45" strokeLinecap="round" />
            <path d="M300 32 Q312 28 315 38 T 326 28" stroke="#a78bfa" strokeWidth="1.4" fill="none" opacity="0.45" strokeLinecap="round" />
          </svg>

          <div className="relative z-10 flex items-center gap-3">
            {/* Icon dengan gradient + pulse ring */}
            <div className="relative flex-shrink-0">
              <span
                className="absolute -inset-1 rounded-2xl border-2 border-pink-400 dark:border-pink-400 pointer-events-none"
                style={{ animation: 'birthdayPulse 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}
                aria-hidden="true"
              />
              <div
                className="relative w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #f472b6 0%, #be185d 100%)',
                  boxShadow: '0 4px 12px -2px rgba(244,114,182,0.35), 0 0 0 3px rgba(244,114,182,0.12)',
                }}
              >
                <Gift className="w-[18px] h-[18px] text-white" strokeWidth={2.2} />
              </div>
            </div>

            {/* Title + day pill + subtitle */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[13px] font-bold text-gray-800 dark:text-white">
                  Ulang Tahun
                </span>
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                    nearest.day_offset === 0
                      ? 'bg-pink-200 text-pink-800 dark:bg-pink-500/30 dark:text-pink-200'
                      : 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300'
                  }`}
                >
                  {DAY_LABELS[nearest.day_offset]}
                </span>
              </div>
              <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                {subtitle}
              </div>
            </div>
          </div>
        </div>

        {visibleEntries.map((b) => (
          <BirthdayRow
            key={b.id_umroh}
            jamaah={b}
            highlighted
            onClick={() => onSelectJamaah?.(b)}
          />
        ))}

        {hiddenEntries.length > 0 && (
          <button
            onClick={() => setShowListSheet(true)}
            className="w-full py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-center gap-1"
          >
            Lihat {hiddenEntries.length} lagi minggu ini
          </button>
        )}
      </div>

      {showListSheet && (
        <Suspense fallback={null}>
          <BirthdayListSheet
            birthdays={hiddenEntries}
            onClose={() => setShowListSheet(false)}
            onSelectJamaah={(b) => {
              // Keep list sheet open underneath — detail sheet stacks on top.
              // When detail closes, user returns to the list naturally.
              onSelectJamaah?.(b);
            }}
          />
        </Suspense>
      )}
    </>
  );
}

function formatBerangkat(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function BirthdayRow({ jamaah, highlighted, onClick }: {
  jamaah: Birthday;
  highlighted: boolean;
  onClick: () => void;
}) {
  const initials = jamaah.nama.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  const isFemale = jamaah.jk === 'P';

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 flex items-center gap-3 border-t border-gray-50 dark:border-slate-700/50 active:bg-gray-50 dark:active:bg-slate-700/40 transition-colors text-left"
    >
      <div className={`relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
        isFemale
          ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      }`}>
        {initials}
        {highlighted && jamaah.day_offset === 0 && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-pink-500 border-2 border-white dark:border-slate-800 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-2 h-2" fill="white">
              <path d="M12 2L13 5L11 5Z" />
            </svg>
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-gray-800 dark:text-white truncate">{jamaah.nama}</div>
        <div className="text-[10px] text-gray-400 dark:text-slate-500 truncate">
          Keberangkatan: {jamaah.tgl_berangkat ? formatBerangkat(jamaah.tgl_berangkat) : '-'}
        </div>
      </div>

      <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${
        highlighted
          ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
      }`}>
        {jamaah.age} thn
      </div>
    </button>
  );
}
