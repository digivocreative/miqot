import { useState } from 'react';
import { FAQ_CATEGORIES } from '../lib/faq';
import type { AgentFaqEntry, FaqCategory } from '../lib/types';
import Toggle from './Toggle';

export interface FaqDraft {
  category: FaqCategory;
  question: string;
  answer: string;
  active: boolean;
}

interface FaqEditorProps {
  initial?: AgentFaqEntry;
  onSave: (draft: FaqDraft) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400';
const LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 mb-1.5';

export default function FaqEditor({ initial, onSave, onCancel }: FaqEditorProps) {
  const [category, setCategory] = useState<FaqCategory>(initial?.category ?? FAQ_CATEGORIES[0].value);
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  const canSave = question.trim().length > 0 && answer.trim().length > 0;
  const handleSave = () => {
    if (!canSave) return;
    onSave({ category, question: question.trim(), answer: answer.trim(), active });
  };

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div>
        <label className={LABEL_CLASS}>Kategori</label>
        <select value={category} onChange={e => setCategory(e.target.value as FaqCategory)} className={INPUT_CLASS}>
          {FAQ_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
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
        <label className={LABEL_CLASS}>Jawaban</label>
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          rows={6}
          placeholder="Tulis jawaban yang jelas dan ramah…"
          className={`${INPUT_CLASS} resize-y leading-6`}
        />
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
