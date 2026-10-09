import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Check, ChevronDown, Clock, Code2, Copy, KeyRound, Link2, Loader2, Lock, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { getAuthHeaders } from '../lib/authSession';
import { trackEvent } from '../utils/analytics';
import SegmentedControl from './common/SegmentedControl';

interface KeyStatus {
  hasKey: boolean;
  createdAt: string | null;
  // null = kunci ada tapi asisten belum pernah memakainya — jangan klaim "Tersambung"
  lastUsedAt: string | null;
}

// Aplikasi AI yang tersambung lewat login OAuth (mcp-oauth.js).
interface Connection {
  id: string;
  name: string;
  host: string;
  createdAt: string;
  lastUsedAt: string | null;
}

type ClientTab = 'claude' | 'chatgpt';

// Langkah per aplikasi — label menu mengikuti UI berbahasa Inggris (yang paling
// umum dipakai), padanan Indonesia di dalam kurung. Cek ulang bila vendor
// mengganti menu (terakhir dicek 9 Okt 2026).
const SETUP: Record<ClientTab, { steps: ReactNode[]; note: string }> = {
  claude: {
    steps: [
      <>Buka <b>claude.ai</b> → <b>Customize</b> (Sesuaikan) → <b>Connectors</b> (Konektor)</>,
      <>Klik <b>+</b> → <b>Add custom connector</b> (Tambahkan konektor khusus)</>,
      <>Isi nama <b>Alhijaz</b> dan alamat server di atas, biarkan pengaturan lain → <b>Continue</b> / <b>Add</b></>,
      <>Klik <b>Connect</b>, masuk dengan username &amp; password Alhijaz → <b>Masuk &amp; Izinkan</b></>,
    ],
    note: 'Tambahkan dari claude.ai di browser atau aplikasi desktop — setelah itu ikut bisa dipakai di aplikasi HP.',
  },
  chatgpt: {
    steps: [
      <>Buka <b>chatgpt.com/plugins</b> → <b>+</b> → <b>Add custom MCP server</b></>,
      <>Isi nama <b>Alhijaz</b> dan <b>Server URL</b> dengan alamat di atas</>,
      <>Pilih autentikasi <b>OAuth</b> → <b>Create</b></>,
      <>Masuk dengan username &amp; password Alhijaz → <b>Masuk &amp; Izinkan</b></>,
    ],
    note: 'Butuh ChatGPT berbayar dengan Developer mode. Nama menu bisa sedikit berbeda.',
  },
};

const CLIENT_OPTIONS: { value: ClientTab; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'chatgpt', label: 'ChatGPT' },
];

// Untuk pengguna non-teknis: contoh pertanyaan jauh lebih mudah dipahami
// daripada daftar nama tool. 8 tool MCP terdokumentasi di project-summary §7.
const EXAMPLE_QUESTIONS: { emoji: string; text: string }[] = [
  { emoji: '💰', text: 'Siapa jamaah saya yang belum lunas?' },
  { emoji: '📅', text: 'Paket bulan Juli yang masih ada seat apa saja?' },
  { emoji: '🧮', text: 'Hitung harga 2 dewasa + 1 anak paket RAHMAH' },
  { emoji: '🖼️', text: 'Minta brosur & itinerary paketnya' },
  { emoji: '🧕', text: 'Siapa Tour Leader keberangkatan kloter 171?' },
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

const serverUrl = () => `${window.location.origin}/mcp`;

// Format .mcp.json Claude Code (Cursor membaca bentuk yang sama).
function buildConfigSnippet(key: string): string {
  return JSON.stringify({
    mcpServers: {
      alhijaz: {
        type: 'http',
        url: serverUrl(),
        headers: { Authorization: `Bearer ${key}` },
      },
    },
  }, null, 2);
}

function buildClaudeCodeCommand(key: string): string {
  return `claude mcp add --transport http alhijaz ${serverUrl()} --header "Authorization: Bearer ${key}"`;
}

type CopyTarget = 'key' | 'url' | 'config' | 'command' | 'server';

export default function McpIntegrationPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [client, setClient] = useState<ClientTab>('claude');
  const [devOpen, setDevOpen] = useState(false);
  // Key hanya tersedia sekali — dari response generate/rotate, tidak pernah dari GET.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [confirmAction, setConfirmAction] = useState<'rotate' | 'revoke' | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current) { trackEvent('feature', 'open_mcp_integration'); tracked.current = true; }
  }, []);

  useEffect(() => {
    const headers = getAuthHeaders();
    Promise.all([
      fetch('/api/mcp-key', { headers })
        .then(r => r.json())
        .then(d => { if (d.success) setStatus({ hasKey: d.hasKey, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt ?? null }); })
        .catch(() => {}),
      fetch('/api/mcp-oauth/connections', { headers })
        .then(r => r.json())
        .then(d => { if (d.success) setConnections(d.connections || []); })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Developer yang sudah punya kunci langsung melihat bagiannya terbuka.
  useEffect(() => {
    if (status?.hasKey) setDevOpen(true);
  }, [status?.hasKey]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const copyText = async (text: string, which: CopyTarget) => {
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
    try {
      const r = await fetch('/api/mcp-key', { method: 'POST', headers: getAuthHeaders() });
      const d = await r.json();
      if (!d.success || !d.key) throw new Error(d.error || 'Gagal membuat kunci');
      setFreshKey(d.key);
      setStatus({ hasKey: true, createdAt: new Date().toISOString(), lastUsedAt: null });
      trackEvent('action', 'mcp_generate_key');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal membuat kunci');
    } finally {
      setBusy(false);
      // Baru tutup panel konfirmasi SETELAH fetch selesai — kalau direset di awal,
      // panel unmount dan feedback "Memproses…" tidak pernah terlihat.
      setConfirmAction(null);
    }
  };

  const revokeKey = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/mcp-key', { method: 'DELETE', headers: getAuthHeaders() });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Gagal memutuskan');
      setFreshKey(null);
      setStatus({ hasKey: false, createdAt: null, lastUsedAt: null });
      showToast('Kunci dicabut');
      trackEvent('action', 'mcp_revoke_key');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal memutuskan');
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const disconnect = async (id: string) => {
    setDisconnecting(id);
    try {
      const r = await fetch(`/api/mcp-oauth/connections/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Gagal memutuskan');
      setConnections(list => list.filter(c => c.id !== id));
      showToast('Sambungan diputus');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal memutuskan');
    } finally {
      setDisconnecting(null);
      setConfirmDisconnect(null);
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

  const setup = SETUP[client];
  const copyIcon = (which: CopyTarget) => (copied === which ? <Check size={14} /> : <Copy size={14} />);

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
              Tanya data jamaah &amp; paketmu langsung dari Claude atau ChatGPT.
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

      {/* Sambungkan — jalur utama untuk agent: URL + login */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 px-1">Sambungkan</div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">Alamat server</p>
              <p className="text-[13px] font-mono font-semibold text-gray-800 dark:text-slate-100 truncate">{serverUrl()}</p>
            </div>
            <button
              onClick={() => copyText(serverUrl(), 'server')}
              className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold transition-all active:scale-95"
            >
              {copyIcon('server')} {copied === 'server' ? 'Tersalin' : 'Salin'}
            </button>
          </div>

          <SegmentedControl options={CLIENT_OPTIONS} value={client} onChange={setClient} accent="teal" />

          <ol className="space-y-2.5">
            {setup.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 mt-px rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <p className="text-xs leading-relaxed text-gray-600 dark:text-slate-300 [&_b]:font-semibold [&_b]:text-gray-800 dark:[&_b]:text-white">{step}</p>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-gray-400 dark:text-slate-500">{setup.note}</p>

          {connections.length > 0 && (
            <div className="border-t border-gray-50 dark:border-slate-700/60 pt-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">Tersambung</p>
              {connections.map(c => (
                <div key={c.id} className="rounded-xl border border-gray-100 dark:border-slate-700 px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                      <Link2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500">
                        {c.lastUsedAt ? `terakhir aktif ${waktuRelatif(c.lastUsedAt)}` : `tersambung ${formatTanggal(c.createdAt)}`}
                      </p>
                    </div>
                    {confirmDisconnect !== c.id && (
                      <button
                        onClick={() => setConfirmDisconnect(c.id)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Putuskan
                      </button>
                    )}
                  </div>
                  {confirmDisconnect === c.id && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <p className="flex-1 text-[11px] text-amber-600 dark:text-amber-400">{c.name} tidak bisa lagi membaca datamu.</p>
                      <button
                        onClick={() => disconnect(c.id)}
                        disabled={disconnecting === c.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 disabled:opacity-50"
                      >
                        {disconnecting === c.id ? <Loader2 size={13} className="animate-spin" /> : null} Ya
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect(null)}
                        disabled={disconnecting === c.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 transition-all active:scale-95 disabled:opacity-50"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
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

      {/* Developer — kunci akses statis untuk Claude Code, Cursor, API */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
        <button
          onClick={() => setDevOpen(o => !o)}
          aria-expanded={devOpen}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
        >
          <Code2 size={16} className="text-gray-400 dark:text-slate-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-700 dark:text-slate-200">Untuk developer</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500">Kunci akses untuk Claude Code, Cursor, atau API</p>
          </div>
          <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${devOpen ? 'rotate-180' : ''}`} />
        </button>

        {devOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-50 dark:border-slate-700/60 pt-3">
            {!status?.hasKey && !freshKey && (
              <button
                onClick={generateKey}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white shadow-md shadow-teal-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {busy ? 'Membuat…' : 'Buat Kunci Akses'}
              </button>
            )}

            {status?.hasKey && !freshKey && (
              <>
                {status.lastUsedAt ? (
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl p-3 flex items-center gap-2.5">
                    <ShieldCheck size={18} className="text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Kunci dipakai</p>
                      <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">terakhir aktif {waktuRelatif(status.lastUsedAt)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-800/30 rounded-xl p-3 flex items-center gap-2.5">
                    <Clock size={18} className="text-blue-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-300">Kunci aktif — belum pernah dipakai</p>
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
                          : 'Aplikasi yang memakai kunci ini tidak bisa lagi membaca datamu. Lanjut?'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={confirmAction === 'rotate' ? generateKey : revokeKey}
                        disabled={busy}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50"
                      >
                        {busy ? <><Loader2 size={14} className="animate-spin" /> Memproses…</> : 'Ya, lanjut'}
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
                      disabled={busy}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-600 text-white shadow-md shadow-teal-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Buat Kunci Baru
                    </button>
                    <button
                      onClick={() => setConfirmAction('revoke')}
                      disabled={busy}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-200 active:scale-95 disabled:opacity-50"
                    >
                      <Trash2 size={14} /> Cabut Kunci
                    </button>
                  </div>
                )}
              </>
            )}

            {freshKey && (
              <>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-xl px-3 py-2 flex items-center gap-2">
                  <TriangleAlert size={13} className="text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">Kunci hanya muncul sekali — salin sekarang. Jangan bagikan ke siapa pun.</p>
                </div>

                <div className="border border-gray-100 dark:border-slate-700 rounded-xl divide-y divide-gray-50 dark:divide-slate-700/60">
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
                      {copyIcon('key')}
                    </button>
                  </div>
                  <div className="px-3 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">Perintah Claude Code</p>
                      <p className="text-[11px] font-mono text-gray-700 dark:text-slate-300 truncate">{buildClaudeCodeCommand(freshKey)}</p>
                    </div>
                    <button
                      onClick={() => copyText(buildClaudeCodeCommand(freshKey), 'command')}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-all active:scale-95"
                      aria-label="Salin perintah Claude Code"
                    >
                      {copyIcon('command')}
                    </button>
                  </div>
                  <div className="px-3 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">Config JSON (.mcp.json / Cursor)</p>
                      <p className="text-[11px] font-mono text-gray-700 dark:text-slate-300 truncate">{'{ "mcpServers": { "alhijaz": … } }'}</p>
                    </div>
                    <button
                      onClick={() => copyText(buildConfigSnippet(freshKey), 'config')}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-all active:scale-95"
                      aria-label="Salin config JSON"
                    >
                      {copyIcon('config')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[10000] bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
