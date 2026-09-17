import { createContext, useContext } from 'react';
import { CloudOff, Loader2 } from 'lucide-react';

export interface PortalSyncState {
  /** Waktu (ms) data yang sedang tampil diterima dari server; 0/null = tidak diketahui. */
  updatedAt: number | null;
  refreshing: boolean;
  onRetry: () => void;
}

/**
 * Diisi PortalDashboard hanya saat data yang tampil gagal diperbarui. Bar atas portal
 * membacanya supaya catatan kecil ini ikut menempel di header setiap halaman, tanpa
 * mengganti isi halaman dengan layar galat.
 */
export const PortalSyncContext = createContext<PortalSyncState | null>(null);

const TIME_FORMAT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export default function PortalSyncNotice() {
  const sync = useContext(PortalSyncContext);
  if (!sync) return null;

  const when = sync.updatedAt ? TIME_FORMAT.format(new Date(sync.updatedAt)) : null;

  return (
    <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-4 pb-2.5" data-portal-sync-notice>
      <p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-[11px] font-medium leading-4 text-amber-800">
        <CloudOff className="h-3.5 w-3.5 flex-none" strokeWidth={2.2} aria-hidden="true" />
        <span className="min-w-0">
          {when ? `Data per ${when} — belum bisa diperbarui.` : 'Data belum bisa diperbarui.'}
        </span>
      </p>
      <button
        type="button"
        onClick={sync.onRetry}
        disabled={sync.refreshing}
        className="touch-hit relative inline-flex flex-none items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-500/25 active:scale-95 disabled:opacity-60"
      >
        {sync.refreshing && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.4} aria-hidden="true" />}
        {sync.refreshing ? 'Memuat...' : 'Coba lagi'}
      </button>
    </div>
  );
}
