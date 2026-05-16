import { useState } from 'react';
import { Send } from 'lucide-react';
import MagicLinkModal from './MagicLinkModal';

interface Props {
  jamaahId: number;
  jamaahName: string;
  jamaahWa: string | null;
  idUmroh: string;
  agentSlug: string;
  agentName: string;
  className?: string;
  iconClassName?: string;
  label?: string;
}

export default function MagicLinkButton(props: Props) {
  const [open, setOpen] = useState(false);

  if (!props.agentSlug) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={props.className || 'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all active:scale-95'}
        title="Kirim Akses Portal"
      >
        <Send className={props.iconClassName || 'w-3.5 h-3.5'} strokeWidth={2.2} />
        <span className="whitespace-nowrap">{props.label || 'Magic Link'}</span>
      </button>
      {open && (
        <MagicLinkModal
          {...props}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
