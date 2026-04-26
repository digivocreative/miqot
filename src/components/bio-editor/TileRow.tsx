import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Eye, EyeOff, ChevronRight,
  Package, Star, MessageCircle, Sparkles, Link2, Type, Image as ImageIcon, Quote, AlertTriangle,
} from 'lucide-react';
import type { BioTile } from '../bio/types';
import { validateBioTile } from './bioEditorValidation';

interface Props {
  tile: BioTile;
  onTap: () => void;
  onToggleVisible: () => void;
  agentPhone?: string;
}

const TYPE_META: Record<BioTile['type'], { icon: any; label: string; badge: string; badgeClass: string }> = {
  umroh:    { icon: Package,        label: 'Jadwal Umroh',   badge: 'SISTEM',   badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  haji:     { icon: Star,           label: 'Haji',           badge: 'SISTEM',   badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  wa:       { icon: MessageCircle,  label: 'WhatsApp',       badge: 'SISTEM',   badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  featured: { icon: Sparkles,       label: 'Featured Paket', badge: 'FEATURED', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  link:     { icon: Link2,          label: 'Custom Link',    badge: 'LINK',     badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  text:     { icon: Type,           label: 'Teks',           badge: 'TEKS',     badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  photo:    { icon: ImageIcon,      label: 'Foto',           badge: 'FOTO',     badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
  testi:    { icon: Quote,          label: 'Testimoni',      badge: 'TESTI',    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
};

function formatIdPhone(raw?: string): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  // Normalize "62…" → "0…" so it reads as a familiar local number
  let local = digits;
  if (local.startsWith('62')) local = '0' + local.slice(2);
  // Group: 0852-1120-9049
  if (local.length >= 10) {
    return `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}`;
  }
  return local;
}

function tileSubtitle(tile: BioTile, agentPhone?: string): string {
  const c = tile.config as Record<string, any>;
  switch (tile.type) {
    case 'umroh': return typeof c.cta === 'string' && c.cta ? c.cta : 'Jadwal Umroh Alhijaz';
    case 'haji':  return typeof c.cta === 'string' && c.cta ? c.cta : 'Haji Plus Alhijaz';
    case 'wa': {
      // Prefer the formatted phone — confirms the agent's WA number at a glance
      const formatted = formatIdPhone(agentPhone);
      if (formatted) return `→ ${formatted}`;
      return typeof c.title === 'string' && c.title ? c.title : 'Belum ada nomor HP';
    }
    case 'featured': return typeof c.badge === 'string' && c.badge ? c.badge : 'Paket pilihan';
    case 'link':  return typeof c.title === 'string' ? c.title : 'Belum diisi';
    case 'text':  return typeof c.content === 'string' ? c.content.slice(0, 60) : 'Belum diisi';
    case 'photo': return typeof c.caption === 'string' && c.caption ? c.caption : 'Foto dokumentasi';
    case 'testi': return typeof c.author_name === 'string' && c.author_name ? `— ${c.author_name}` : 'Belum diisi';
  }
}

export default function TileRow({ tile, onTap, onToggleVisible, agentPhone }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.id });
  const meta = TYPE_META[tile.type];
  const Icon = meta.icon;
  const validation = validateBioTile(tile, agentPhone);
  const status = !validation.complete
    ? { label: 'PERLU DILENGKAPI', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' }
    : tile.visible
    ? { label: 'SIAP', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }
    : { label: 'TERSEMBUNYI', className: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300' };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-slate-800 rounded-2xl border shadow-sm transition-shadow ${
        isDragging
          ? 'border-emerald-300 dark:border-emerald-700 shadow-lg ring-2 ring-emerald-500/20'
          : 'border-gray-100 dark:border-slate-700'
      } ${!tile.visible ? 'opacity-55' : ''}`}
    >
      <div className="flex items-center">
        <button
          type="button"
          className="px-2 py-4 cursor-grab active:cursor-grabbing touch-none text-gray-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-l-2xl transition-colors"
          {...attributes}
          {...listeners}
          aria-label="Geser untuk mengubah urutan"
          title="Tahan & geser untuk mengubah urutan"
        >
          <GripVertical size={18} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={onTap}
          className="flex-1 flex items-center gap-3 py-3 pr-2 min-w-0 text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
            <Icon size={16} className="text-gray-700 dark:text-slate-300" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{meta.label}</p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${meta.badgeClass}`}>
                {meta.badge}
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${status.className}`}>
                {status.label}
              </span>
              {tile.orphaned && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded">
                  <AlertTriangle size={9} /> ORPHAN
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate mt-0.5">
              {validation.complete ? tileSubtitle(tile, agentPhone) : validation.issues[0]}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggleVisible}
          className="px-2 py-4 text-gray-400 dark:text-slate-500 hover:text-emerald-500 transition-colors"
          aria-label={tile.visible ? 'Sembunyikan tile' : 'Tampilkan tile'}
          title={tile.visible ? 'Sembunyikan' : 'Tampilkan'}
        >
          {tile.visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button
          type="button"
          onClick={onTap}
          className="pr-3 pl-1 py-4 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
          aria-label="Edit tile"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
