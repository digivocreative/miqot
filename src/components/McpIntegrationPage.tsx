import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Copy, KeyRound, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';

interface KeyStatus {
  hasKey: boolean;
  createdAt: string | null;
}

const TOOL_DOCS: { name: string; desc: string }[] = [
  { name: 'list_jamaah', desc: 'Daftar jamaah — filter status bayar, window keberangkatan, atau cari nama/booking/WA' },
  { name: 'get_jamaah', desc: 'Detail satu jamaah + anggota lain dalam booking yang sama' },
  { name: 'jamaah_birthdays', desc: 'Jamaah yang berulang tahun 7–90 hari ke depan' },
  { name: 'payment_summary', desc: 'Ringkasan pembayaran: total outstanding & breakdown per bulan keberangkatan' },
];

function formatTanggal(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
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
  const [copied, setCopied] = useState<'key' | 'config' | null>(null);
  const [confirmAction, setConfirmAction] = useState<'rotate' | 'revoke' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current) { trackEvent('feature', 'open_mcp_integration'); tracked.current = true; }
  }, []);

  useEffect(() => {
    fetch('/api/mcp-key', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setStatus({ hasKey: d.hasKey, createdAt: d.createdAt }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const copyText = async (text: string, which: 'key' | 'config') => {
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
      if (!d.success || !d.key) throw new Error(d.error || 'Gagal membuat key');
      setFreshKey(d.key);
      setStatus({ hasKey: true, createdAt: new Date().toISOString() });
      trackEvent('action', 'mcp_generate_key');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal membuat key');
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
      if (!d.success) throw new Error(d.error || 'Gagal mencabut key');
      setFreshKey(null);
      setStatus({ hasKey: false, createdAt: null });
      showToast('API key dicabut — akses asisten AI dimatikan');
      trackEvent('action', 'mcp_revoke_key');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal mencabut key');
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
      {/* Intro */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center shrink-0">
            <Bot size={20} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">Hubungkan Asisten AI Pribadimu</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 leading-relaxed">
              Punya asisten AI sendiri (hermes, OpenClaw, Claude, atau agent lain yang mendukung MCP)?
              Hubungkan ke data jamaahmu — asisten bisa mengecek status pembayaran, jadwal keberangkatan,
              sampai ulang tahun jamaah. <span className="font-semibold text-gray-500 dark:text-slate-400">Hanya baca data milikmu sendiri, tidak bisa mengubah apa pun.</span>
            </p>
          </div>
        </div>
      </div>

      {/* Key management */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 px-1">API Key</div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4 space-y-3">
          {!status?.hasKey && !freshKey && (
            <>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Belum ada API key. Buat key untuk mulai menghubungkan asisten AI-mu.
              </p>
              <button
                onClick={generateKey}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white shadow-md shadow-teal-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50"
              >
                <KeyRound size={16} />
                {busy ? 'Membuat…' : 'Buat API Key'}
              </button>
            </>
          )}

          {status?.hasKey && !freshKey && (
            <>
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
                <p className="text-xs text-gray-600 dark:text-slate-300">
                  Key aktif{status.createdAt ? ` sejak ${formatTanggal(status.createdAt)}` : ''}.
                  Key hanya ditampilkan sekali saat dibuat — kalau hilang, buat ulang (rotate).
                </p>
              </div>
              {confirmAction ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <TriangleAlert size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {confirmAction === 'rotate'
                        ? 'Key lama langsung mati — asisten yang masih memakai key lama harus diupdate. Lanjutkan?'
                        : 'Akses semua asisten AI ke datamu akan dimatikan. Lanjutkan?'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={confirmAction === 'rotate' ? generateKey : revokeKey}
                      disabled={busy}
                      className="flex-1 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50"
                    >
                      {busy ? 'Memproses…' : 'Ya, lanjutkan'}
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
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-600 text-white shadow-md shadow-teal-500/20 transition-all duration-200 active:scale-95"
                  >
                    <RefreshCw size={14} /> Rotate Key
                  </button>
                  <button
                    onClick={() => setConfirmAction('revoke')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-200 active:scale-95"
                  >
                    <Trash2 size={14} /> Cabut Key
                  </button>
                </div>
              )}
            </>
          )}

          {freshKey && (
            <>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-3">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
                  ✅ Key berhasil dibuat — salin SEKARANG, tidak akan ditampilkan lagi.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <code className="flex-1 text-[10px] font-mono bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/40 rounded-lg px-2 py-2 break-all text-gray-700 dark:text-slate-300">
                    {freshKey}
                  </code>
                  <button
                    onClick={() => copyText(freshKey, 'key')}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95"
                    aria-label="Salin key"
                  >
                    {copied === 'key' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">Config untuk asisten AI-mu</span>
                  <button
                    onClick={() => copyText(buildConfigSnippet(freshKey), 'config')}
                    className="flex items-center gap-1 text-[10px] font-semibold text-teal-600 dark:text-teal-400"
                  >
                    {copied === 'config' ? <Check size={12} /> : <Copy size={12} />}
                    {copied === 'config' ? 'Tersalin' : 'Salin config'}
                  </button>
                </div>
                <pre className="text-[10px] font-mono bg-gray-900 dark:bg-slate-950 text-emerald-300 rounded-xl p-3 overflow-x-auto leading-relaxed">
                  {buildConfigSnippet(freshKey)}
                </pre>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5">
                  Tempel ke konfigurasi MCP server di asisten AI-mu (hermes/OpenClaw: file config MCP; Claude Desktop: <code>claude_desktop_config.json</code>).
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tool docs */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 px-1">Yang Bisa Diakses Asisten</div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm divide-y divide-gray-50 dark:divide-slate-700/60">
          {TOOL_DOCS.map(tool => (
            <div key={tool.name} className="p-3.5">
              <code className="text-[11px] font-mono font-semibold text-teal-600 dark:text-teal-400">{tool.name}</code>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{tool.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-100 dark:border-slate-700 p-4">
        <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed">
          🔒 Asisten hanya bisa <span className="font-semibold">membaca</span> data jamaah milikmu sendiri — tidak bisa mengubah, dan tidak bisa melihat data agent lain.
          Batas 30 request/menit. Data adalah snapshot hasil sync (bukan real-time) — selalu cek <code>synced_at</code>.
          Jangan bagikan API key ke siapa pun; key = akses penuh baca data jamaahmu.
        </p>
      </div>

      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[10000] bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
