import { useRef, useState } from 'react';
import { useAgentContext } from '../hooks/useAgentContext';
import { AGENT_TOKENS, PACKAGE_TOKENS, TOKEN_LABELS, usesPackageToken } from '../lib/placeholders';
import type { CaptionCategory, CaptionEntry, CategoryMeta, MediaAttachment } from '../lib/types';
import PreviewText from '../tabs/caption/PreviewText';
import Toggle from './Toggle';
import MediaUploadField from './MediaUploadField';

export interface CaptionDraft {
  category: CaptionCategory;
  packageAware: boolean;
  template: string;
  active: boolean;
  media?: MediaAttachment[];
}

interface CaptionEditorProps {
  categories: CategoryMeta[];
  initial?: CaptionEntry;
  onSave: (draft: CaptionDraft) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400';
const LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 mb-1.5';

export default function CaptionEditor({ categories, initial, onSave, onCancel }: CaptionEditorProps) {
  const agentCtx = useAgentContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [category, setCategory] = useState<CaptionCategory>(initial?.category ?? categories[0]?.value ?? '');
  const [template, setTemplate] = useState(initial?.template ?? '');
  const [packageAware, setPackageAware] = useState(initial?.packageAware ?? usesPackageToken(initial?.template ?? ''));
  const [active, setActive] = useState(initial?.active ?? true);
  const [media, setMedia] = useState<MediaAttachment | null>(initial?.media?.[0] ?? null);

  const insertToken = (token: string) => {
    const tokenStr = `{${token}}`;
    const el = textareaRef.current;
    if (!el) {
      setTemplate(t => t + tokenStr);
      return;
    }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    const next = template.slice(0, start) + tokenStr + template.slice(end);
    setTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + tokenStr.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const canSave = template.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ category, packageAware, template: template.trim(), active, media: media ? [media] : [] });
  };

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div>
        <label className={LABEL_CLASS}>Kategori</label>
        <select value={category} onChange={e => setCategory(e.target.value as CaptionCategory)} className={INPUT_CLASS}>
          {categories.map(c => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">Pakai Paket</span>
        <Toggle checked={packageAware} onChange={setPackageAware} aria-label="Pakai paket" />
      </div>

      <div>
        <label className={LABEL_CLASS}>Sisipkan Placeholder</label>
        <div className="flex flex-wrap gap-1.5">
          {AGENT_TOKENS.map(token => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30 transition-colors active:scale-95"
            >
              {TOKEN_LABELS[token]}
            </button>
          ))}
          {PACKAGE_TOKENS.map(token => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30 transition-colors active:scale-95"
            >
              {TOKEN_LABELS[token]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>Template</label>
        <textarea
          ref={textareaRef}
          value={template}
          onChange={e => setTemplate(e.target.value)}
          rows={7}
          placeholder="Tulis caption… gunakan tombol placeholder di atas."
          className={`${INPUT_CLASS} resize-y leading-6`}
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>Pratinjau</label>
        <div className="px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
          {template.trim() ? (
            <PreviewText template={template} ctx={{ agent: agentCtx, pkg: null }} />
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
