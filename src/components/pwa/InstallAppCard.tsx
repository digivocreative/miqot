import { useMemo, useState, useSyncExternalStore } from 'react';
import { Download, Loader2, Share, SquarePlus, X } from 'lucide-react';
import { detectInstallPlatform, getInstallPromptStore } from '../../lib/pwa/installPrompt';
import { isStandaloneDisplay } from '../../lib/pwa/launch';

// Kartu ajakan pasang aplikasi di beranda dashboard.
//
// Tampil hanya bila: bukan app terpasang (display-mode standalone), belum terpasang
// (appinstalled), dan tidak ditutup dalam 30 hari terakhir. Android/desktop butuh event
// beforeinstallprompt yang sudah ditangkap (canPrompt) — tanpa itu tombolnya tak bisa
// berbuat apa-apa, jadi kartunya disembunyikan. iOS tidak punya event itu: kartu
// menampilkan langkah Bagikan → Tambahkan ke Layar Utama.

export const INSTALL_CARD_DISMISSED_KEY = 'pwa-install-card-dismissed-at';
export const INSTALL_CARD_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

function readDismissedAt(): number {
  try {
    const value = Number(window.localStorage.getItem(INSTALL_CARD_DISMISSED_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeDismissedAt(value: number): void {
  try {
    window.localStorage.setItem(INSTALL_CARD_DISMISSED_KEY, String(value));
  } catch {
    // Penyimpanan diblokir (mode privat): kartu tetap tertutup selama sesi ini.
  }
}

export default function InstallAppCard() {
  const store = useMemo(() => getInstallPromptStore(), []);
  const install = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const platform = useMemo(
    () => detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints || 0),
    [],
  );
  const [standalone] = useState(isStandaloneDisplay);
  const [snoozed, setSnoozed] = useState(() => {
    const dismissedAt = readDismissedAt();
    return dismissedAt > 0 && Date.now() - dismissedAt < INSTALL_CARD_SNOOZE_MS;
  });
  const [prompting, setPrompting] = useState(false);

  const isIos = platform === 'ios';
  if (standalone || install.installed || snoozed) return null;
  if (!isIos && !install.canPrompt && !prompting) return null;

  const dismiss = () => {
    writeDismissedAt(Date.now());
    setSnoozed(true);
  };

  const handleInstall = async () => {
    if (prompting) return;
    setPrompting(true);
    try {
      const outcome = await store.promptInstall();
      // Prompt bawaan ditolak = pilihan pengguna; jangan tawarkan lagi 30 hari ke depan.
      if (outcome === 'dismissed') dismiss();
    } catch {
      // Prompt gagal tampil — event sudah terpakai, kartu hilang sendiri (canPrompt=false).
    } finally {
      setPrompting(false);
    }
  };

  return (
    <section
      aria-label="Pasang aplikasi"
      className="mb-4 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-start gap-3">
        <img
          src="/icon-192x192.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-xl border border-gray-100 dark:border-slate-700"
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-bold text-gray-800 dark:text-white">
            {isIos ? 'Pasang Alhijaz di layar utama' : 'Pasang Alhijaz sebagai aplikasi'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
            Buka lebih cepat, dan data terakhir tetap bisa dilihat saat sinyal hilang.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Tutup ajakan pasang aplikasi"
          title="Nanti saja"
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          <X size={18} />
        </button>
      </div>

      {isIos ? (
        <ol className="mt-3 space-y-2 rounded-xl bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600 dark:bg-slate-900 dark:text-slate-300">
          <li className="flex gap-2">
            <span className="w-3 shrink-0 font-bold text-emerald-600 dark:text-emerald-400">1</span>
            <span>
              Ketuk <strong className="font-semibold text-gray-800 dark:text-white">Bagikan</strong>{' '}
              <Share size={13} className="inline -mt-0.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />{' '}
              (ikon kotak dengan panah). Tidak terlihat? Ketuk <strong className="font-semibold text-gray-800 dark:text-white">⋯</strong> dulu.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="w-3 shrink-0 font-bold text-emerald-600 dark:text-emerald-400">2</span>
            <span>
              Pilih <strong className="font-semibold text-gray-800 dark:text-white">Tambahkan ke Layar Utama</strong>{' '}
              <SquarePlus size={13} className="inline -mt-0.5" aria-hidden="true" /> — gulir ke bawah atau ketuk{' '}
              <strong className="font-semibold text-gray-800 dark:text-white">Lihat Lainnya</strong> bila belum tampil.
            </span>
          </li>
        </ol>
      ) : (
        <button
          type="button"
          onClick={handleInstall}
          disabled={prompting}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-70"
        >
          {prompting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Pasang aplikasi
        </button>
      )}
    </section>
  );
}
