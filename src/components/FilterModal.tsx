'use client';

import { X, TicketPercent, Siren, Banknote, HeartHandshake } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================
// Types
// ============================================

export type QuickFilterType = 
  | 'promo' 
  | 'urgent' 
  | 'termurah' 
  | 'rahmah';

// ============================================
// Time Filter Types
// ============================================

export type TimeRange = '00-06' | '06-12' | '12-18' | '18-24';

interface TimeRangeOption {
  value: TimeRange;
  label: string;
}

const TIME_RANGES: TimeRangeOption[] = [
  { value: '00-06', label: '00:00 - 06:00' },
  { value: '06-12', label: '06:00 - 12:00' },
  { value: '12-18', label: '12:00 - 18:00' },
  { value: '18-24', label: '18:00 - 24:00' },
];

export interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFilter: QuickFilterType | null;
  onSelectFilter: (filter: QuickFilterType | null) => void;
  // New Time Filters
  departureRanges: TimeRange[];
  onDepartureRangeChange: (ranges: TimeRange[]) => void;
  returnRanges: TimeRange[];
  onReturnRangeChange: (ranges: TimeRange[]) => void;
}

// ============================================
// Filter Configuration (Reused)
// ============================================

const QUICK_FILTERS: Array<{
  id: QuickFilterType;
  label: string;
  description: string;
  icon: React.ReactNode;
  colorClass: string;
}> = [
  { 
    id: 'promo', 
    label: 'Promo Spesial', 
    description: 'Paket harga promo terbatas',
    icon: <TicketPercent size={20} />,
    colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-200'
  },
  { 
    id: 'urgent', 
    label: 'Urgent / Terdekat', 
    description: 'Seat sisa sedikit / dalam waktu dekat',
    icon: <Siren size={20} />,
    colorClass: 'text-rose-600 bg-rose-50 border-rose-200'
  },
  { 
    id: 'termurah', 
    label: 'Harga Termurah', 
    description: 'Urutkan dari harga termurah',
    icon: <Banknote size={20} />,
    colorClass: 'text-blue-600 bg-blue-50 border-blue-200'
  },
  { 
    id: 'rahmah', 
    label: 'Paket Rahmah', 
    description: 'Kategori paket Bintang 5',
    icon: <HeartHandshake size={20} />,
    colorClass: 'text-purple-600 bg-purple-50 border-purple-200'
  },
];

// ============================================
// Component
// ============================================

export function FilterModal({ 
  isOpen, 
  onClose, 
  selectedFilter, 
  onSelectFilter,
  departureRanges,
  onDepartureRangeChange,
  returnRanges,
  onReturnRangeChange
}: FilterModalProps) {
  
  const handleSelectQuickFilter = (id: QuickFilterType) => {
    if (selectedFilter === id) {
      onSelectFilter(null); // Toggle off
    } else {
      onSelectFilter(id);
    }
  };

  const toggleRange = (range: TimeRange, currentRanges: TimeRange[], setter: (ranges: TimeRange[]) => void) => {
    if (currentRanges.includes(range)) {
      setter(currentRanges.filter(r => r !== range));
    } else {
      setter([...currentRanges, range]);
    }
  };

  // Helper to check if any filter is active
  const isAnyFilterActive = selectedFilter || departureRanges.length > 0 || returnRanges.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />

          {/* Sheet Content */}
          <motion.div 
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 rounded-t-2xl z-[61] shadow-2xl flex flex-col max-h-[90vh]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 500 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) {
                onClose();
              }
            }}
          >
            {/* Header Fixed */}
            <div className="p-5 pb-2 shrink-0">
               {/* Drag Handle (Mobile UX) */}
               <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-600 rounded-full mx-auto mb-4" />

              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Filter Cepat</h3>
                <button
                  onClick={onClose}
                  className="p-2 bg-gray-100 dark:bg-slate-700 rounded-full text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto px-5 py-2 space-y-6">

              {/* Section 1: Departure Time */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Waktu Keberangkatan</h4>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_RANGES.map((range) => {
                    const isActive = departureRanges.includes(range.value);
                    return (
                      <button
                        key={range.value}
                        onClick={() => toggleRange(range.value, departureRanges, onDepartureRangeChange)}
                        className={`
                          px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors text-center
                          ${isActive
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                            : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
                          }
                        `}
                      >
                        {range.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Section 3: Return Time */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Waktu Kepulangan</h4>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_RANGES.map((range) => {
                    const isActive = returnRanges.includes(range.value);
                    return (
                      <button
                        key={range.value}
                        onClick={() => toggleRange(range.value, returnRanges, onReturnRangeChange)}
                        className={`
                          px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors text-center
                          ${isActive
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                            : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
                          }
                        `}
                      >
                        {range.label}
                      </button>
                    )
                  })}
                </div>
              </div>

            </div>

            {/* Footer Actions */}
            <div className="p-5 border-t border-gray-100 dark:border-slate-700 mt-auto bg-white dark:bg-slate-800 pb-8">
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30"
                >
                  Terapkan Filter
                </button>
                {isAnyFilterActive && (
                  <button
                    onClick={() => {
                      onSelectFilter(null);
                      onDepartureRangeChange([]);
                      onReturnRangeChange([]);
                    }}
                    className="px-4 py-3 text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default FilterModal;
