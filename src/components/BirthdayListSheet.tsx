import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { Birthday } from './BirthdayWidget';

interface Props {
  birthdays: Birthday[];
  onClose: () => void;
  onSelectJamaah: (b: Birthday) => void;
}

const DAY_LABELS = ['Hari Ini', 'Besok', 'Lusa', '3 Hari Lagi'];

function formatIndoDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${d} ${months[m - 1]}`;
}

function formatBerangkat(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BirthdayListSheet({ birthdays, onClose, onSelectJamaah }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const grouped = [0, 1, 2, 3]
    .map(offset => ({
      offset: offset as 0 | 1 | 2 | 3,
      items: birthdays.filter(b => b.day_offset === offset),
    }))
    .filter(g => g.items.length > 0);

  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 max-h-[85vh] overflow-y-auto shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 z-10 flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        <div className="flex items-center gap-3 px-4 pt-2 pb-3 border-b border-gray-100 dark:border-slate-700/50">
          <div className="w-9 h-9 rounded-lg bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🎂</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-gray-900 dark:text-white">
              Ulang Tahun Minggu Ini
            </div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
              {birthdays.length} jamaah
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>

        <div className="pb-4">
          {grouped.map(({ offset, items }) => {
            const dateLabel = formatIndoDate(items[0].birthday_date);
            return (
              <div key={offset}>
                <div className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                  {DAY_LABELS[offset]} · {dateLabel}
                </div>
                {items.map(b => (
                  <BirthdayListRow
                    key={`${b.id_umroh}-${b.tgl_lahir}`}
                    jamaah={b}
                    onClick={() => onSelectJamaah(b)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </motion.div>
    </>,
    document.body,
  );
}

function BirthdayListRow({ jamaah, onClick }: { jamaah: Birthday; onClick: () => void }) {
  const initials = jamaah.nama.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  const isFemale = jamaah.jk === 'P';
  const isToday = jamaah.day_offset === 0;

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 flex items-center gap-3 border-t border-gray-50 dark:border-slate-700/50 active:bg-gray-50 dark:active:bg-slate-700/40 transition-colors text-left"
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
        isFemale
          ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      }`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-gray-800 dark:text-white truncate">
          {jamaah.nama}
        </div>
        <div className="text-[10px] text-gray-400 dark:text-slate-500 truncate">
          Keberangkatan: {jamaah.tgl_berangkat ? formatBerangkat(jamaah.tgl_berangkat) : '-'}
        </div>
      </div>
      <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${
        isToday
          ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
      }`}>
        {jamaah.age} thn
      </div>
    </button>
  );
}
