import { Loader2 } from 'lucide-react';
import type { SaveStatus } from './useBioConfig';

interface Props {
  saveStatus: SaveStatus;
  lastSaved: Date | null;
}

function formatRelative(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 10) return 'baru saja';
  if (sec < 60) return `${sec}s lalu`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m lalu`;
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function EditorHeader({ saveStatus, lastSaved }: Props) {
  if (saveStatus === 'saving') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
        <Loader2 size={11} className="animate-spin text-emerald-500" />
        Menyimpan…
      </div>
    );
  }
  if (saveStatus === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 dark:text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Gagal simpan
      </div>
    );
  }
  if (lastSaved) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Tersimpan · {formatRelative(lastSaved)}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Tersimpan otomatis
    </div>
  );
}
