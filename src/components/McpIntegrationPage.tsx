import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Clock, Copy, KeyRound, Lock, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';

interface KeyStatus {
  hasKey: boolean;
  createdAt: string | null;
  // null = kunci ada tapi asisten belum pernah memakainya — jangan klaim "Tersambung"
  lastUsedAt: string | null;
}

// Untuk pengguna non-teknis: contoh pertanyaan jauh lebih mudah dipahami
// daripada daftar nama tool. 8 tool MCP terdokumentasi di project-summary §7.
const EXAMPLE_QUESTIONS: { emoji: string; text: string }[] = [
  { emoji: '💰', text: 'Siapa jamaah saya yang belum lunas?' },
  { emoji: '📅', text: 'Paket bulan Juli yang masih ada seat apa saja?' },
  { emoji: '🧮', text: 'Hitung harga 2 dewasa + 1 anak paket RAHMAH' },
  { emoji: '🖼️', text: 'Minta brosur & itinerary paketnya' },
  { emoji: '🧕', text: 'Siapa Tour Leader keberangkatan grup 171?' },
  { emoji: '🎂', text: 'Siapa jamaah yang ulang tahun minggu ini?' },
];

function formatTanggal(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function waktuRelatif(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return formatTanggal(iso);
  const menit = Math.floor(ms / 60000);
  if (menit < 2) return 'baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 30) return `${hari} hari lalu`;
  return formatTanggal(iso);
}

function buildConfigSnippet(key: string): string {
  return JSON.stringify({
    miqot: {
      url: `${window.location.origin}/mcp`,
      headers: { Authorization: `Bearer ${key}` },
    },
  }, null, 2);
}

export default function McpIntegrationPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Key hanya tersedia sekali — dari response generate/rotate, tidak pernah dari GET.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<'key' | 'url' | 'config' | null>(null);
  const [confirmAction, setConfirmAction] = useState<'rotate' | 'revoke' | null>(null);
  // Isi lengkap (JSON) muncul otomatis SETELAH "Salin Pengaturan" diklik —
  // umpan balik "ini yang barusan tersalin".
  const [showCopiedContent, setShowCopiedContent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current) { trackEvent('feature', 'open_mcp_integration'); tracked.current = true; }
  }, []);

  useEffect(() => {
    fetch('/api/mcp-key', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setStatus({ hasKey: d.hasKey, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt ?? null }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const copyText = async (text: string, which: 'key' | 'url' | 'config') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      showToast('Gagal menyalin — salin manual');
    }
  };

  const generateKey = async () => {
    setBusy(true);
    setConfirmAction(null);
    try {
      const r = await fetch('/api/mcp-key', { method: 'POST', headers: getAuthHeaders() });
      const d = await r.json();
      if (!d.success || !d.key) throw new Error(d.error || 'Gagal membuat kunci');
      setFreshKey(d.key);
      setShowCopiedContent(false);
      setStatus({ hasKey: true, createdAt: new Date().toISOString(), lastUsedAt: null });
      trackEvent('action', 'mcp_generate_key');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal membuat kunci');
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async () => {
    setBusy(true);
    setConfirmAction(null);
    try {
      const r = await fetch('/api/mcp-key', { method: 'DELETE', headers: getAuthHeaders() });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Gagal memutuskan');
      setFreshKey(null);
      setStatus({ hasKey: false, createdAt: null, lastUsedAt: null });
      showToast('Sambungan diputus');
      trackEvent('action', 'mcp_revoke_key');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal memutuskan');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 pt-4 pb-8 space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded-md w-1/2 mb-3" />
            <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded-md w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      {/* Intro — singkat + 3 chip jaminan */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center shrink-0">
            <Bot size={20} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">Asisten AI Pribadi</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Sambungkan asisten AI-mu ke data jamaah & paket.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
            <ShieldCheck size={11} /> Hanya membaca
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
            <Lock size={11} /> Hanya data milikmu
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
            <Trash2 size={11} /> Bisa diputus kapan saja
          </span>
        </div>
      </div>

      {/* Kunci akses */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 px-1">Kunci Akses</div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4 space-y-3">
          {!status?.hasKey && !freshKey && (
            <>
              <p className="text-xs text-gray-500 dark:text-slate-400">Belum tersambung.</p>
              <button
                onClick={generateKey}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white shadow-md shadow-teal-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50"
              >
                <KeyRound size={16} />
                {busy ? 'Membuat…' : 'Buat Kunci Akses'}
              </button>
            </>
          )}

          {status?.hasKey && !freshKey && (
            <>
              {status.lastUsedAt ? (
                // Asisten benar-benar pernah memakai kunci → boleh klaim tersambung
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl p-3 flex items-center gap-2.5">
                  <ShieldCheck size={18} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Tersambung</p>
                    <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">asisten terakhir aktif {waktuRelatif(status.lastUsedAt)}</p>
                  </div>
                </div>
              ) : (
                // Kunci ada, tapi belum ada asisten yang memakainya
                <div className="bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-800/30 rounded-xl p-3 flex items-center gap-2.5">
                  <Clock size={18} className="text-blue-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-blue-700 dark:text-blue-300">Kunci aktif — asisten belum tersambung</p>
                    <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80">
                      dibuat {formatTanggal(status.createdAt)} · kalau kunci hilang, buat kunci baru
                    </p>
                  </div>
                </div>
              )}
              {confirmAction ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <TriangleAlert size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {confirmAction === 'rotate'
                        ? 'Kunci lama langsung tidak berlaku. Lanjut?'
                        : 'Asisten AI tidak bisa lagi membaca datamu. Lanjut?'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={confirmAction === 'rotate' ? generateKey : revokeKey}
                      disabled={busy}
                      className="flex-1 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50"
                    >
                      {busy ? 'Memproses…' : 'Ya, lanjut'}
                    </button>
                    <button
                      onClick={() => setConfirmAction(null)}
                      disabled={busy}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-all duration-200 active:scale-95 disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmAction('rotate')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-600 text-white shadow-md shadow-teal-500/20 transition-all duration-200 active:scale-95"
                  >
                    <RefreshCw size={14} /> Buat Kunci Baru
                  </button>
                  <button
                    onClick={() => setConfirmAction('revoke')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-200 active:scale-95"
                  >
                    <Trash2 size={14} /> Putuskan
                  </button>
                </div>
              )}
            </>
          )}

          {freshKey && (
            <>
              {/* Langkah 1 — salin pengaturan (CTA utama) */}
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-teal-500 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Salin pengaturan ini</p>
              </div>
              <button
                onClick={() => { copyText(buildConfigSnippet(freshKey), 'config'); setShowCopiedContent(true); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white shadow-md shadow-teal-500/20 transition-all duration-200 active:scale-95"
              >
                {copied === 'config' ? <Check size={16} /> : <Copy size={16} />}
                {copied === 'config' ? 'Tersalin ✓' : 'Salin Pengaturan'}
              </button>

              {/* Umpan balik: isi yang barusan tersalin */}
              {showCopiedContent && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1.5 flex items-center gap-1">
                    <Check size={11} /> Isi yang tersalin
                  </p>
                  <pre className="text-[10px] font-mono bg-gray-900 dark:bg-slate-950 text-emerald-300 rounded-lg p-2.5 overflow-x-auto leading-relaxed">
                    {buildConfigSnippet(freshKey)}
                  </pre>
                </div>
              )}

              {/* Langkah 2 — tempel di asisten */}
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-teal-500 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Tempel di aplikasi asisten AI-mu. Selesai!</p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-xl px-3 py-2 flex items-center gap-2">
                <TriangleAlert size={13} className="text-amber-500 shrink-0" />
                <p className="text-[11px] text-amber-600 dark:text-amber-400">Hanya muncul sekali — salin sekarang.</p>
              </div>

              {/* Rincian — selalu tampil, bisa disalin per bagian */}
              <div className="border border-gray-100 dark:border-slate-700 rounded-xl divide-y divide-gray-50 dark:divide-slate-700/60">
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">Alamat server</p>
                    <p className="text-[11px] font-mono text-gray-700 dark:text-slate-300 truncate">{`${window.location.origin}/mcp`}</p>
                  </div>
                  <button
                    onClick={() => copyText(`${window.location.origin}/mcp`, 'url')}
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-all active:scale-95"
                    aria-label="Salin alamat server"
                  >
                    {copied === 'url' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">Kunci akses</p>
                    <p className="text-[11px] font-mono text-gray-700 dark:text-slate-300 break-all">{freshKey}</p>
                  </div>
                  <button
                    onClick={() => copyText(freshKey, 'key')}
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-all active:scale-95"
                    aria-label="Salin kunci akses"
                  >
                    {copied === 'key' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Contoh pertanyaan — pengganti daftar tool teknis */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 px-1">Contoh yang Bisa Ditanyakan</div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm divide-y divide-gray-50 dark:divide-slate-700/60">
          {EXAMPLE_QUESTIONS.map(q => (
            <div key={q.text} className="px-4 py-3 flex items-center gap-3">
              <span className="text-base shrink-0">{q.emoji}</span>
              <p className="text-xs text-gray-600 dark:text-slate-300">“{q.text}”</p>
            </div>
          ))}
        </div>
      </div>

      {/* Catatan — 1 baris saja */}
      <div className="bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-100 dark:border-slate-700 px-4 py-3 flex items-center gap-2.5">
        <Lock size={14} className="text-gray-400 dark:text-slate-500 shrink-0" />
        <p className="text-[11px] text-gray-400 dark:text-slate-500">Jangan bagikan kunci ke siapa pun.</p>
      </div>

      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[10000] bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
