import { useEffect, useState } from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import type { SaveStatus } from './useBioConfig';

interface Props {
  saveStatus: SaveStatus;
}

/**
 * Ephemeral save indicator — only appears while saving / just-saved / on error.
 * When idle, it's hidden completely so the editor stays visually clean.
 *
 * Sits above the sticky BottomBar so the user notices it without it competing
 * with the URL card or page chrome.
 */
export default function SaveToast({ saveStatus }: Props) {
  // We hold onto the *visible* status separately so we can fade out smoothly:
  // when saveStatus flips back to 'idle', we keep showing the previous chip
  // for one render cycle, then transition to opacity-0.
  const [renderStatus, setRenderStatus] = useState<SaveStatus>(saveStatus);
  const [visible, setVisible] = useState<boolean>(saveStatus !== 'idle');

  useEffect(() => {
    if (saveStatus === 'idle') {
      setVisible(false);
      // After fade-out completes, drop the underlying status so the chip
      // unmounts and doesn't keep its DOM node around.
      const t = setTimeout(() => setRenderStatus('idle'), 200);
      return () => clearTimeout(t);
    }
    setRenderStatus(saveStatus);
    setVisible(true);
  }, [saveStatus]);

  if (renderStatus === 'idle') return null;

  let icon: React.ReactNode;
  let label: string;
  let pillClass: string;

  switch (renderStatus) {
    case 'saving':
      icon = <Loader2 size={12} className="animate-spin" strokeWidth={2.4} />;
      label = 'Menyimpan…';
      pillClass = 'bg-gray-800/90 text-white dark:bg-slate-700';
      break;
    case 'saved':
      icon = <Check size={12} strokeWidth={3} />;
      label = 'Tersimpan';
      pillClass = 'bg-emerald-500 text-white shadow-emerald-500/30';
      break;
    case 'error':
      icon = <AlertCircle size={12} strokeWidth={2.4} />;
      label = 'Gagal simpan — coba lagi';
      pillClass = 'bg-red-500 text-white shadow-red-500/30';
      break;
    default:
      return null;
  }

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-30 flex justify-center"
      // ~80px above the bottom bar so it doesn't crash into the action buttons
      style={{ bottom: '5.5rem', transform: 'translateX(-50%)' }}
    >
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold shadow-lg backdrop-blur-sm transition-all duration-200 ease-out ${pillClass} ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
        }`}
      >
        {icon}
        <span>{label}</span>
      </div>
    </div>
  );
}
