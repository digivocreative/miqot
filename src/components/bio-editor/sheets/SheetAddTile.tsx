import { Package, Star, MessageCircle, Sparkles, Link2, Type, Image as ImageIcon, Quote } from 'lucide-react';
import SheetBase from './SheetBase';
import type { BioTileType } from '../../bio/types';

interface Props {
  open: boolean;
  onClose: () => void;
  usedSingletonTypes: Set<BioTileType>;
  onAdd: (type: BioTileType) => void;
}

const SYSTEM_OPTIONS: { type: BioTileType; label: string; desc: string; icon: any }[] = [
  { type: 'umroh',    label: 'Jadwal Umroh',   desc: 'Link ke halaman umroh',     icon: Package },
  { type: 'haji',     label: 'Haji Plus',      desc: 'Link ke halaman haji',      icon: Star },
  { type: 'wa',       label: 'WhatsApp',       desc: 'Tombol chat langsung',      icon: MessageCircle },
  { type: 'featured', label: 'Featured Paket', desc: 'Paket pilihan dengan CTA',  icon: Sparkles },
];

const CUSTOM_OPTIONS: { type: BioTileType; label: string; desc: string; icon: any }[] = [
  { type: 'link',  label: 'Custom Link', desc: 'URL eksternal apapun',     icon: Link2 },
  { type: 'text',  label: 'Teks',        desc: 'Kutipan atau pengumuman',  icon: Type },
  { type: 'photo', label: 'Foto',        desc: 'Dokumentasi jamaah',       icon: ImageIcon },
  { type: 'testi', label: 'Testimoni',   desc: 'Quote dari jamaah',        icon: Quote },
];

export default function SheetAddTile({ open, onClose, usedSingletonTypes, onAdd }: Props) {
  return (
    <SheetBase open={open} onClose={onClose} title="Tambah Tile">
      <section>
        <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Integrasi Miqot
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SYSTEM_OPTIONS.map(opt => {
            const used = usedSingletonTypes.has(opt.type);
            const Icon = opt.icon;
            return (
              <button
                key={opt.type}
                type="button"
                disabled={used}
                onClick={() => { if (!used) onAdd(opt.type); }}
                className={`relative text-left rounded-xl border p-3 transition-all active:scale-[0.98] ${
                  used
                    ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 opacity-55 cursor-not-allowed'
                    : 'border-emerald-200/70 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                }`}
              >
                {used && (
                  <span className="absolute top-2 right-2 text-[9px] font-bold bg-gray-300 dark:bg-slate-600 text-gray-700 dark:text-slate-200 px-1.5 py-0.5 rounded">
                    DIPAKAI
                  </span>
                )}
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-2">
                  <Icon size={16} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">{opt.label}</p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 leading-tight">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5">
        <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Konten Kustom
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CUSTOM_OPTIONS.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => onAdd(opt.type)}
                className="text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/60 p-3 transition-all active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-2">
                  <Icon size={16} className="text-gray-700 dark:text-slate-300" strokeWidth={2.2} />
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">{opt.label}</p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 leading-tight">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </section>
    </SheetBase>
  );
}
