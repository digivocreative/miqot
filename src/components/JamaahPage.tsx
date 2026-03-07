import { useState } from 'react';
import { Eye, EyeOff, LogIn, Loader2, User, Lock, ExternalLink, CheckCircle2, LogOut, RefreshCw } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

interface SessionData {
  sessionId: string;
  title?: string;
  tables?: { headers: string[]; rows: Record<string, string>[] }[];
  links?: { href: string; text: string }[];
}

export default function JamaahPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<ConnectionState>('idle');
  const [error, setError] = useState('');
  const [session, setSession] = useState<SessionData | null>(null);
  const [fetchingData, setFetchingData] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Username dan password wajib diisi');
      return;
    }

    setState('connecting');

    try {
      const res = await fetch('/api/jamaah/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Gagal terhubung');
        setState('error');
        return;
      }

      setState('connected');
      setSession({ sessionId: data.sessionId });
      setPassword(''); // Clear password from memory

      // Auto-fetch initial data
      await fetchData(data.sessionId, '/');
    } catch {
      setError('Gagal menghubungi server');
      setState('error');
    }
  };

  const fetchData = async (sessionId: string, path: string) => {
    setFetchingData(true);
    try {
      const res = await fetch('/api/jamaah/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ sessionId, path }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.error?.includes('kedaluwarsa')) {
          setState('idle');
          setSession(null);
          setError('Session kedaluwarsa, silakan login ulang');
        } else {
          setError(data.error || 'Gagal mengambil data');
        }
        setFetchingData(false);
        return;
      }

      setSession(prev => prev ? {
        ...prev,
        title: data.title,
        tables: data.tables,
        links: data.links,
      } : null);

    } catch {
      setError('Gagal menghubungi server');
    }
    setFetchingData(false);
  };

  const handleDisconnect = async () => {
    if (!session?.sessionId) return;
    try {
      await fetch('/api/jamaah/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
    } catch { /* ignore */ }
    setState('idle');
    setSession(null);
    setError('');
    setUsername('');
  };

  const handleNavigate = (path: string) => {
    if (!session?.sessionId) return;
    fetchData(session.sessionId, path);
  };

  // ── Connected View ──
  if (state === 'connected' && session) {
    return (
      <div className="px-4 pt-4 pb-8 space-y-4">
        {/* Session bar */}
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Terhubung sebagai {username}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => session.sessionId && fetchData(session.sessionId, '/')}
              disabled={fetchingData}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-800/30 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={fetchingData ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut size={12} /> Disconnect
            </button>
          </div>
        </div>

        {/* Loading */}
        {fetchingData && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-emerald-500" />
            <span className="ml-2 text-sm text-gray-500">Mengambil data...</span>
          </div>
        )}

        {/* Navigation links */}
        {session.links && session.links.length > 0 && !fetchingData && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50">
              <h3 className="text-xs font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wide">Menu</h3>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {session.links.filter(l => l.text && l.href.startsWith('/')).slice(0, 20).map((link, i) => (
                <button
                  key={i}
                  onClick={() => handleNavigate(link.href)}
                  className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between"
                >
                  <span>{link.text}</span>
                  <ExternalLink size={12} className="text-gray-300 dark:text-slate-600" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Data tables */}
        {session.tables && session.tables.length > 0 && !fetchingData && (
          session.tables.map((table, ti) => (
            <div key={ti} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-slate-700/50">
                      {table.headers.map((h, hi) => (
                        <th key={hi} className="px-3 py-2.5 text-left font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-gray-50 dark:border-slate-700/50 hover:bg-gray-50/50 dark:hover:bg-slate-700/30">
                        {table.headers.map((h, ci) => (
                          <td key={ci} className="px-3 py-2 text-gray-700 dark:text-slate-300 whitespace-nowrap">{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 text-[10px] text-gray-400 dark:text-slate-500 border-t border-gray-50 dark:border-slate-700/50">
                {table.rows.length} baris data
              </div>
            </div>
          ))
        )}

        {/* No data */}
        {!fetchingData && (!session.tables || session.tables.length === 0) && (!session.links || session.links.length === 0) && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400 dark:text-slate-500">Tidak ada data untuk ditampilkan</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium text-center">
            {error}
          </div>
        )}
      </div>
    );
  }

  // ── Login Form ──
  return (
    <div className="px-4 pt-4 pb-8">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Header info */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-slate-700/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center border border-amber-100 dark:border-amber-800/40">
              <ExternalLink size={14} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800 dark:text-white">Sistem Jamaah Alhijaz</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500">jadwal.alhijaz.co</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
            Masukkan kredensial untuk terhubung ke sistem internal.
          </p>
        </div>

        <form onSubmit={handleConnect} className="p-5 space-y-4">
          {/* Username */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <User size={12} /> Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              placeholder="Masukkan username"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={state === 'connecting'}
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50"
            />
          </div>

          {/* Password */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Lock size={12} /> Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Masukkan password"
                disabled={state === 'connecting'}
                className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center justify-center gap-1.5 py-2">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-xs font-medium text-red-500">{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={state === 'connecting'}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
          >
            {state === 'connecting' ? (
              <><Loader2 size={16} className="animate-spin" /> Menghubungkan...</>
            ) : (
              <><LogIn size={16} /> Hubungkan</>
            )}
          </button>

          {/* Connecting info */}
          {state === 'connecting' && (
            <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center">
              Browser sedang login ke sistem internal, mohon tunggu...
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
