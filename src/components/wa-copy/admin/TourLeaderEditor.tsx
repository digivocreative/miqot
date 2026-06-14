import { useRef, useState } from 'react';
import type { CategoryMeta, TourPhase, TourStep, MediaAttachment } from '../lib/types';
import WaMarkupText from '../WaMarkupText';
import Toggle from './Toggle';
import MediaUploadField from './MediaUploadField';
import FormatToolbar from './FormatToolbar';
import FilterDropdown from '../../FilterDropdown';

export interface TourDraft {
  phase: TourPhase;
  title: string;
  body: string;
  active: boolean;
  media?: MediaAttachment[];
}

interface TourLeaderEditorProps {
  categories: CategoryMeta[];
  initial?: TourStep;
  onSave: (draft: TourDraft) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400';
const LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 mb-1.5';

export default function TourLeaderEditor({ categories, initial, onSave, onCancel }: TourLeaderEditorProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [phase, setPhase] = useState<TourPhase>(initial?.phase ?? categories[0]?.value ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [media, setMedia] = useState<MediaAttachment | null>(initial?.media?.[0] ?? null);

  const canSave = title.trim().length > 0 && body.trim().length > 0;
  const handleSave = () => {
    if (!canSave) return;
    onSave({ phase, title: title.trim(), body: body.trim(), active, media: media ? [media] : [] });
  };

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div>
        <label className={LABEL_CLASS}>Fase</label>
        <FilterDropdown
          variant="default"
          value={phase}
          onChange={v => setPhase(v as TourPhase)}
          options={categories.map(c => ({ value: c.value, label: c.label }))}
          ariaLabel="Fase"
          widthClass="w-full"
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>Judul Langkah</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Mis. Briefing & Perkenalan"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <div className="flex items-end justify-between gap-2 mb-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">Narasi</label>
          <FormatToolbar textareaRef={bodyRef} value={body} onChange={setBody} />
        </div>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={6}
          placeholder="Tulis panduan dalam bentuk paragraf naratif…"
          className={`${INPUT_CLASS} resize-y leading-6`}
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>Pratinjau</label>
        <div className="px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
          {body.trim() ? (
            <WaMarkupText text={body} className="text-sm leading-6 text-gray-700 dark:text-slate-300" />
          ) : (
            <p className="text-xs text-gray-400 dark:text-slate-500">Pratinjau muncul di sini.</p>
          )}
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>Media (Opsional)</label>
        <MediaUploadField value={media} onChange={setMedia} />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">Aktif</span>
        <Toggle checked={active} onChange={setActive} aria-label="Aktif" />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 active:scale-95 transition-all"
        >
          Batal
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
        >
          Simpan
        </button>
      </div>
    </div>
  );
}
