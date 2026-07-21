import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { COMMUNITY_REACTIONS, REACTION_EMOJI, REACTION_LABEL } from '../../../lib/community-reactions.js';
import type { ReactionType } from '../../../lib/community-reactions.js';
import { AgentAvatar } from './AgentAvatar';
import { isModifiedClick, terasProfilePath } from '../../lib/terasRoutes';

export interface ReactionListEntry {
  agent: { name: string | null; slug: string | null; photo: string | null };
  reaction: ReactionType;
}

interface ReactionListSheetProps {
  load: () => Promise<{ reactions: ReactionListEntry[]; truncated: boolean }>;
  onClose: () => void;
  onOpenProfile: (slug: string) => void;
}

export function ReactionListSheet({ load, onClose, onOpenProfile }: ReactionListSheetProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [entries, setEntries] = useState<ReactionListEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [tab, setTab] = useState<ReactionType | 'all'>('all');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    load()
      .then(result => {
        if (!alive) return;
        setEntries(result.reactions);
        setTruncated(result.truncated);
        setStatus('ready');
      })
      .catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const countByReaction = useMemo(() => {
    const map = new Map<ReactionType, number>();
    for (const entry of entries) map.set(entry.reaction, (map.get(entry.reaction) || 0) + 1);
    return map;
  }, [entries]);

  const visible = tab === 'all' ? entries : entries.filter(entry => entry.reaction === tab);
  const activeTabs = COMMUNITY_REACTIONS.filter(reaction => (countByReaction.get(reaction.key as ReactionType) || 0) > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Daftar reaksi"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-bold text-gray-800 dark:text-slate-100">Reaksi</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        {status === 'ready' && entries.length > 0 && (
          <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-3 py-2 dark:border-slate-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${tab === 'all' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400'}`}
            >
              Semua {entries.length}
            </button>
            {activeTabs.map(reaction => {
              const key = reaction.key as ReactionType;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-label={REACTION_LABEL[key]}
                  className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${tab === key ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400'}`}
                >
                  <span aria-hidden="true">{reaction.emoji}</span> {countByReaction.get(key)}
                </button>
              );
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {status === 'loading' && (
            <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
          )}
          {status === 'error' && (
            <p className="px-3 py-8 text-center text-[13px] text-gray-500 dark:text-slate-400">Gagal memuat daftar reaksi.</p>
          )}
          {status === 'ready' && entries.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-gray-500 dark:text-slate-400">Belum ada reaksi.</p>
          )}
          {status === 'ready' && visible.map((entry, index) => {
            const name = entry.agent.name || 'Agent';
            const slug = entry.agent.slug;
            return (
              <div key={`${slug ?? 'x'}-${index}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                {slug ? (
                  <a
                    href={terasProfilePath(slug)}
                    onClick={event => { if (isModifiedClick(event)) return; event.preventDefault(); onOpenProfile(slug); }}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <AgentAvatar name={name} photo={entry.agent.photo} size="comment" />
                    <span className="min-w-0 truncate text-[13px] font-semibold text-gray-800 hover:underline dark:text-slate-200">{name}</span>
                  </a>
                ) : (
                  <div className="flex min-w-0 items-center gap-3">
                    <AgentAvatar name={name} photo={entry.agent.photo} size="comment" />
                    <span className="min-w-0 truncate text-[13px] font-semibold text-gray-800 dark:text-slate-200">{name}</span>
                  </div>
                )}
                <span className="ml-auto text-lg leading-none" aria-label={REACTION_LABEL[entry.reaction]}>{REACTION_EMOJI[entry.reaction]}</span>
              </div>
            );
          })}
          {status === 'ready' && truncated && (
            <p className="px-3 py-3 text-center text-[11px] text-gray-400 dark:text-slate-500">Menampilkan 200 reaksi pertama.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
