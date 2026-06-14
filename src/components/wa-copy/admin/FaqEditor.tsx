import { useRef, useState } from 'react';
import type { AgentFaqEntry, CategoryMeta, FaqCategory, MediaAttachment } from '../lib/types';
import WaMarkupText from '../WaMarkupText';
import Toggle from './Toggle';
import MediaUploadField from './MediaUploadField';
import FormatToolbar from './FormatToolbar';
import FilterDropdown from '../../FilterDropdown';

export interface FaqDraft {
  category: FaqCategory;
  question: string;
  answer: string;
  active: boolean;
  media?: MediaAttachment[];
}

interface FaqEditorProps {
  categories: CategoryMeta[];
  initial?: AgentFaqEntry;
  onSave: (draft: FaqDraft) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400';
const LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 mb-1.5';

export default function FaqEditor({ categories, initial, onSave, onCancel }: FaqEditorProps) {
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const [category, setCategory] = useState<FaqCategory>(initial?.category ?? categories[0]?.value ?? '');
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [media, setMedia] = useState<MediaAttachment | null>(initial?.media?.[0] ?? null);

  const canSave = question.trim().length > 0 && answer.trim().length > 0;
  const handleSave = () => {
    if (!canSave) return;
    onSave({ category, question: question.trim(), answer: answer.trim(), active, media: media ? [media] : [] });
  };

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div>
        <label className={LABEL_CLASS}>Kategori</label>
        <FilterDropdown
          variant="default"
          value={category}
          onChange={v => setCategory(v as FaqCategory)}
          options={categories.map(c => ({ value: c.value, label: c.label }))}
          ariaLabel="Kategori"
          widthClass="w-full"
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>Pertanyaan</label>
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Mis. Bagaimana cara pembayaran?"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <div className="flex items-end justify-between gap-2 mb-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">Jawaban</label>
          <FormatToolbar textareaRef={answerRef} value={answer} onChange={setAnswer} />
        </div>
        <textarea
          ref={answerRef}
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          rows={6}
          placeholder="Tulis jawaban yang jelas dan ramah…"
          className={`${INPUT_CLASS} resize-y leading-6`}
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>Pratinjau</label>
        <div className="px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
          {answer.trim() ? (
            <WaMarkupText text={answer} className="text-sm leading-6 text-gray-700 dark:text-slate-300" />
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
